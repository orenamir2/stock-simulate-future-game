import { researchFramework } from "./research-framework.ts";
import type {
  Analysis,
  BaselineFinancials,
  FactorStates,
  QuestionAnswer,
  RawAnalysis,
  RawResearchFinding,
  RawScenario,
  ResearchFinding,
  Scenario,
  Source,
  SourceType,
  ValuationInputs,
} from "./analysis-types.ts";

const SOURCE_TYPES = new Set<SourceType>([
  "filing",
  "company",
  "regulator",
  "government",
  "industry",
  "competitor",
  "customer",
  "market",
  "news",
]);
const PRIMARY_SOURCE_TYPES = new Set<SourceType>([
  "filing",
  "company",
  "regulator",
  "government",
  "competitor",
  "customer",
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const CURRENCY = /^[A-Z]{3}$/;
const EPSILON = 1e-9;

export class AnalysisValidationError extends Error {
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AnalysisValidationError";
    this.details = details;
  }
}

function fail(message: string, details?: Record<string, unknown>): never {
  throw new AnalysisValidationError(message, details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type SourceAccessTimestampDiagnostics = {
  serverAccessedAt: string;
  sourceCount: number;
  stampedSourceCount: number;
  invalidOriginalCount: number;
  earliestOriginalAccessedAt: string | null;
  latestOriginalAccessedAt: string | null;
  futureOriginals: Array<{ id: string; accessedAt: string; aheadByMs: number }>;
};

export function stampSourceAccessTimes(
  value: unknown,
  accessedAt = new Date(),
): { value: unknown; diagnostics: SourceAccessTimestampDiagnostics } {
  const serverAccessedAt = accessedAt.toISOString();
  const diagnostics: SourceAccessTimestampDiagnostics = {
    serverAccessedAt,
    sourceCount: 0,
    stampedSourceCount: 0,
    invalidOriginalCount: 0,
    earliestOriginalAccessedAt: null,
    latestOriginalAccessedAt: null,
    futureOriginals: [],
  };
  if (!isRecord(value) || !Array.isArray(value.sources)) return { value, diagnostics };

  diagnostics.sourceCount = value.sources.length;
  const validOriginals: Array<{ timestamp: string; timestampMs: number }> = [];
  const sources = value.sources.map((source, index) => {
    if (!isRecord(source)) return source;
    diagnostics.stampedSourceCount += 1;
    if (typeof source.accessedAt === "string") {
      const originalMs = Date.parse(source.accessedAt);
      if (Number.isFinite(originalMs)) {
        validOriginals.push({ timestamp: source.accessedAt, timestampMs: originalMs });
        if (originalMs > accessedAt.getTime()) {
          diagnostics.futureOriginals.push({
            id: typeof source.id === "string" ? source.id : `sources[${index}]`,
            accessedAt: source.accessedAt,
            aheadByMs: originalMs - accessedAt.getTime(),
          });
        }
      } else {
        diagnostics.invalidOriginalCount += 1;
      }
    } else {
      diagnostics.invalidOriginalCount += 1;
    }
    return { ...source, accessedAt: serverAccessedAt };
  });

  validOriginals.sort((a, b) => a.timestampMs - b.timestampMs);
  diagnostics.earliestOriginalAccessedAt = validOriginals[0]?.timestamp ?? null;
  diagnostics.latestOriginalAccessedAt = validOriginals.at(-1)?.timestamp ?? null;
  return { value: { ...value, sources }, diagnostics };
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) fail(`${label} contains unexpected fields: ${unexpected.join(", ")}`);
}

function finiteNumber(value: unknown, label: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(`${label} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string, maxLength = 2_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    fail(`${label} must be a non-empty string no longer than ${maxLength} characters`);
  }
  return value.trim();
}

function stringArray(value: unknown, label: string, min: number, max: number): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} must contain between ${min} and ${max} items`);
  }
  return value.map((item, index) => nonEmptyString(item, `${label}[${index}]`, 500));
}

function enumValue<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(`${label} is invalid`);
  }
  return value as T;
}

