import { spawn } from "node:child_process";
import { researchFramework, researchFrameworkPrompt } from "../../../lib/research-framework";

type Scenario = {
  name: string;
  probability: number;
  price: number;
  thesis: string;
  type: "bull" | "base" | "bear";
  targetEquityValue: number;
  targetDilutedShares: number;
  valuationMethod: string;
  keyDrivers: string[];
  sourceIds: string[];
};

type ResearchFinding = {
  categoryId: string;
  score: number;
  evidenceStrength: number;
  finding: string;
  unansweredQuestions: string[];
  sourceIds: string[];
};

type Source = {
  id: string;
  url: string;
  type: string;
  primary: boolean;
};

type Analysis = {
  ticker: string;
  company: string;
  currentPrice: number;
  expectedPrice: number;
  summary: string;
  scenarios: Scenario[];
  signals: unknown[];
  research: ResearchFinding[];
  sources: Source[];
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
  if (!Array.isArray(data.sources) || data.sources.length < 8) {
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
  const categoryIds = new Set(researchFramework.map(({ id }) => id));
  const returnedCategories = new Set(data.research?.map(({ categoryId }) => categoryId));
  if (
    !Array.isArray(data.research) ||
    data.research.length !== researchFramework.length ||
    returnedCategories.size !== categoryIds.size ||
    [...categoryIds].some((id) => !returnedCategories.has(id))
  ) {
    return "Research coverage audit failed";
  }
  const sourceIds = new Set(data.sources.map(({ id }) => id));
  const badReference = [...data.research, ...data.scenarios].some(
    (item) => !item.sourceIds.length || item.sourceIds.some((id) => !sourceIds.has(id)),
  );
  if (sourceIds.size !== data.sources.length || badReference) {
    return "Source reference audit failed";
  }
  const badValuation = data.scenarios.some(({ price, targetEquityValue, targetDilutedShares }) => {
    const calculatedPrice = targetEquityValue / targetDilutedShares;
    return Math.abs(calculatedPrice - price) > Math.max(0.5, price * 0.005);
  });
  if (badValuation) return "Scenario valuation audit failed";
  return null;
}

function calculateConfidence(data: Analysis): number {
  const averageStrength =
    data.research.reduce((sum, item) => sum + item.evidenceStrength, 0) /
    (data.research.length * 3);
  const primaryShare = data.sources.filter(({ primary }) => primary).length / data.sources.length;
  const sourceDiversity = Math.min(new Set(data.sources.map(({ type }) => type)).size / 6, 1);
  const unanswered = data.research.reduce((sum, item) => sum + item.unansweredQuestions.length, 0);
  const completeness = Math.max(0, 1 - unanswered / (data.research.length * 4));
  return Math.round(averageStrength * 50 + primaryShare * 20 + sourceDiversity * 15 + completeness * 15);
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
    const prompt = `Act as a skeptical, evidence-led public-equity scenario analyst. Research ${ticker} using current web sources and built-in web search. Do not run shell commands or modify files.

RESEARCH RULES
- Identify the exact security, reporting currency, fresh price and price timestamp.
- Locate the latest filing and earnings release plus enough prior filings to evaluate at least 10 quarters. Prefer filings, regulators, government data, company materials and competitor filings over summaries.
- Triangulate management claims with independent customer, competitor, industry or government evidence. Never invent a metric; record important missing data in unansweredQuestions.
- Complete every category below exactly once. score means evidence direction (-2 strongly negative, -1 negative, 0 mixed/neutral, 1 positive, 2 strongly positive). evidenceStrength means 0 no usable evidence, 1 weak/single source, 2 adequate/partly triangulated, 3 strong/primary and triangulated.
- Each finding and scenario must cite valid IDs from the source ledger. Use direct working HTTP(S) URLs, exact publication dates when available, and honestly mark whether each source is primary.

${researchFrameworkPrompt}

SCENARIO AND VALUATION RULES
- Create exactly 20 collectively exhaustive, mutually exclusive three-year scenarios. Avoid double-counting correlated events: combine them in a scenario where appropriate.
- Start from base rates and the evidence scorecard; do not treat possibility as probability. Probabilities are integers totaling exactly 100.
- For every scenario state 2–5 measurable key drivers and a suitable valuation method. Estimate target equity value and target diluted shares in the SAME unit (for example USD billions and billions of shares), then set price = targetEquityValue / targetDilutedShares. The server audits this identity.
- Include dilution/buybacks, net cash/debt and cyclicality in target equity value. Use sector-appropriate methods (DCF, earnings/FCF multiple, book value, NAV or sum-of-parts), with different assumptions across bear/base/bull cases.
- Compute expectedPrice exactly as sum(probability * price) / 100. Distinguish facts from estimates, expose uncertainty and do not give personalized investment advice.
- Return only the JSON object required by the supplied schema. Confidence is calculated by the server from evidence strength, unanswered questions, primary-source share and source diversity; do not return confidence.`;
    const data = JSON.parse(await runCodex(prompt)) as Analysis;
    const auditError = auditAnalysis(data, ticker);
    if (auditError) return Response.json({ error: auditError }, { status: 422 });
    return Response.json({ ...data, confidence: calculateConfidence(data), live: true, engine: "codex-cli" });
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
