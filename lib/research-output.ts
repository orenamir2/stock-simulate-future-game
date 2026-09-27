const REQUIRED_RESEARCH_FIELDS = [
  "ticker",
  "company",
  "exchange",
  "securityType",
  "shareClass",
  "instrumentId",
  "instrumentIdType",
  "tradingCurrency",
  "reportingCurrency",
  "currentPrice",
  "priceAsOf",
  "fiscalDataAsOf",
  "adrRatio",
  "currentReportingToTradingFxRate",
  "fxRateAsOf",
  "marketDataSourceId",
  "latestFilingSourceId",
  "fxSourceId",
  "summary",
  "baseline",
  "eventCandidates",
  "research",
  "sources",
] as const;

export class ResearchDossierOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchDossierOutputError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonCandidates(output: string): string[] {
  const trimmed = output.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) candidates.push(fenced);
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  return [...new Set(candidates.filter(Boolean))];
}

export function parseResearchDossierOutput(output: string): Record<string, unknown> {
  let parsed: unknown;
  let parseError: unknown;
  for (const candidate of jsonCandidates(output)) {
    try {
      parsed = JSON.parse(candidate) as unknown;
      break;
    } catch (error) {
      parseError = error;
    }
  }
  if (!isRecord(parsed)) {
    throw new ResearchDossierOutputError(
      `Research did not return a JSON object${parseError instanceof Error ? `: ${parseError.message}` : ""}`,
    );
  }

  const allowedFields = new Set<string>(REQUIRED_RESEARCH_FIELDS);
  const missingFields = REQUIRED_RESEARCH_FIELDS.filter((field) => !Object.hasOwn(parsed, field));
  const unexpectedFields = Object.keys(parsed).filter((field) => !allowedFields.has(field));
  if (missingFields.length > 0) {
    throw new ResearchDossierOutputError(`Research JSON is missing fields: ${missingFields.join(", ")}`);
  }
  if (unexpectedFields.length > 0) {
    throw new ResearchDossierOutputError(`Research JSON has unexpected fields: ${unexpectedFields.join(", ")}`);
  }
  if (!Array.isArray(parsed.sources) || parsed.sources.length < 8 || parsed.sources.length > 40) {
    throw new ResearchDossierOutputError("Research JSON must contain between 8 and 40 sources");
  }
  if (!Array.isArray(parsed.research) || parsed.research.length !== 12) {
    throw new ResearchDossierOutputError("Research JSON must contain exactly 12 research categories");
  }
  if (!Array.isArray(parsed.eventCandidates) || parsed.eventCandidates.length < 3) {
    throw new ResearchDossierOutputError("Research JSON must contain at least 3 event candidates");
  }
  return parsed;
}