function parseDate(value: unknown, label: string, dateTime = false): string {
  const result = nonEmptyString(value, label, 40);
  if (!(dateTime ? ISO_DATE_TIME : ISO_DATE).test(result) || Number.isNaN(Date.parse(result))) {
    fail(`${label} must be an ISO ${dateTime ? "date-time" : "date"}`);
  }
  return result;
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".local") || normalized === "::1") return true;
  if (/^(fc|fd)/i.test(normalized) && normalized.includes(":")) return true;
  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false;
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function parseSource(value: unknown, index: number): Omit<Source, "primary"> {
  if (!isRecord(value)) fail(`sources[${index}] must be an object`);
  assertKeys(value, ["id", "title", "publisher", "publishedAt", "accessedAt", "url", "type"], `sources[${index}]`);
  const type = enumValue(value.type, `sources[${index}].type`, [...SOURCE_TYPES]);
  const url = nonEmptyString(value.url, `sources[${index}].url`, 2_000);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    fail(`sources[${index}].url is invalid`);
  }
  if (!/^https?:$/.test(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    fail(`sources[${index}].url must be an HTTP(S) URL without credentials`);
  }
  if (isPrivateHostname(parsedUrl.hostname)) fail(`sources[${index}].url cannot target a private host`);
  if (parsedUrl.pathname === "/" && !parsedUrl.search) {
    fail(`sources[${index}].url must identify a document or data page, not a homepage`);
  }
  return {
    id: nonEmptyString(value.id, `sources[${index}].id`, 40),
    title: nonEmptyString(value.title, `sources[${index}].title`, 300),
    publisher: nonEmptyString(value.publisher, `sources[${index}].publisher`, 160),
    publishedAt: parseDate(value.publishedAt, `sources[${index}].publishedAt`),
    accessedAt: parseDate(value.accessedAt, `sources[${index}].accessedAt`, true),
    url,
    type,
  };
}

function parseQuestion(value: unknown, label: string): QuestionAnswer {
  if (!isRecord(value)) fail(`${label} must be an object`);
  assertKeys(value, ["questionIndex", "status", "answer", "sourceIds"], label);
  const questionIndex = finiteNumber(value.questionIndex, `${label}.questionIndex`, 0, 3);
  if (!Number.isInteger(questionIndex)) fail(`${label}.questionIndex must be an integer`);
  return {
    questionIndex,
    status: enumValue(value.status, `${label}.status`, ["answered", "partial", "unanswered"]),
    answer: nonEmptyString(value.answer, `${label}.answer`, 1_500),
    sourceIds: stringArray(value.sourceIds, `${label}.sourceIds`, 0, 8),
  };
}

function parseResearch(value: unknown, index: number): RawResearchFinding {
  if (!isRecord(value)) fail(`research[${index}] must be an object`);
  assertKeys(value, ["categoryId", "score", "finding", "questions", "sourceIds"], `research[${index}]`);
  if (!Array.isArray(value.questions) || value.questions.length !== 4) {
    fail(`research[${index}].questions must contain exactly four answers`);
  }
  const score = finiteNumber(value.score, `research[${index}].score`, -2, 2);
  if (!Number.isInteger(score)) fail(`research[${index}].score must be an integer`);
  return {
    categoryId: nonEmptyString(value.categoryId, `research[${index}].categoryId`, 80),
    score,
    finding: nonEmptyString(value.finding, `research[${index}].finding`, 2_000),
    questions: value.questions.map((question, questionIndex) =>
      parseQuestion(question, `research[${index}].questions[${questionIndex}]`),
    ),
    sourceIds: stringArray(value.sourceIds, `research[${index}].sourceIds`, 1, 8),
  };
}

function parseFactorStates(value: unknown, label: string): FactorStates {
  if (!isRecord(value)) fail(`${label} must be an object`);
  assertKeys(value, ["macro", "industryDemand", "companyExecution", "valuationRegime", "balanceSheet"], label);
  return {
    macro: enumValue(value.macro, `${label}.macro`, ["downturn", "steady", "expansion"]),
    industryDemand: enumValue(value.industryDemand, `${label}.industryDemand`, ["contraction", "steady", "growth"]),
    companyExecution: enumValue(value.companyExecution, `${label}.companyExecution`, ["miss", "meet", "beat"]),
    valuationRegime: enumValue(value.valuationRegime, `${label}.valuationRegime`, ["compression", "steady", "expansion"]),
    balanceSheet: enumValue(value.balanceSheet, `${label}.balanceSheet`, ["deteriorating", "steady", "improving"]),
  };
}

