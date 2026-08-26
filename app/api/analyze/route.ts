import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  AnalysisValidationError,
  processAnalysis,
  stampSourceAccessTimes,
} from "../../../lib/analysis-engine";
import { saveAnalysisHistory } from "../../../lib/analysis-history";
import { researchFrameworkPrompt } from "../../../lib/research-framework";

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_CODEX_TIMEOUT_MS = 3_600_000;
const CODEX_PROGRESS_INTERVAL_MS = 60_000;
const RESPONSE_KEEPALIVE_INTERVAL_MS = 15_000;
const REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);
const ANALYSIS_STEP_COUNT = 8;
let researchInProgress = false;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logAnalysisStep(
  requestId: string,
  ticker: string,
  step: number,
  phase: string,
  description: string,
  details: JsonRecord = {},
) {
  console.info(`Analysis step ${step}/${ANALYSIS_STEP_COUNT}: ${description}`, {
    requestId,
    ticker,
    step,
    totalSteps: ANALYSIS_STEP_COUNT,
    phase,
    ...details,
  });
}

function codexEventItem(event: JsonRecord): JsonRecord | null {
  return isRecord(event.item) ? event.item : null;
}

function codexSearchQuery(item: JsonRecord): string | null {
  if (typeof item.query === "string") return item.query;
  if (isRecord(item.action) && typeof item.action.query === "string") return item.action.query;
  return null;
}

class CodexTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Codex research timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    this.name = "CodexTimeoutError";
  }
}

function codexTimeoutMs(): number {
  const configured = Number(process.env.CODEX_TIMEOUT_MS ?? DEFAULT_CODEX_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_CODEX_TIMEOUT_MS;
}

function codexReasoningEffort(): string {
  const configured = process.env.CODEX_REASONING_EFFORT?.trim().toLowerCase() ?? "low";
  return REASONING_EFFORTS.has(configured) ? configured : "low";
}

function codexEnvironment(): NodeJS.ProcessEnv {
  const allowed = [
    "PATH",
    "CODEX_HOME",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
  ];
  const environment: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV ?? "production" };
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function summarizeAnalysisOutput(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { outputType: Array.isArray(value) ? "array" : typeof value };
  }
  const analysis = value as Record<string, unknown>;
  return {
    outputType: "object",
    modelTicker: typeof analysis.ticker === "string" ? analysis.ticker : null,
    company: typeof analysis.company === "string" ? analysis.company : null,
    priceAsOf: typeof analysis.priceAsOf === "string" ? analysis.priceAsOf : null,
    fxRateAsOf: typeof analysis.fxRateAsOf === "string" ? analysis.fxRateAsOf : null,
    fiscalDataAsOf: typeof analysis.fiscalDataAsOf === "string" ? analysis.fiscalDataAsOf : null,
    sourceCount: Array.isArray(analysis.sources) ? analysis.sources.length : null,
    scenarioCount: Array.isArray(analysis.scenarios) ? analysis.scenarios.length : null,
    researchCategoryCount: Array.isArray(analysis.research) ? analysis.research.length : null,
  };
}

