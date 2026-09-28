const REQUIRED_SCENARIO_FIELDS = [
  "eventModelMetadata",
  "companyEvents",
  "scenarios",
  "signals",
] as const;

export class ScenarioGenerationOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScenarioGenerationOutputError";
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

export function parseScenarioGenerationOutput(output: string): Record<string, unknown> {
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
    throw new ScenarioGenerationOutputError(
      `Scenario generation did not return a JSON object${parseError instanceof Error ? `: ${parseError.message}` : ""}`,
    );
  }

  const allowedFields = new Set<string>(REQUIRED_SCENARIO_FIELDS);
  const missingFields = REQUIRED_SCENARIO_FIELDS.filter((field) => !Object.hasOwn(parsed, field));
  const unexpectedFields = Object.keys(parsed).filter((field) => !allowedFields.has(field));
  if (missingFields.length > 0) {
    throw new ScenarioGenerationOutputError(`Scenario JSON is missing fields: ${missingFields.join(", ")}`);
  }
  if (unexpectedFields.length > 0) {
    throw new ScenarioGenerationOutputError(`Scenario JSON has unexpected fields: ${unexpectedFields.join(", ")}`);
  }
  if (!isRecord(parsed.eventModelMetadata)) {
    throw new ScenarioGenerationOutputError("Scenario JSON must contain eventModelMetadata as an object");
  }
  if (!Array.isArray(parsed.companyEvents) || parsed.companyEvents.length < 1 || parsed.companyEvents.length > 20) {
    throw new ScenarioGenerationOutputError("Scenario JSON must contain between 1 and 20 company events");
  }
  if (!Array.isArray(parsed.scenarios) || parsed.scenarios.length !== 20) {
    throw new ScenarioGenerationOutputError("Scenario JSON must contain exactly 20 scenarios");
  }
  if (!Array.isArray(parsed.signals) || parsed.signals.length !== 4) {
    throw new ScenarioGenerationOutputError("Scenario JSON must contain exactly 4 signals");
  }
  return parsed;
}