function parseValuationInputs(value: unknown, label: string): ValuationInputs {
  if (!isRecord(value)) fail(`${label} must be an object`);
  assertKeys(value, [
    "revenueCagrPct", "operatingMarginPct", "freeCashFlowMarginPct", "netIncomeMarginPct",
    "balanceSheetValue", "netCash", "dilutedShares", "reportingToTradingFxRate",
    "valuationBasis", "valuationMetric", "valuationMultiple", "cumulativeDividendsPerShare",
  ], label);
  return {
    revenueCagrPct: finiteNumber(value.revenueCagrPct, `${label}.revenueCagrPct`, -100, 300),
    operatingMarginPct: finiteNumber(value.operatingMarginPct, `${label}.operatingMarginPct`, -100, 100),
    freeCashFlowMarginPct: finiteNumber(value.freeCashFlowMarginPct, `${label}.freeCashFlowMarginPct`, -100, 100),
    netIncomeMarginPct: finiteNumber(value.netIncomeMarginPct, `${label}.netIncomeMarginPct`, -100, 100),
    balanceSheetValue: finiteNumber(value.balanceSheetValue, `${label}.balanceSheetValue`, 0, 1e9),
    netCash: finiteNumber(value.netCash, `${label}.netCash`, -1e9, 1e9),
    dilutedShares: finiteNumber(value.dilutedShares, `${label}.dilutedShares`, EPSILON, 1e9),
    reportingToTradingFxRate: finiteNumber(
      value.reportingToTradingFxRate,
      `${label}.reportingToTradingFxRate`,
      EPSILON,
      1e6,
    ),
    valuationBasis: enumValue(value.valuationBasis, `${label}.valuationBasis`, [
      "enterprise-value-multiple",
      "equity-value-multiple",
      "nav",
    ]),
    valuationMetric: enumValue(value.valuationMetric, `${label}.valuationMetric`, [
      "revenue",
      "ebit",
      "free-cash-flow",
      "net-income",
      "book-value",
      "nav",
    ]),
    valuationMultiple: finiteNumber(value.valuationMultiple, `${label}.valuationMultiple`, 0, 200),
    cumulativeDividendsPerShare: finiteNumber(
      value.cumulativeDividendsPerShare,
      `${label}.cumulativeDividendsPerShare`,
      0,
      1e6,
    ),
  };
}

function parseScenario(value: unknown, index: number): RawScenario {
  if (!isRecord(value)) fail(`scenarios[${index}] must be an object`);
  assertKeys(value, [
    "name", "thesis", "relativeLikelihood", "probabilityRationale", "valuationMethod",
    "factorStates", "valuationInputs", "keyDrivers", "sourceIds",
  ], `scenarios[${index}]`);
  return {
    name: nonEmptyString(value.name, `scenarios[${index}].name`, 160),
    thesis: nonEmptyString(value.thesis, `scenarios[${index}].thesis`, 2_000),
    relativeLikelihood: finiteNumber(value.relativeLikelihood, `scenarios[${index}].relativeLikelihood`, EPSILON, 1_000),
    probabilityRationale: nonEmptyString(
      value.probabilityRationale,
      `scenarios[${index}].probabilityRationale`,
      1_000,
    ),
    valuationMethod: nonEmptyString(value.valuationMethod, `scenarios[${index}].valuationMethod`, 300),
    factorStates: parseFactorStates(value.factorStates, `scenarios[${index}].factorStates`),
    valuationInputs: parseValuationInputs(value.valuationInputs, `scenarios[${index}].valuationInputs`),
    keyDrivers: stringArray(value.keyDrivers, `scenarios[${index}].keyDrivers`, 2, 5),
    sourceIds: stringArray(value.sourceIds, `scenarios[${index}].sourceIds`, 1, 8),
  };
}

function parseBaseline(value: unknown): BaselineFinancials {
  if (!isRecord(value)) fail("baseline must be an object");
  assertKeys(value, [
    "scale", "asOf", "revenue", "operatingMarginPct", "freeCashFlowMarginPct",
    "netIncomeMarginPct", "netCash", "dilutedShares", "balanceSheetValue", "sourceIds",
  ], "baseline");
  return {
    scale: enumValue(value.scale, "baseline.scale", ["millions", "billions"]),
    asOf: parseDate(value.asOf, "baseline.asOf"),
    revenue: finiteNumber(value.revenue, "baseline.revenue", 0, 1e9),
    operatingMarginPct: finiteNumber(value.operatingMarginPct, "baseline.operatingMarginPct", -100, 100),
    freeCashFlowMarginPct: finiteNumber(value.freeCashFlowMarginPct, "baseline.freeCashFlowMarginPct", -100, 100),
    netIncomeMarginPct: finiteNumber(value.netIncomeMarginPct, "baseline.netIncomeMarginPct", -100, 100),
    netCash: finiteNumber(value.netCash, "baseline.netCash", -1e9, 1e9),
    dilutedShares: finiteNumber(value.dilutedShares, "baseline.dilutedShares", EPSILON, 1e9),
    balanceSheetValue: finiteNumber(value.balanceSheetValue, "baseline.balanceSheetValue", 0, 1e9),
    sourceIds: stringArray(value.sourceIds, "baseline.sourceIds", 1, 8),
  };
}