function runCodex(prompt: string, ticker: string, requestId: string, signal?: AbortSignal): Promise<string> {
  const schemaPath =
    process.env.STOCK_ANALYSIS_SCHEMA_PATH ??
    resolve(process.cwd(), "config/stock-analysis.schema.json");
  const timeoutMs = codexTimeoutMs();
  const reasoningEffort = codexReasoningEffort();
  const args = [
    "exec",
    "--json",
    "--ignore-user-config",
    "--config",
    'web_search="live"',
    "--config",
    `model_reasoning_effort="${reasoningEffort}"`,
    "--config",
    'model_verbosity="low"',
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--output-schema",
    schemaPath,
  ];
  if (process.env.CODEX_MODEL) args.push("--model", process.env.CODEX_MODEL);
  args.push("-");

  return new Promise((resolve, reject) => {
    const child = spawn("codex", args, {
      cwd: "/tmp",
      env: codexEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const startedAt = Date.now();
    let stdoutChunks = 0;
    let stderrChunks = 0;
    let lastOutputAt: number | null = null;
    let jsonLineBuffer = "";
    let finalMessage = "";
    let currentStep = 2;
    let currentPhase = "initialize-codex";
    let currentDescription = "initialize the Codex research agent";
    let lastEventType: string | null = null;
    let webSearchCount = 0;
    let reasoningItemCount = 0;
    let eventCount = 0;

    const updateProgress = (
      step: number,
      phase: string,
      description: string,
      details: JsonRecord = {},
      forceLog = false,
    ) => {
      const changed = step !== currentStep || phase !== currentPhase;
      currentStep = step;
      currentPhase = phase;
      currentDescription = description;
      if (changed || forceLog) {
        logAnalysisStep(requestId, ticker, step, phase, description, {
          elapsedMs: Date.now() - startedAt,
          webSearchCount,
          reasoningItemCount,
          ...details,
        });
      }
    };

    const handleCodexEvent = (event: JsonRecord) => {
      eventCount += 1;
      const eventType = typeof event.type === "string" ? event.type : "unknown";
      lastEventType = eventType;
      const item = codexEventItem(event);
      const itemType = item && typeof item.type === "string" ? item.type : null;

      if (eventType === "thread.started") {
        updateProgress(3, "plan-research", "plan the company research and evidence gathering");
        return;
      }
      if (itemType === "web_search" || itemType === "web_search_call") {
        if (eventType === "item.completed") webSearchCount += 1;
        const query = codexSearchQuery(item);
        updateProgress(
          4,
          "retrieve-live-evidence",
          "retrieve current filings, market data, and independent evidence",
          {
            codexEventType: eventType,
            webSearchQuery: query,
          },
          eventType === "item.completed",
        );
        return;
      }
      if (itemType === "reasoning" && eventType === "item.completed") {
        reasoningItemCount += 1;
        updateProgress(
          Math.max(currentStep, 3),
          currentStep >= 4 ? currentPhase : "analyze-evidence",
          currentStep >= 4
            ? currentDescription
            : "analyze retrieved evidence against the 48-question framework",
        );
        return;
      }
      if (itemType === "agent_message" && eventType === "item.completed") {
        if (typeof item.text === "string") finalMessage = item.text;
        updateProgress(5, "generate-structured-analysis", "generate the schema-constrained analysis JSON");
        return;
      }
      if (eventType === "turn.completed") {
        updateProgress(5, "generate-structured-analysis", "finish the schema-constrained analysis JSON");
      }
    };

    const consumeJsonLines = (final = false) => {
      const lines = jsonLineBuffer.split(/\r?\n/);
      jsonLineBuffer = final ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as unknown;
          if (isRecord(event)) handleCodexEvent(event);
        } catch (error) {
          console.warn("Codex emitted an unreadable JSONL event", {
            requestId,
            ticker,
            errorMessage: error instanceof Error ? error.message : String(error),
            linePreview: line.slice(0, 300),
          });
        }
      }
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(progressTimer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else {
        console.info("Codex research completed", {
          requestId,
          ticker,
          pid: child.pid,
          elapsedMs: Date.now() - startedAt,
          stdoutBytes: Buffer.byteLength(stdout, "utf8"),
          stderrBytes: Buffer.byteLength(stderr, "utf8"),
          stdoutChunks,
          stderrChunks,
          stderrTail: stderr.trim().slice(-2_000) || null,
        });
        resolve(finalMessage.trim());
      }
    };
    const abort = () => {
      console.warn("Codex research cancellation requested", {
        requestId,
        ticker,
        pid: child.pid,
        elapsedMs: Date.now() - startedAt,
      });
      child.kill("SIGKILL");
      const error = new Error("Codex research cancelled");
      error.name = "AbortError";
      finish(error);
    };
    const append = (current: string, chunk: Buffer) => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(new Error("Codex output exceeded the safety limit"));
      }
      return next;
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new CodexTimeoutError(timeoutMs));
    }, timeoutMs);
    const progressTimer = setInterval(() => {
      console.info(`Analysis progress heartbeat — step ${currentStep}/${ANALYSIS_STEP_COUNT}: ${currentDescription}`, {
        requestId,
        ticker,
        step: currentStep,
        totalSteps: ANALYSIS_STEP_COUNT,
        phase: currentPhase,
        description: currentDescription,
        pid: child.pid,
        elapsedMs: Date.now() - startedAt,
        stdoutBytes: Buffer.byteLength(stdout, "utf8"),
        stderrBytes: Buffer.byteLength(stderr, "utf8"),
        stdoutChunks,
        stderrChunks,
        eventCount,
        webSearchCount,
        reasoningItemCount,
        lastEventType,
        msSinceLastOutput: lastOutputAt === null ? null : Date.now() - lastOutputAt,
        stderrTail: stderr.trim().slice(-1_000) || null,
      });
    }, CODEX_PROGRESS_INTERVAL_MS);
    progressTimer.unref();

    console.info("Codex research started", {
      requestId,
      ticker,
      pid: child.pid,
      timeoutMs,
      reasoningEffort,
      webSearch: "live",
      schemaPath,
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks += 1;
      lastOutputAt = Date.now();
      stdout = append(stdout, chunk);
      jsonLineBuffer += chunk.toString("utf8");
      consumeJsonLines();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks += 1;
      lastOutputAt = Date.now();
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) => {
      console.error("Codex research process error", {
        requestId,
        ticker,
        pid: child.pid,
        elapsedMs: Date.now() - startedAt,
        errorName: error.name,
        errorMessage: error.message,
      });
      finish(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      consumeJsonLines(true);
      if (code !== 0) {
        const detail = stderr.trim().slice(-4_000);
        console.error("Codex research process exited unsuccessfully", {
          requestId,
          ticker,
          pid: child.pid,
          elapsedMs: Date.now() - startedAt,
          exitCode: code,
          stderrTail: detail || null,
        });
        finish(new Error(`Codex exited with status ${code}${detail ? `: ${detail}` : ""}`));
        return;
      }
      if (!finalMessage.trim()) {
        console.error("Codex research process returned no output", {
          requestId,
          ticker,
          pid: child.pid,
          elapsedMs: Date.now() - startedAt,
          stderrTail: stderr.trim().slice(-4_000) || null,
        });
        finish(new Error("Codex returned no final agent message"));
        return;
      }
      finish();
    });

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });

    child.stdin.end(prompt);
  });
}

