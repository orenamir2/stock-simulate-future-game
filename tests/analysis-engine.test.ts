import assert from "node:assert/strict";
import test from "node:test";
import { AnalysisValidationError, processAnalysis } from "../lib/analysis-engine.ts";
import { makeRawAnalysis } from "./analysis-fixture.ts";

const fixtureNow = new Date("2025-01-01T00:00:00Z");
const processFixture = (raw = makeRawAnalysis()) => processAnalysis(raw, "TEST", fixtureNow);

test("derives probabilities, prices, returns, confidence and exhaustive price buckets", () => {
  const result = processFixture();
  assert.equal(result.scenarios.length, 20);
  assert.equal(result.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0), 100);
  assert.ok(result.confidence > 0 && result.confidence <= 100);
  assert.match(result.probabilityMethod, /server-normalized/i);

  const expectedPrice = result.scenarios.reduce(
    (sum, scenario) => sum + scenario.probability * scenario.price,
    0,
  ) / 100;
  assert.ok(Math.abs(result.expectedPrice - expectedPrice) < 1e-9);
  for (const scenario of result.scenarios) {
    assert.ok(Math.abs(scenario.price - scenario.targetEquityValue / scenario.targetDilutedShares) < 1e-9);
    assert.ok(Number.isFinite(scenario.totalReturnPct));
    assert.ok(Number.isFinite(scenario.annualizedReturnPct));
  }

  const ascending = [...result.scenarios].sort((a, b) => a.price - b.price);
  assert.equal(ascending[0].priceRangeMin, 0);
  assert.equal(ascending.at(-1)?.priceRangeMax, null);
  for (let index = 1; index < ascending.length; index += 1) {
    assert.equal(ascending[index - 1].priceRangeMax, ascending[index].priceRangeMin);
  }
});

test("rejects model-supplied calculated fields", () => {
  const raw = makeRawAnalysis();
  (raw as unknown as Record<string, unknown>).expectedPrice = 999;
  assert.throws(
    () => processFixture(raw),
    (error) => error instanceof AnalysisValidationError && /unexpected fields: expectedPrice/.test(error.message),
  );
});

test("rejects duplicate scenario factor vectors", () => {
  const raw = makeRawAnalysis();
  raw.scenarios[1].factorStates = structuredClone(raw.scenarios[0].factorStates);
  assert.throws(() => processFixture(raw), /factor-state combinations must be unique/);
});

test("rejects unsupported valuation formulas", () => {
  const raw = makeRawAnalysis();
  raw.scenarios[0].valuationInputs.valuationBasis = "enterprise-value-multiple";
  raw.scenarios[0].valuationInputs.valuationMetric = "net-income";
  assert.throws(() => processFixture(raw), /incompatible enterprise-value metric/);
});

test("requires evidence for every answered research question", () => {
  const raw = makeRawAnalysis();
  raw.research[0].questions[0].sourceIds = [];
  assert.throws(() => processFixture(raw), /answered question without evidence/);
});

test("rejects duplicate source URLs and ticker mismatches", () => {
  const duplicate = makeRawAnalysis();
  duplicate.sources[1].url = duplicate.sources[0].url;
  assert.throws(() => processFixture(duplicate), /Source URLs must be unique/);
  assert.throws(() => processAnalysis(makeRawAnalysis(), "OTHER", fixtureNow), /Ticker mismatch/);
});

test("rejects homepage and private-network source URLs", () => {
  const homepage = makeRawAnalysis();
  homepage.sources[2].url = "https://regulator.example.org/";
  assert.throws(() => processFixture(homepage), /not a homepage/);

  const privateHost = makeRawAnalysis();
  privateHost.sources[2].url = "http://127.0.0.1/document";
  assert.throws(() => processFixture(privateHost), /private host/);
});