function parseRawAnalysis(value: unknown): RawAnalysis {
  if (!isRecord(value)) fail("Analysis must be an object");
  assertKeys(value, [
    "ticker", "company", "exchange", "securityType", "shareClass", "instrumentId",
    "instrumentIdType", "tradingCurrency", "reportingCurrency", "currentPrice", "priceAsOf",
    "fiscalDataAsOf", "adrRatio", "currentReportingToTradingFxRate", "fxRateAsOf",
    "marketDataSourceId", "latestFilingSourceId", "fxSourceId", "summary", "baseline",
    "scenarios", "signals", "research", "sources",
  ], "analysis");
  if (!Array.isArray(value.sources) || value.sources.length < 8 || value.sources.length > 40) {
    fail("sources must contain between 8 and 40 items");
  }
  if (!Array.isArray(value.research) || value.research.length !== researchFramework.length) {
    fail(`research must contain exactly ${researchFramework.length} categories`);
  }
  if (!Array.isArray(value.scenarios) || value.scenarios.length !== 20) {
    fail("scenarios must contain exactly 20 items");
  }
  if (!Array.isArray(value.signals) || value.signals.length !== 4) {
    fail("signals must contain exactly four items");
  }
  return {
    ticker: nonEmptyString(value.ticker, "ticker", 12).toUpperCase(),
    company: nonEmptyString(value.company, "company", 200),
    exchange: nonEmptyString(value.exchange, "exchange", 80),
    securityType: enumValue(value.securityType, "securityType", [
      "common-stock",
      "adr",
      "preferred-stock",
      "reit",
      "other",
    ]),
    shareClass: nonEmptyString(value.shareClass, "shareClass", 100),
    instrumentId: nonEmptyString(value.instrumentId, "instrumentId", 100),
    instrumentIdType: enumValue(value.instrumentIdType, "instrumentIdType", [
      "cik",
      "isin",
      "sedol",
      "exchange-symbol",
      "other",
    ]),
    tradingCurrency: nonEmptyString(value.tradingCurrency, "tradingCurrency", 3).toUpperCase(),
    reportingCurrency: nonEmptyString(value.reportingCurrency, "reportingCurrency", 3).toUpperCase(),
    currentPrice: finiteNumber(value.currentPrice, "currentPrice", EPSILON, 1e9),
    priceAsOf: parseDate(value.priceAsOf, "priceAsOf", true),
    fiscalDataAsOf: parseDate(value.fiscalDataAsOf, "fiscalDataAsOf"),
    adrRatio: finiteNumber(value.adrRatio, "adrRatio", EPSILON, 1e6),
    currentReportingToTradingFxRate: finiteNumber(
      value.currentReportingToTradingFxRate,
      "currentReportingToTradingFxRate",
      EPSILON,
      1e6,
    ),
    fxRateAsOf: parseDate(value.fxRateAsOf, "fxRateAsOf", true),
    marketDataSourceId: nonEmptyString(value.marketDataSourceId, "marketDataSourceId", 40),
    latestFilingSourceId: nonEmptyString(value.latestFilingSourceId, "latestFilingSourceId", 40),
    fxSourceId: nonEmptyString(value.fxSourceId, "fxSourceId", 40),
    summary: nonEmptyString(value.summary, "summary", 3_000),
    baseline: parseBaseline(value.baseline),
    scenarios: value.scenarios.map(parseScenario),
    signals: value.signals.map((signal, index) => {
      if (!isRecord(signal)) fail(`signals[${index}] must be an object`);
      assertKeys(signal, ["label", "value", "tone", "detail"], `signals[${index}]`);
      return {
        label: nonEmptyString(signal.label, `signals[${index}].label`, 100),
        value: nonEmptyString(signal.value, `signals[${index}].value`, 100),
        tone: enumValue(signal.tone, `signals[${index}].tone`, ["good", "neutral", "bad"]),
        detail: nonEmptyString(signal.detail, `signals[${index}].detail`, 500),
      };
    }),
    research: value.research.map(parseResearch),
    sources: value.sources.map(parseSource),
  };
}

