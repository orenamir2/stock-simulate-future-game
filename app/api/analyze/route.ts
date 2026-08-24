import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { AnalysisValidationError, processAnalysis } from "../../../lib/analysis-engine";
import { researchFrameworkPrompt } from "../../../lib/research-framework";

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_CODEX_TIMEOUT_MS = 3_600_000;
const CODEX_PROGRESS_INTERVAL_MS = 60_000;
const REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);
let researchInProgress = false;

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

function runCodex(prompt: string, ticker: string, signal?: AbortSignal): Promise<string> {
  const schemaPath =
    process.env.STOCK_ANALYSIS_SCHEMA_PATH ??
    resolve(process.cwd(), "config/stock-analysis.schema.json");
  const timeoutMs = codexTimeoutMs();
  const reasoningEffort = codexReasoningEffort();
  const args = [
    "exec",
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

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(progressTimer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else {
        console.info("Codex research completed", {
          ticker,
          elapsedMs: Date.now() - startedAt,
          stdoutBytes: Buffer.byteLength(stdout, "utf8"),
          stderrBytes: Buffer.byteLength(stderr, "utf8"),
        });
        resolve(stdout.trim());
      }
    };
    const abort = () => {
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
      console.info("Codex research still running", {
        ticker,
        elapsedMs: Date.now() - startedAt,
        stdoutBytes: Buffer.byteLength(stdout, "utf8"),
        stderrBytes: Buffer.byteLength(stderr, "utf8"),
      });
    }, CODEX_PROGRESS_INTERVAL_MS);
    progressTimer.unref();

    console.info("Codex research started", {
      ticker,
      timeoutMs,
      reasoningEffort,
      webSearch: "live",
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", finish);
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        const detail = stderr.trim().slice(-4_000);
        finish(new Error(`Codex exited with status ${code}${detail ? `: ${detail}` : ""}`));
        return;
      }
      if (!stdout.trim()) {
        finish(new Error("Codex returned an empty result"));
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

export async function POST(request: Request) {
  let ticker: string | undefined;
  try {
    ({ ticker } = (await request.json()) as { ticker?: string });
  } catch {
    return Response.json({ error: "Invalid JSON request" }, { status: 400 });
  }
  ticker = ticker?.trim().toUpperCase();
  if (!ticker || !/^[A-Z.-]{1,8}$/.test(ticker)) {
    return Response.json({ error: "Invalid ticker" }, { status: 400 });
  }
  if (researchInProgress) {
    return Response.json(
      { error: "Another research run is already in progress" },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  researchInProgress = true;
  try {
    const prompt = `Act as a skeptical, evidence-led public-equity scenario analyst. Research ${ticker} using current web sources and built-in web search. Do not run shell commands or modify files. The server—not you—calculates probabilities, valuation outputs, confidence and returns.

RESEARCH RULES
- Resolve the exact security: exchange, security type, share class, durable instrument ID, trading currency, reporting currency, ADR ratio, fresh price and ISO-8601 price timestamp. Cite the exact market-data source ID.
- State the latest fiscal-data date. Populate baseline with trailing-twelve-month financials in reporting currency and one consistent scale. dilutedShares must use the same millions/billions scale as the monetary values and, for an ADR, must represent traded depositary-share equivalents after applying adrRatio.
- Set currentReportingToTradingFxRate and each scenario reportingToTradingFxRate to 1 when currencies match. Otherwise cite a fresh FX source and use reporting-currency value × FX rate = trading-currency value.
- Locate the latest filing and earnings release plus enough prior filings to evaluate at least 10 quarters. Prefer filings, regulators, government data, company materials and competitor filings over summaries.
- Triangulate management claims with independent customer, competitor, industry or government evidence. Never invent a metric; mark missing evidence with partial or unanswered status and explain the gap in answer.
- Complete every category below exactly once and answer each of its four questions using questionIndex 0–3 exactly once. status is answered, partial or unanswered. An answered question must cite evidence. score means evidence direction (-2 strongly negative, -1 negative, 0 mixed/neutral, 1 positive, 2 strongly positive). The server derives evidence strength and unanswered-question coverage.
- Each finding and scenario must cite valid IDs from the source ledger. Use exact document URLs rather than search pages or generic homepages. publishedAt must be YYYY-MM-DD and accessedAt must be an ISO-8601 timestamp. The server derives primary-source status from source type.

${researchFrameworkPrompt}

SCENARIO AND VALUATION RULES
- Create exactly 20 three-year outcome representatives. Each must use a unique complete factorStates vector so correlated events are modeled together rather than double-counted as standalone scenarios. The server sorts derived prices into contiguous, non-overlapping terminal-price buckets that collectively cover all non-negative prices.
- Do not return a probability. Return only a positive relativeLikelihood supported by a probabilityRationale grounded in base rates and cited evidence. The server shrinks these weights toward equal priors according to independently derived evidence quality, then normalizes them to 100.0%.
- Do not return price, target equity value, target enterprise value, expected price, return, type or confidence. The server derives all of them.
- For each scenario provide explicit valuationInputs. forecast revenue is server-derived from baseline revenue and three years of revenueCagrPct. For enterprise-value-multiple use revenue, EBIT or free cash flow; server calculates EV = metric × multiple and equity = EV + net cash. For equity-value-multiple use net income or book value; server calculates equity = metric × multiple. For NAV use NAV or book value. The server then converts reporting currency to trading currency and divides by diluted shares.
- Model dilution/buybacks in dilutedShares, balance-sheet change in netCash or balanceSheetValue, FX in reportingToTradingFxRate, and dividends in cumulativeDividendsPerShare. Use sector-appropriate metrics and materially different assumptions across cases.
- Distinguish facts from estimates, expose uncertainty and do not give personalized investment advice. Return only the JSON object required by the supplied schema.`;
    const raw = JSON.parse(await runCodex(prompt, ticker, request.signal)) as unknown;
    const data = processAnalysis(raw, ticker);
    return Response.json({ ...data, live: true, engine: "codex-cli" });
  } catch (error) {
    if (error instanceof AnalysisValidationError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof Error && error.name === "AbortError") {
      return Response.json({ error: "Research cancelled" }, { status: 499 });
    }
    if (error instanceof CodexTimeoutError) {
      console.error("Codex research timed out", {
        ticker,
        timeoutMs: error.timeoutMs,
      });
      return Response.json(
        {
          error: `Research for ${ticker} exceeded the ${Math.round(error.timeoutMs / 60_000)}-minute limit. Please retry.`,
        },
        { status: 504 },
      );
    }
    console.error("Codex research failed", error);
    return Response.json(
      { error: "Codex research failed. Check the pod logs and subscription authentication." },
      { status: 502 },
    );
  } finally {
    researchInProgress = false;
  }
}
