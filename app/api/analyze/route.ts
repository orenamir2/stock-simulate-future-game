import { spawn } from "node:child_process";

type Scenario = {
  name: string;
  probability: number;
  price: number;
  thesis: string;
  type: "bull" | "base" | "bear";
};

type Analysis = {
  ticker: string;
  company: string;
  currentPrice: number;
  expectedPrice: number;
  confidence: number;
  summary: string;
  scenarios: Scenario[];
  signals: unknown[];
  sources: { url: string }[];
};

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
let researchInProgress = false;

function runCodex(prompt: string): Promise<string> {
  const schemaPath =
    process.env.STOCK_ANALYSIS_SCHEMA_PATH ??
    "/app/config/stock-analysis.schema.json";
  const timeoutMs = Number(process.env.CODEX_TIMEOUT_MS ?? 600_000);
  const args = [
    "exec",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--output-schema",
    schemaPath,
  ];
  if (process.env.CODEX_MODEL) args.push("--model", process.env.CODEX_MODEL);
  args.push("-");

  return new Promise((resolve, reject) => {
    const child = spawn("codex", args, {
      cwd: "/tmp",
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(stdout.trim());
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
      finish(new Error("Codex research timed out"));
    }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 600_000);

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

    child.stdin.end(prompt);
  });
}

function auditAnalysis(data: Analysis, requestedTicker: string): string | null {
  if (data.ticker.toUpperCase() !== requestedTicker) return "Ticker mismatch";
  if (!Array.isArray(data.scenarios) || data.scenarios.length !== 20) {
    return "Scenario count audit failed";
  }
  if (!Array.isArray(data.signals) || data.signals.length !== 4) {
    return "Signal count audit failed";
  }
  if (!Array.isArray(data.sources) || data.sources.length < 3) {
    return "Source count audit failed";
  }
  if (data.sources.some(({ url }) => !/^https?:\/\//i.test(url))) {
    return "Source URL audit failed";
  }
  const total = data.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0);
  const expected =
    data.scenarios.reduce(
      (sum, scenario) => sum + scenario.probability * scenario.price,
      0,
    ) / 100;
  if (total !== 100 || Math.abs(expected - data.expectedPrice) > 0.1) {
    return "Probability audit failed";
  }
  return null;
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
    const prompt = `Act as an evidence-led public-equity scenario analyst. Research ${ticker} using current web sources and the built-in web-search capability. Do not run shell commands and do not modify files. Identify the company and fresh stock price. Read or locate the last 10 quarterly or annual earnings reports, prioritizing SEC filings and investor relations. Evaluate revenue, margins, cash flow, balance sheet, guidance accuracy, consumer or customer sentiment, employee signals when material, competitive position, industry cycle, macro sensitivity, regulation, litigation, management and capital allocation, valuation, and tail risks. Create exactly 20 mutually exclusive scenarios for the stock price three years from today. Probabilities must be integers and sum to exactly 100. For every scenario estimate a three-year price from explicit business and valuation logic. Compute expectedPrice exactly as sum(probability * price) / 100. Distinguish facts from estimates. Do not imply certainty or give personalized investment advice. Sources must be direct, working HTTP or HTTPS URLs and favor primary sources. Return only the JSON object required by the supplied schema.`;
    const data = JSON.parse(await runCodex(prompt)) as Analysis;
    const auditError = auditAnalysis(data, ticker);
    if (auditError) return Response.json({ error: auditError }, { status: 422 });
    return Response.json({ ...data, live: true, engine: "codex-cli" });
  } catch (error) {
    console.error("Codex research failed", error);
    return Response.json(
      { error: "Codex research failed. Check the pod logs and subscription authentication." },
      { status: 502 },
    );
  } finally {
    researchInProgress = false;
  }
}