function auditReferences(ids: string[], sourceIds: Set<string>, label: string) {
  if (ids.some((id) => !sourceIds.has(id))) fail(`${label} references an unknown source ID`);
}

function sourceDomain(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

function canonicalSourceUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.searchParams.sort();
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  return parsed.toString();
}

function remapSourceIds(ids: string[], aliases: Map<string, string>): string[] {
  return [...new Set(ids.map((id) => aliases.get(id) ?? id))];
}

function mergeDuplicateSources(raw: RawAnalysis): RawAnalysis {
  const retainedByUrl = new Map<string, string>();
  const aliases = new Map<string, string>();
  const sources: RawAnalysis["sources"] = [];
  const merges: Array<{ retainedId: string; removedId: string; url: string }> = [];

  for (const source of raw.sources) {
    const key = canonicalSourceUrl(source.url);
    const retainedId = retainedByUrl.get(key);
    if (!retainedId) {
      retainedByUrl.set(key, source.id);
      aliases.set(source.id, source.id);
      sources.push(source);
      continue;
    }
    aliases.set(source.id, retainedId);
    merges.push({ retainedId, removedId: source.id, url: source.url });
  }

  if (merges.length === 0) return raw;
  console.warn("Merged duplicate analysis sources", { count: merges.length, merges });

  return {
    ...raw,
    marketDataSourceId: aliases.get(raw.marketDataSourceId) ?? raw.marketDataSourceId,
    latestFilingSourceId: aliases.get(raw.latestFilingSourceId) ?? raw.latestFilingSourceId,
    fxSourceId: aliases.get(raw.fxSourceId) ?? raw.fxSourceId,
    baseline: {
      ...raw.baseline,
      sourceIds: remapSourceIds(raw.baseline.sourceIds, aliases),
    },
    scenarios: raw.scenarios.map((scenario) => ({
      ...scenario,
      sourceIds: remapSourceIds(scenario.sourceIds, aliases),
    })),
    research: raw.research.map((finding) => ({
      ...finding,
      sourceIds: remapSourceIds(finding.sourceIds, aliases),
      questions: finding.questions.map((question) => ({
        ...question,
        sourceIds: remapSourceIds(question.sourceIds, aliases),
      })),
    })),
    sources,
  };
}

function deriveEvidenceStrength(finding: RawResearchFinding, sourceMap: Map<string, Source>): number {
  const referenced = new Set([...finding.sourceIds, ...finding.questions.flatMap(({ sourceIds }) => sourceIds)]);
  const sources = [...referenced].map((id) => sourceMap.get(id)).filter((source): source is Source => Boolean(source));
  const coverage =
    finding.questions.reduce(
      (sum, question) => sum + (question.status === "answered" ? 1 : question.status === "partial" ? 0.5 : 0),
      0,
    ) / finding.questions.length;
  const primaryCount = sources.filter(({ primary }) => primary).length;
  const independentDomains = new Set(sources.map(({ url }) => sourceDomain(url))).size;
  const sourceTypes = new Set(sources.map(({ type }) => type).filter((type) => type !== "news")).size;

  if (coverage >= 0.75 && primaryCount >= 1 && independentDomains >= 2 && sourceTypes >= 2) return 3;
  if (coverage >= 0.5 && sources.length >= 2 && independentDomains >= 1) return 2;
  if (coverage > 0 && sources.length >= 1) return 1;
  return 0;
}

function calculateConfidence(research: ResearchFinding[], sources: Source[]): number {
  const evidence = research.reduce((sum, item) => sum + item.evidenceStrength, 0) / (research.length * 3);
  const answered = research.flatMap(({ questions }) => questions).reduce(
    (sum, question) => sum + (question.status === "answered" ? 1 : question.status === "partial" ? 0.5 : 0),
    0,
  );
  const completeness = answered / (research.length * 4);
  const distinctDomains = new Set(sources.map(({ url }) => sourceDomain(url))).size;
  const sourceIndependence = Math.min(distinctDomains / 8, 1);
  const primaryDomains = new Set(sources.filter(({ primary }) => primary).map(({ url }) => sourceDomain(url))).size;
  const primaryCoverage = Math.min(primaryDomains / 4, 1);
  return Math.round(evidence * 45 + completeness * 25 + sourceIndependence * 15 + primaryCoverage * 15);
}

