import assert from "node:assert/strict";
import test from "node:test";
import {
  parseScenarioGenerationOutput,
  scenarioGenerationRetryCorrection,
  ScenarioGenerationOutputError,
} from "../lib/scenario-output.ts";

function scenarioPayload(): Record<string, unknown> {
  return {
    eventModelMetadata: { pathGeneration: "enumerated" },
    companyEvents: [{ id: "event-1" }],
    scenarios: Array.from({ length: 20 }, (_, index) => ({ id: `scenario-${index + 1}` })),
    signals: Array.from({ length: 4 }, (_, index) => ({ id: `signal-${index + 1}` })),
  };
}

test("parses direct, fenced, and annotated scenario JSON", () => {
  const value = scenarioPayload();
  const json = JSON.stringify(value);
  assert.deepEqual(parseScenarioGenerationOutput(json).scenarios, value.scenarios);
  assert.deepEqual(parseScenarioGenerationOutput(`\`\`\`json\n${json}\n\`\`\``), value);
  assert.deepEqual(parseScenarioGenerationOutput(`Scenario payload follows:\n${json}\nDone.`), value);
});

test("reports all out-of-window selections and supplies their bounds to the retry", () => {
  const payload = scenarioPayload();
  payload.companyEvents = [{
    id: "capital-allocation",
    dateWindow: { earliest: "2026-10-01", latest: "2027-12-31" },
  }];
  payload.scenarios = Array.from({ length: 20 }, (_, index) => ({
    name: `Scenario ${index + 1}`,
    eventPath: [{
      eventId: "capital-allocation",
      stateId: index % 2 ? "defensive" : "does-not-occur",
      occursOn: index === 0 ? "2026-09-30" : index === 1 ? "2028-01-01" : "2027-12-31",
    }],
  }));
  assert.throws(() => parseScenarioGenerationOutput(JSON.stringify(payload)), (error) => {
    assert.ok(error instanceof ScenarioGenerationOutputError);
    assert.equal(error.details.check, "event-date-window");
    const violations = error.details.violations as Record<string, unknown>[];
    assert.equal(violations.length, 2);
    assert.deepEqual(violations[0].dateWindow, { earliest: "2026-10-01", latest: "2027-12-31" });
    assert.equal(violations[1].eventOccursOn, "2028-01-01");
    const correction = scenarioGenerationRetryCorrection(error);
    assert.ok(correction.includes(error.message));
    assert.match(correction, /2026-09-30/);
    assert.match(correction, /2027-12-31/);
    assert.match(correction, /Scenario 2/);
    return true;
  });
  for (const scenario of payload.scenarios as { eventPath: { occursOn: string }[] }[]) {
    scenario.eventPath[0].occursOn = "2026-10-01";
  }
  assert.doesNotThrow(() => parseScenarioGenerationOutput(JSON.stringify(payload)));
});

test("rejects missing and unexpected scenario fields", () => {
  const missing = scenarioPayload();
  delete missing.signals;
  assert.throws(() => parseScenarioGenerationOutput(JSON.stringify(missing)), ScenarioGenerationOutputError);
  assert.throws(
    () => parseScenarioGenerationOutput(JSON.stringify({ ...scenarioPayload(), research: [] })),
    /unexpected fields: research/,
  );
});

test("rejects invalid top-level scenario collection sizes", () => {
  assert.throws(
    () => parseScenarioGenerationOutput(JSON.stringify({ ...scenarioPayload(), scenarios: [] })),
    /exactly 20 scenarios/,
  );
  assert.throws(
    () => parseScenarioGenerationOutput(JSON.stringify({ ...scenarioPayload(), signals: [] })),
    /exactly 4 signals/,
  );
  assert.throws(
    () => parseScenarioGenerationOutput(JSON.stringify({ ...scenarioPayload(), companyEvents: [] })),
    /between 1 and 20 company events/,
  );
});

test("rejects incomplete conditional-likelihood sets with actionable diagnostics", () => {
  const payload = scenarioPayload();
  payload.companyEvents = [{
    id: "fy27-reset",
    states: [{ id: "bear" }, { id: "base" }, { id: "bull" }],
    conditionalLikelihoods: [
      { stateId: "bear", givenStateIds: ["q1-fy27:q1-mixed"] },
      { stateId: "base", givenStateIds: ["q1-fy27:q1-mixed"] },
    ],
  }];
  assert.throws(
    () => parseScenarioGenerationOutput(JSON.stringify(payload)),
    (error) => error instanceof ScenarioGenerationOutputError
      && error.details.check === "event-conditional-coverage"
      && assert.deepEqual(error.details.missingStateIds, ["bull"]) === undefined
      && /missing: bull/.test(error.message),
  );
});
