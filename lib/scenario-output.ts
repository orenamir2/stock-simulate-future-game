const REQUIRED_SCENARIO_FIELDS = [
  "eventModelMetadata",
  "companyEvents",
  "scenarios",
  "signals",
] as const;

export class ScenarioGenerationOutputError extends Error {
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ScenarioGenerationOutputError";
    this.details = details;
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

function validateConditionalLikelihoodSets(companyEvents: unknown[]) {
  for (let eventIndex = 0; eventIndex < companyEvents.length; eventIndex += 1) {
    const event = companyEvents[eventIndex];
    if (!isRecord(event) || !Array.isArray(event.states) || !Array.isArray(event.conditionalLikelihoods)) {
      continue;
    }
    const eventId = typeof event.id === "string" ? event.id : `companyEvents[${eventIndex}]`;
    const stateIds = event.states.flatMap((state) =>
      isRecord(state) && typeof state.id === "string" ? [state.id] : []
    );
    // Leave malformed state records and duplicate state IDs to the full analysis
    // validator. This early audit is specifically for complete conditional tables.
    if (stateIds.length !== event.states.length || new Set(stateIds).size !== stateIds.length) continue;

    const groups = new Map<string, string[]>();
    for (const likelihood of event.conditionalLikelihoods) {
      if (
        !isRecord(likelihood)
        || typeof likelihood.stateId !== "string"
        || !Array.isArray(likelihood.givenStateIds)
        || likelihood.givenStateIds.some((stateId) => typeof stateId !== "string")
      ) {
        continue;
      }
      const condition = [...likelihood.givenStateIds].sort().join("|");
      groups.set(condition, [...(groups.get(condition) ?? []), likelihood.stateId]);
    }

    for (const [condition, groupStateIds] of groups) {
      const counts = new Map<string, number>();
      for (const stateId of groupStateIds) counts.set(stateId, (counts.get(stateId) ?? 0) + 1);
      const missingStateIds = stateIds.filter((stateId) => !counts.has(stateId));
      const duplicateStateIds = stateIds.filter((stateId) => (counts.get(stateId) ?? 0) > 1);
      const unexpectedStateIds = [...counts.keys()].filter((stateId) => !stateIds.includes(stateId));
      if (missingStateIds.length === 0 && duplicateStateIds.length === 0 && unexpectedStateIds.length === 0) {
        continue;
      }
      const conditionLabel = condition || "unconditional";
      throw new ScenarioGenerationOutputError(
        `Event ${eventId} conditional set '${conditionLabel}' must cover every state exactly once`
          + ` (missing: ${missingStateIds.join(", ") || "none"};`
          + ` duplicated: ${duplicateStateIds.join(", ") || "none"};`
          + ` unexpected: ${unexpectedStateIds.join(", ") || "none"})`,
        {
          check: "event-conditional-coverage",
          eventId,
          condition: conditionLabel,
          expectedStateIds: stateIds,
          observedStateIds: groupStateIds,
          missingStateIds,
          duplicateStateIds,
          unexpectedStateIds,
        },
      );
    }
  }
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
  validateConditionalLikelihoodSets(parsed.companyEvents);
  if (!Array.isArray(parsed.scenarios) || parsed.scenarios.length !== 20) {
    throw new ScenarioGenerationOutputError("Scenario JSON must contain exactly 20 scenarios");
  }
  if (!Array.isArray(parsed.signals) || parsed.signals.length !== 4) {
    throw new ScenarioGenerationOutputError("Scenario JSON must contain exactly 4 signals");
  }
  return parsed;
}