function metricValue(inputs: ValuationInputs, forecastRevenue: number): number {
  switch (inputs.valuationMetric) {
    case "revenue":
      return forecastRevenue;
    case "ebit":
      return forecastRevenue * (inputs.operatingMarginPct / 100);
    case "free-cash-flow":
      return forecastRevenue * (inputs.freeCashFlowMarginPct / 100);
    case "net-income":
      return forecastRevenue * (inputs.netIncomeMarginPct / 100);
    case "book-value":
    case "nav":
      return inputs.balanceSheetValue;
  }
}

function validateValuationPair(inputs: ValuationInputs, scenarioName: string) {
  const enterpriseMetrics = new Set(["revenue", "ebit", "free-cash-flow"]);
  const equityMetrics = new Set(["net-income", "book-value"]);
  if (inputs.valuationBasis === "enterprise-value-multiple" && !enterpriseMetrics.has(inputs.valuationMetric)) {
    fail(`${scenarioName} uses an incompatible enterprise-value metric`);
  }
  if (inputs.valuationBasis === "equity-value-multiple" && !equityMetrics.has(inputs.valuationMetric)) {
    fail(`${scenarioName} uses an incompatible equity-value metric`);
  }
  if (inputs.valuationBasis === "nav" && !["nav", "book-value"].includes(inputs.valuationMetric)) {
    fail(`${scenarioName} uses an incompatible NAV metric`);
  }
}

function deriveScenario(raw: RawScenario, baseline: BaselineFinancials, currentPrice: number): Omit<Scenario, "probability" | "priceRangeMin" | "priceRangeMax"> {
  validateValuationPair(raw.valuationInputs, raw.name);
  const inputs = raw.valuationInputs;
  const forecastRevenue = baseline.revenue * Math.pow(1 + inputs.revenueCagrPct / 100, 3);
  const valueMetric = metricValue(inputs, forecastRevenue);
  if (valueMetric < 0) fail(`${raw.name} produces a negative valuation metric`);

  let targetEnterpriseValue: number | null = null;
  let targetEquityReportingCurrency: number;
  if (inputs.valuationBasis === "enterprise-value-multiple") {
    targetEnterpriseValue = valueMetric * inputs.valuationMultiple;
    targetEquityReportingCurrency = targetEnterpriseValue + inputs.netCash;
  } else {
    targetEquityReportingCurrency = valueMetric * inputs.valuationMultiple;
  }
  if (targetEquityReportingCurrency < 0) targetEquityReportingCurrency = 0;
  const targetEquityValue = targetEquityReportingCurrency * inputs.reportingToTradingFxRate;
  const targetEnterpriseValueTradingCurrency =
    targetEnterpriseValue === null ? null : targetEnterpriseValue * inputs.reportingToTradingFxRate;
  const price = targetEquityValue / inputs.dilutedShares;
  if (!Number.isFinite(price) || price < 0 || price > currentPrice * 100) {
    fail(`${raw.name} produces an implausible terminal price`);
  }
  const terminalWealth = price + inputs.cumulativeDividendsPerShare;
  const totalReturnPct = (terminalWealth / currentPrice - 1) * 100;
  const annualizedReturnPct = (Math.pow(terminalWealth / currentPrice, 1 / 3) - 1) * 100;
  const type = totalReturnPct < -10 ? "bear" : totalReturnPct > 20 ? "bull" : "base";
  return {
    ...raw,
    price,
    targetEquityValue,
    targetEnterpriseValue: targetEnterpriseValueTradingCurrency,
    targetDilutedShares: inputs.dilutedShares,
    forecastRevenue,
    valuationMetricValue: valueMetric,
    totalReturnPct,
    annualizedReturnPct,
    type,
  };
}

function normalizeProbabilities(scenarios: RawScenario[], confidence: number): number[] {
  const totalWeight = scenarios.reduce((sum, scenario) => sum + scenario.relativeLikelihood, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) fail("Scenario likelihood weights are invalid");
  const reliability = Math.min(0.85, Math.max(0.25, confidence / 100));
  const uniform = 100 / scenarios.length;
  const exact = scenarios.map(
    ({ relativeLikelihood }) =>
      uniform * (1 - reliability) + (relativeLikelihood / totalWeight) * 100 * reliability,
  );
  const tenths = exact.map((value) => Math.floor(value * 10));
  let remaining = 1_000 - tenths.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value * 10 - tenths[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) tenths[order[index].index] += 1;
  remaining = 1_000 - tenths.reduce((sum, value) => sum + value, 0);
  if (remaining !== 0) fail("Probability normalization failed");
  return tenths.map((value) => value / 10);
}