function streamAnalysisResponse(
  request: Request,
  requestId: string,
  requestStartedAt: Date,
  ticker: string,
): Response {
  const encoder = new TextEncoder();
  const researchController = new AbortController();
  let finished = false;
  let keepaliveTimer: ReturnType<typeof setInterval> | undefined;

  const abortResearch = () => researchController.abort();
  request.signal.addEventListener("abort", abortResearch, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (value: string) => {
        if (finished) return;
        try {
          controller.enqueue(encoder.encode(value));
        } catch {
          abortResearch();
        }
      };
      const finish = () => {
        if (finished) return;
        finished = true;
        if (keepaliveTimer) clearInterval(keepaliveTimer);
        request.signal.removeEventListener("abort", abortResearch);
        try {
          controller.close();
        } catch {
          // The client already closed the response stream.
        }
      };

      // JSON permits leading whitespace. Sending it immediately and periodically keeps
      // long-running research requests active through local load balancers and proxies.
      enqueue("\n");
      keepaliveTimer = setInterval(() => enqueue("\n"), RESPONSE_KEEPALIVE_INTERVAL_MS);
      keepaliveTimer.unref?.();

      void completeAnalysis(requestId, requestStartedAt, ticker, researchController.signal)
        .then(async (response) => enqueue(await response.text()))
        .catch((error) => {
          console.error("Analysis response stream failed", {
            requestId,
            ticker,
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          enqueue(JSON.stringify({ error: "Research response failed unexpectedly. Please retry." }));
        })
        .finally(finish);
    },
    cancel() {
      finished = true;
      if (keepaliveTimer) clearInterval(keepaliveTimer);
      request.signal.removeEventListener("abort", abortResearch);
      abortResearch();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-store, no-transform",
      "Content-Type": "application/json; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

async function completeAnalysis(
  requestId: string,
  requestStartedAt: Date,
  ticker: string,
  signal: AbortSignal,
): Promise<Response> {
  let phase = "codex-research";
  try {
    const prompt = `Act as a skeptical, evidence-led public-equity scenario analyst. Research ${ticker} using current web sources and built-in web search. Do not run shell commands or modify files. The server—not you—calculates probabilities, valuation outputs, confidence and returns.

REQUEST CONTEXT
- The server started this request at ${requestStartedAt.toISOString()}. Do not emit price, FX, publication or access timestamps later than this UTC time.

RESEARCH RULES
- Resolve the exact security: exchange, security type, share class, durable instrument ID, trading currency, reporting currency, ADR ratio, fresh price and ISO-8601 price timestamp. Cite the exact market-data source ID.
- Before returning JSON, audit the three singleton source references against the source ledger: marketDataSourceId must point to type market; latestFilingSourceId must point to type filing or company; fxSourceId must point to type market or government. Every referenced ID must exist.
- State the latest fiscal-data date. Populate baseline with trailing-twelve-month financials in reporting currency and one consistent scale. dilutedShares must use the same millions/billions scale as the monetary values and, for an ADR, must represent traded depositary-share equivalents after applying adrRatio.
- When currencies match, set currentReportingToTradingFxRate and each scenario reportingToTradingFxRate to 1, set fxRateAsOf equal to priceAsOf, and set fxSourceId equal to marketDataSourceId. Otherwise cite a fresh market or government FX source and use reporting-currency value × FX rate = trading-currency value.
- Locate the latest filing and earnings release plus enough prior filings to evaluate at least 10 quarters. Prefer filings, regulators, government data, company materials and competitor filings over summaries.
- Triangulate management claims with independent customer, competitor, industry or government evidence. Never invent a metric; mark missing evidence with partial or unanswered status and explain the gap in answer.
- Complete every category below exactly once and answer each of its four questions using questionIndex 0–3 exactly once. status is answered, partial or unanswered. An answered question must cite evidence. score means evidence direction (-2 strongly negative, -1 negative, 0 mixed/neutral, 1 positive, 2 strongly positive). The server derives evidence strength and unanswered-question coverage.
- Each finding and scenario must cite valid IDs from the source ledger. Every source-ledger URL must be unique: when the same document supports multiple claims, create it once and reuse its existing source ID. Use exact document URLs rather than search pages or generic homepages. publishedAt must be YYYY-MM-DD. accessedAt must be an ISO-8601 UTC timestamp no later than the request time above; the server replaces it with its authoritative completion timestamp. The server derives primary-source status from source type.

${researchFrameworkPrompt}

SCENARIO AND VALUATION RULES
- Create exactly 20 three-year outcome representatives. Each must use a unique complete factorStates vector so correlated events are modeled together rather than double-counted as standalone scenarios. The server sorts derived prices into contiguous, non-overlapping terminal-price buckets that collectively cover all non-negative prices.
- Do not return a probability. Return only a positive relativeLikelihood supported by a probabilityRationale grounded in base rates and cited evidence. The server shrinks these weights toward equal priors according to independently derived evidence quality, then normalizes them to 100.0%.
- Do not return price, target equity value, target enterprise value, expected price, return, type or confidence. The server derives all of them.
- For each scenario provide explicit valuationInputs. forecast revenue is server-derived from baseline revenue and three years of revenueCagrPct. For enterprise-value-multiple use revenue, EBIT or free cash flow; server calculates EV = metric × multiple and equity = EV + net cash. For equity-value-multiple use net income or book value; server calculates equity = metric × multiple. For NAV use NAV or book value. The server then converts reporting currency to trading currency and divides by diluted shares.
- Model dilution/buybacks in dilutedShares, balance-sheet change in netCash or balanceSheetValue, FX in reportingToTradingFxRate, and dividends in cumulativeDividendsPerShare. Use sector-appropriate metrics and materially different assumptions across cases.
- Distinguish facts from estimates, expose uncertainty and do not give personalized investment advice. Return only the JSON object required by the supplied schema.`;
    logAnalysisStep(requestId, ticker, 2, "prepare-codex", "assemble the research prompt and output schema", {
      requestStartedAt: requestStartedAt.toISOString(),
    });
    const output = await runCodex(prompt, ticker, requestId, signal);
    phase = "parse-codex-output";
    logAnalysisStep(requestId, ticker, 6, phase, "parse the model output and stamp authoritative source access times");
    const raw = JSON.parse(output) as unknown;
    const validationNow = new Date();
    const stamped = stampSourceAccessTimes(raw, validationNow);
    console.info("Analysis source access timestamps stamped", {
      requestId,
      ticker,
      ...stamped.diagnostics,
    });
    phase = "validate-analysis";
    logAnalysisStep(requestId, ticker, 7, phase, "validate evidence and calculate probabilities, valuations, and returns", {
      validationNow: validationNow.toISOString(),
      ...summarizeAnalysisOutput(stamped.value),
    });
    const data = processAnalysis(stamped.value, ticker, validationNow);
    phase = "store-analysis";
    logAnalysisStep(requestId, ticker, 8, phase, "persist the completed analysis and prepare the API response");
    let history;
    try {
      history = await saveAnalysisHistory(
        { ...data, live: true, engine: "codex-cli" },
        validationNow,
      );
    } catch (historyError) {
      console.error("Completed analysis could not be persisted", {
        requestId,
        ticker,
        errorMessage: historyError instanceof Error ? historyError.message : String(historyError),
      });
      return Response.json({
        ...data,
        live: true,
        engine: "codex-cli",
        historyWarning: "The analysis completed but could not be saved to history. Export it before leaving this page.",
      });
    }
    phase = "send-response";
    logAnalysisStep(requestId, ticker, 8, phase, "complete persistence and send the validated analysis response", {
      elapsedMs: Date.now() - requestStartedAt.getTime(),
      sourceCount: data.sources.length,
      scenarioCount: data.scenarios.length,
      researchCategoryCount: data.research.length,
      confidence: data.confidence,
      expectedPrice: data.expectedPrice,
      historyId: history.id,
    });
    return Response.json({ ...data, live: true, engine: "codex-cli", history });
  } catch (error) {
    if (error instanceof AnalysisValidationError) {
      console.warn("Analysis validation failed", {
        requestId,
        ticker,
        phase,
        elapsedMs: Date.now() - requestStartedAt.getTime(),
        errorMessage: error.message,
        validationDetails: error.details,
      });
      return Response.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("Analysis request cancelled", {
        requestId,
        ticker,
        phase,
        elapsedMs: Date.now() - requestStartedAt.getTime(),
      });
      return Response.json({ error: "Research cancelled" }, { status: 499 });
    }
    if (error instanceof CodexTimeoutError) {
      console.error("Codex research timed out", {
        requestId,
        ticker,
        phase,
        elapsedMs: Date.now() - requestStartedAt.getTime(),
        timeoutMs: error.timeoutMs,
      });
      return Response.json(
        {
          error: `Research for ${ticker} exceeded the ${Math.round(error.timeoutMs / 60_000)}-minute limit. Please retry.`,
        },
        { status: 504 },
      );
    }
    console.error("Codex research failed", {
      requestId,
      ticker,
      phase,
      elapsedMs: Date.now() - requestStartedAt.getTime(),
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return Response.json(
      { error: "Codex research failed. Check the pod logs and subscription authentication." },
      { status: 502 },
    );
  } finally {
    researchInProgress = false;
    console.info("Analysis request finished", {
      requestId,
      ticker,
      phase,
      elapsedMs: Date.now() - requestStartedAt.getTime(),
    });
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const requestStartedAt = new Date();
  let ticker: string | undefined;
  try {
    ({ ticker } = (await request.json()) as { ticker?: string });
  } catch (error) {
    console.warn("Analysis request rejected", {
      requestId,
      phase: "parse-request",
      reason: "invalid-json",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Invalid JSON request" }, { status: 400 });
  }
  ticker = ticker?.trim().toUpperCase();
  if (!ticker || !/^[A-Z.-]{1,8}$/.test(ticker)) {
    console.warn("Analysis request rejected", {
      requestId,
      phase: "parse-request",
      reason: "invalid-ticker",
      ticker: ticker ?? null,
    });
    return Response.json({ error: "Invalid ticker" }, { status: 400 });
  }
  if (researchInProgress) {
    console.warn("Analysis request rejected", {
      requestId,
      phase: "admission",
      reason: "research-already-in-progress",
      ticker,
    });
    return Response.json(
      { error: "Another research run is already in progress" },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  researchInProgress = true;
  logAnalysisStep(requestId, ticker, 1, "admission", "accept and validate the ticker research request", {
    requestStartedAt: requestStartedAt.toISOString(),
  });
  return streamAnalysisResponse(request, requestId, requestStartedAt, ticker);
}