function addPriceBuckets(scenarios: Array<Omit<Scenario, "priceRangeMin" | "priceRangeMax">>): Scenario[] {
  const ascending = [...scenarios].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  for (let index = 1; index < ascending.length; index += 1) {
    if (Math.abs(ascending[index].price - ascending[index - 1].price) < 0.01) {
      fail("Scenario terminal prices must be distinct so outcome buckets do not overlap");
    }
  }
  const withBuckets = ascending.map((scenario, index) => ({
    ...scenario,
    priceRangeMin: index === 0 ? 0 : (ascending[index - 1].price + scenario.price) / 2,
    priceRangeMax:
      index === ascending.length - 1 ? null : (scenario.price + ascending[index + 1].price) / 2,
  }));
  return withBuckets.sort((a, b) => b.price - a.price);
}

export function processAnalysis(value: unknown, requestedTicker: string, now = new Date()): Analysis {
  const parsed = parseRawAnalysis(value);
  const parsedSourceIds = new Set(parsed.sources.map(({ id }) => id));
  if (parsedSourceIds.size !== parsed.sources.length) fail("Source IDs must be unique");
  const raw = mergeDuplicateSources(parsed);
  if (raw.ticker !== requestedTicker.toUpperCase()) fail("Ticker mismatch");
  if (!CURRENCY.test(raw.tradingCurrency) || !CURRENCY.test(raw.reportingCurrency)) {
    fail("Trading and reporting currencies must be ISO 4217 codes");
  }
  if (raw.tradingCurrency === raw.reportingCurrency && Math.abs(raw.currentReportingToTradingFxRate - 1) > 0.001) {
    fail("FX rate must be 1 when trading and reporting currencies match");
  }
  const nowMs = now.getTime();
  const priceAsOfMs = new Date(raw.priceAsOf).getTime();
  const fxAsOfMs = new Date(raw.fxRateAsOf).getTime();
  const fiscalDataAsOfMs = new Date(raw.fiscalDataAsOf).getTime();
  if (priceAsOfMs > nowMs + 5 * 60_000) fail("Price timestamp is in the future");
  if (nowMs - priceAsOfMs > 7 * 24 * 60 * 60_000) fail("Market price is stale");
  if (fxAsOfMs > nowMs + 5 * 60_000 || nowMs - fxAsOfMs > 7 * 24 * 60 * 60_000) {
    fail("FX rate timestamp is stale or in the future");
  }
  if (fiscalDataAsOfMs > nowMs + 24 * 60 * 60_000) fail("Fiscal timestamp is in the future");
  if (nowMs - fiscalDataAsOfMs > 550 * 24 * 60 * 60_000) fail("Fiscal baseline is stale");

  const sourceIds = new Set(raw.sources.map(({ id }) => id));
  for (const id of [raw.marketDataSourceId, raw.latestFilingSourceId, raw.fxSourceId]) {
    if (!sourceIds.has(id)) fail("Instrument metadata references an unknown source ID");
  }
  auditReferences(raw.baseline.sourceIds, sourceIds, "baseline");

  const sources: Source[] = raw.sources.map((source) => ({
    ...source,
    primary: PRIMARY_SOURCE_TYPES.has(source.type),
  }));
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  for (const source of sources) {
    const accessedAtMs = new Date(source.accessedAt).getTime();
    if (accessedAtMs > nowMs + 5 * 60_000) {
      fail(`${source.id} has a future access timestamp`, {
        check: "source-accessed-at",
        sourceId: source.id,
        sourceUrl: source.url,
        sourceAccessedAt: source.accessedAt,
        serverNow: now.toISOString(),
        allowedClockSkewMs: 5 * 60_000,
        aheadByMs: accessedAtMs - nowMs,
      });
    }
    if (new Date(source.publishedAt).getTime() > accessedAtMs + 24 * 60 * 60_000) {
      fail(`${source.id} was accessed before it was published`, {
        check: "source-published-before-access",
        sourceId: source.id,
        sourceUrl: source.url,
        sourcePublishedAt: source.publishedAt,
        sourceAccessedAt: source.accessedAt,
      });
    }
  }
  if (sourceMap.get(raw.marketDataSourceId)?.type !== "market") {
    fail("marketDataSourceId must reference a market source");
  }
  if (!new Set<SourceType>(["filing", "company"]).has(sourceMap.get(raw.latestFilingSourceId)?.type as SourceType)) {
    fail("latestFilingSourceId must reference a filing or company source");
  }
  if (!new Set<SourceType>(["market", "government"]).has(sourceMap.get(raw.fxSourceId)?.type as SourceType)) {
    fail("fxSourceId must reference a market or government source");
  }
  if (!raw.baseline.sourceIds.some((id) => sourceMap.get(id)?.primary)) {
    fail("Baseline financials require at least one primary source");
  }
  const categoryIds = new Set(researchFramework.map(({ id }) => id));
  const returnedCategories = new Set(raw.research.map(({ categoryId }) => categoryId));
  if (
    returnedCategories.size !== categoryIds.size ||
    [...categoryIds].some((categoryId) => !returnedCategories.has(categoryId))
  ) {
    fail("Research coverage audit failed");
  }

  const research: ResearchFinding[] = raw.research.map((finding) => {
    const category = researchFramework.find(({ id }) => id === finding.categoryId);
    if (!category) fail(`Unknown research category ${finding.categoryId}`);
    const indices = new Set(finding.questions.map(({ questionIndex }) => questionIndex));
    if (indices.size !== 4 || [0, 1, 2, 3].some((index) => !indices.has(index))) {
      fail(`${finding.categoryId} must answer each framework question exactly once`);
    }
    auditReferences(finding.sourceIds, sourceIds, finding.categoryId);
    for (const question of finding.questions) {
      auditReferences(question.sourceIds, sourceIds, `${finding.categoryId} question ${question.questionIndex}`);
      if (question.status === "answered" && question.sourceIds.length === 0) {
        fail(`${finding.categoryId} has an answered question without evidence`);
      }
    }
    return {
      ...finding,
      questions: [...finding.questions].sort((a, b) => a.questionIndex - b.questionIndex),
      evidenceStrength: deriveEvidenceStrength(finding, sourceMap),
      unansweredQuestions: finding.questions
        .filter(({ status }) => status !== "answered")
        .map(({ questionIndex }) => category.questions[questionIndex]),
    };
  });

  const confidence = calculateConfidence(research, sources);
  const factorVectors = new Set<string>();
  const names = new Set<string>();
  raw.scenarios.forEach((scenario) => {
    auditReferences(scenario.sourceIds, sourceIds, scenario.name);
    if (!scenario.sourceIds.some((id) => sourceMap.get(id)?.primary)) {
      fail(`${scenario.name} requires at least one primary source`);
    }
    const name = scenario.name.toLowerCase();
    if (names.has(name)) fail("Scenario names must be unique");
    names.add(name);
    const vector = JSON.stringify(scenario.factorStates);
    if (factorVectors.has(vector)) fail("Scenario factor-state combinations must be unique");
    factorVectors.add(vector);
    if (
      raw.tradingCurrency === raw.reportingCurrency &&
      Math.abs(scenario.valuationInputs.reportingToTradingFxRate - 1) > 0.001
    ) {
      fail(`${scenario.name} must use an FX rate of 1 when currencies match`);
    }
  });

  const probabilities = normalizeProbabilities(raw.scenarios, confidence);
  const derived = raw.scenarios.map((scenario, index) => ({
    ...deriveScenario(scenario, raw.baseline, raw.currentPrice),
    probability: probabilities[index],
  }));
  const scenarios = addPriceBuckets(derived);
  const expectedPrice = scenarios.reduce((sum, scenario) => sum + scenario.probability * scenario.price, 0) / 100;
  const terminalPriceStandardDeviation = Math.sqrt(
    scenarios.reduce(
      (sum, scenario) => sum + scenario.probability * Math.pow(scenario.price - expectedPrice, 2),
      0,
    ) / 100,
  );
  const expectedTotalReturnPct =
    scenarios.reduce((sum, scenario) => sum + scenario.probability * scenario.totalReturnPct, 0) / 100;
  const expectedAnnualizedReturnPct =
    scenarios.reduce((sum, scenario) => sum + scenario.probability * scenario.annualizedReturnPct, 0) / 100;

  return {
    ...raw,
    sources,
    research,
    scenarios,
    expectedPrice,
    terminalPriceStandardDeviation,
    expectedTotalReturnPct,
    expectedAnnualizedReturnPct,
    confidence,
    probabilityMethod: "Evidence-shrunk relative likelihoods; server-normalized to 100.0%",
  };
}
