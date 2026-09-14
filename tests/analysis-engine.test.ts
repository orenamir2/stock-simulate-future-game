import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalysisValidationError,
  processAnalysis,
  stampSourceAccessTimes,
} from "../lib/analysis-engine.ts";
import { makeRawAnalysis } from "./analysis-fixture.ts";

const fixtureNow = new Date("2025-01-01T00:00:00Z");
const processFixture = (raw = makeRawAnalysis()) => processAnalysis(raw, "TEST", fixtureNow);

test("derives probabilities, prices, standard deviation, returns, confidence and exhaustive price buckets", () => {
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
  const terminalPriceVariance = result.scenarios.reduce(
    (sum, scenario) => sum + scenario.probability * Math.pow(scenario.price - expectedPrice, 2),
    0,
  ) / 100;
  assert.ok(
    Math.abs(result.terminalPriceStandardDeviation - Math.sqrt(terminalPriceVariance)) < 1e-9,
  );
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

test("keeps different product event paths distinct under the same macro factor states", () => {
  const raw = makeRawAnalysis();
  raw.scenarios[1].factorStates = structuredClone(raw.scenarios[0].factorStates);
  const result = processFixture(raw);
  assert.equal(result.scenarios.length, 20);
  assert.equal(result.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0), 100);
  assert.ok(result.scenarios.some(({ name }) => name === "Scenario 1"));
  assert.ok(result.scenarios.some(({ name }) => name === "Scenario 2"));
});

test("derives joint path weights from conditional event assumptions", () => {
  const raw = makeRawAnalysis();
  raw.companyEvents[0].conditionalLikelihoods[0].likelihood = 0.9;
  raw.companyEvents[0].conditionalLikelihoods[1].likelihood = 0.1;
  const result = processFixture(raw);
  const paths = result.scenarios.flatMap(({ constituentPaths }) => constituentPaths);
  const mean = (stateId: string) => {
    const matching = paths.filter(({ eventPath }) => eventPath[0].stateId === stateId);
    return matching.reduce((sum, path) => sum + path.probability, 0) / matching.length;
  };
  assert.ok(mean("occurs") > mean("absent"));
  assert.equal(result.eventModelMetadata.inputProbabilityKind, "elicited-conditional-assumptions");
  assert.equal(result.eventModelMetadata.outputProbabilityKind, "evidence-calibrated-path-probabilities");
});

test("aggregates identical prices after valuation while preserving paths, probability and dividends", () => {
  const raw = makeRawAnalysis();
  raw.scenarios[1].valuationInputs = structuredClone(raw.scenarios[0].valuationInputs);
  raw.scenarios[1].valuationInputs.cumulativeDividendsPerShare = 9;
  const result = processFixture(raw);
  assert.equal(result.scenarios.length, 19);
  assert.equal(result.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0), 100);
  const bucket = result.scenarios.find(({ constituentPaths }) => constituentPaths.length === 2);
  assert.ok(bucket);
  assert.deepEqual(bucket.constituentPaths.map(({ name }) => name).sort(), ["Scenario 1", "Scenario 2"]);
  assert.equal(
    bucket.probability,
    bucket.constituentPaths.reduce((sum, path) => sum + path.probability, 0),
  );
  const expectedWealth = bucket.constituentPaths.reduce(
    (sum, path) => sum + path.probability * path.terminalWealth,
    0,
  ) / bucket.probability;
  assert.ok(Math.abs(expectedWealth / raw.currentPrice * 100 - 100 - bucket.totalReturnPct) < 1e-9);
  assert.deepEqual(
    bucket.constituentPaths.map(({ cumulativeDividendsPerShare }) => cumulativeDividendsPerShare).sort(),
    [1, 9],
  );
});

test("requires regulatory approval to occur before commercial sales", () => {
  const raw = makeRawAnalysis();
  raw.companyEvents[3].name = "Regulatory approval";
  raw.companyEvents[4].name = "Commercial sales";
  raw.companyEvents[4].prerequisiteIds = [raw.companyEvents[3].id];
  for (let index = 16; index < 20; index += 1) {
    raw.scenarios[index].eventPath[3].stateId = "occurs";
  }
  assert.doesNotThrow(() => processFixture(structuredClone(raw)));
  raw.scenarios[16].eventPath[4].occursOn = "2026-03-01";
  assert.throws(() => processFixture(raw), /before required event/);
});

test("rejects incompatible export prohibition and unrestricted-sales states", () => {
  const raw = makeRawAnalysis();
  raw.companyEvents[0].states[0].label = "Export prohibited";
  raw.companyEvents[0].states[0].incompatibleStateIds = ["event-2:occurs"];
  raw.companyEvents[1].states[0].label = "Unrestricted affected-market sales";
  assert.throws(() => processFixture(raw), /combines incompatible states/);
});

test("deduplicates overlapping revenue exposure across joint disruptions", () => {
  const raw = makeRawAnalysis();
  raw.companyEvents[0].states[0].revenueImpacts = [{ exposureId: "product-a", impactPct: -5 }];
  raw.companyEvents[1].states[0].revenueImpacts = [{ exposureId: "product-a", impactPct: -12 }];
  raw.companyEvents[2].states[0].revenueImpacts = [{ exposureId: "product-a", impactPct: -8 }];
  const result = processFixture(raw);
  const path = result.scenarios.flatMap(({ constituentPaths }) => constituentPaths)
    .find(({ name }) => name === "Scenario 8");
  assert.deepEqual(path?.revenueImpacts, [{ exposureId: "product-a", impactPct: -12 }]);
  const scenario = result.scenarios.find(({ constituentPaths }) =>
    constituentPaths.some(({ name }) => name === "Scenario 8")
  );
  const inputs = raw.scenarios[7].valuationInputs;
  const expectedRevenue = raw.baseline.revenue * Math.pow(1 + inputs.revenueCagrPct / 100, 3) * 0.88;
  assert.ok(scenario && Math.abs(scenario.forecastRevenue - expectedRevenue) < 1e-9);
});

test("rejects cyclic company-event prerequisites", () => {
  const raw = makeRawAnalysis();
  raw.companyEvents[0].prerequisiteIds = [raw.companyEvents[1].id];
  raw.companyEvents[1].prerequisiteIds = [raw.companyEvents[0].id];
  assert.throws(() => processFixture(raw), /prerequisites contain a cycle/);
});

test("drops malformed and scenario-level invalid entries while retaining an analysis", () => {
  const raw = makeRawAnalysis();
  (raw.scenarios[0] as unknown as Record<string, unknown>).relativeLikelihood = -1;
  raw.scenarios[1].valuationInputs.valuationBasis = "enterprise-value-multiple";
  raw.scenarios[1].valuationInputs.valuationMetric = "net-income";
  raw.scenarios[2].sourceIds = ["unknown"];
  const result = processFixture(raw);
  assert.equal(result.scenarios.length, 17);
  assert.equal(result.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0), 100);
  assert.match(result.probabilityMethod, /3 invalid scenarios removed/);
});

test("drops unsupported valuation formulas", () => {
  const raw = makeRawAnalysis();
  raw.scenarios[0].valuationInputs.valuationBasis = "enterprise-value-multiple";
  raw.scenarios[0].valuationInputs.valuationMetric = "net-income";
  const result = processFixture(raw);
  assert.equal(result.scenarios.length, 19);
  assert.equal(result.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0), 100);
});

test("requires evidence for every answered research question", () => {
  const raw = makeRawAnalysis();
  raw.research[0].questions[0].sourceIds = [];
  assert.throws(() => processFixture(raw), /answered question without evidence/);

  const partial = makeRawAnalysis();
  partial.research[0].questions[0].status = "partial";
  partial.research[0].questions[0].sourceIds = [];
  assert.throws(() => processFixture(partial), /partial question without evidence/);
});

test("merges duplicate source URLs and remaps every citation", () => {
  const duplicate = makeRawAnalysis();
  duplicate.sources[1].url = `${duplicate.sources[0].url}#financials`;
  const result = processFixture(duplicate);
  assert.equal(result.sources.length, 7);
  assert.deepEqual(result.baseline.sourceIds, ["s1"]);
  assert.ok(result.scenarios.every(({ sourceIds }) => !sourceIds.includes("s2")));
  assert.ok(result.research.every(({ sourceIds, questions }) =>
    !sourceIds.includes("s2") && questions.every((question) => !question.sourceIds.includes("s2"))
  ));
});

test("still rejects duplicate source IDs and ticker mismatches", () => {
  const duplicate = makeRawAnalysis();
  duplicate.sources[1].id = duplicate.sources[0].id;
  assert.throws(() => processFixture(duplicate), /Source IDs must be unique/);
  assert.throws(() => processAnalysis(makeRawAnalysis(), "OTHER", fixtureNow), /Ticker mismatch/);
});

test("repairs incompatible singleton source references from compatible ledger entries", () => {
  const raw = makeRawAnalysis();
  raw.marketDataSourceId = "missing-market-source";
  raw.latestFilingSourceId = "s5";
  raw.fxSourceId = "s2";
  const result = processFixture(raw);

  assert.equal(result.marketDataSourceId, "s8");
  assert.equal(result.latestFilingSourceId, "s1");
  assert.equal(result.fxSourceId, "s8");
});

test("normalizes all same-currency FX values instead of rejecting the analysis", () => {
  const raw = makeRawAnalysis();
  raw.currentReportingToTradingFxRate = 1.2;
  raw.fxRateAsOf = "2024-12-30T12:00:00Z";
  raw.fxSourceId = "s4";
  raw.scenarios[0].valuationInputs.reportingToTradingFxRate = 1.2;
  const result = processFixture(raw);

  assert.equal(result.currentReportingToTradingFxRate, 1);
  assert.equal(result.fxRateAsOf, result.priceAsOf);
  assert.equal(result.fxSourceId, result.marketDataSourceId);
  assert.ok(result.scenarios.every(({ valuationInputs }) => valuationInputs.reportingToTradingFxRate === 1));
  assert.equal(result.scenarios.length, 20);
});

test("repairs cross-currency FX references only from identifiable FX evidence", () => {
  const raw = makeRawAnalysis();
  raw.tradingCurrency = "EUR";
  raw.currentReportingToTradingFxRate = 0.96;
  raw.fxSourceId = "s2";
  raw.sources[3].title = "USD to EUR foreign exchange rate";
  raw.scenarios.forEach(({ valuationInputs }) => {
    valuationInputs.reportingToTradingFxRate = 0.96;
  });
  const result = processFixture(raw);

  assert.equal(result.fxSourceId, "s4");
  assert.equal(result.currentReportingToTradingFxRate, 0.96);
});

test("still rejects singleton references when the ledger has no compatible source", () => {
  const raw = makeRawAnalysis();
  raw.sources = raw.sources.map((source) => source.type === "market" ? { ...source, type: "news" } : source);
  assert.throws(
    () => processFixture(raw),
    (error) => error instanceof AnalysisValidationError &&
      /marketDataSourceId has no compatible market source/.test(error.message) &&
      error.details.field === "marketDataSourceId",
  );
});

test("stamps model-supplied source access times with the authoritative server time", () => {
  const raw = makeRawAnalysis();
  raw.sources[1].accessedAt = "2025-01-01T02:00:00Z";
  const stamped = stampSourceAccessTimes(raw, fixtureNow);
  const result = processAnalysis(stamped.value, "TEST", fixtureNow);

  assert.ok(result.sources.every(({ accessedAt }) => accessedAt === fixtureNow.toISOString()));
  assert.deepEqual(stamped.diagnostics.futureOriginals, [{
    id: "s2",
    accessedAt: "2025-01-01T02:00:00Z",
    aheadByMs: 2 * 60 * 60_000,
  }]);
  assert.equal(stamped.diagnostics.stampedSourceCount, raw.sources.length);
});

test("keeps rejecting future source access times that bypass server stamping", () => {
  const raw = makeRawAnalysis();
  raw.sources[1].accessedAt = "2025-01-01T02:00:00Z";
  assert.throws(
    () => processFixture(raw),
    (error) => error instanceof AnalysisValidationError &&
      error.details.sourceId === "s2" &&
      error.details.aheadByMs === 2 * 60 * 60_000,
  );
});

test("discards homepage sources and their citations while rejecting unsafe URLs", () => {
  const homepage = makeRawAnalysis();
  homepage.sources[1].url = "https://investor.example.com/";
  const recovered = processFixture(homepage);
  assert.equal(recovered.sources.length, 7);
  assert.ok(!recovered.sources.some(({ id }) => id === "s2"));
  assert.deepEqual(recovered.baseline.sourceIds, ["s1"]);
  assert.ok(recovered.scenarios.every(({ sourceIds }) => !sourceIds.includes("s2")));
  assert.ok(recovered.research.every(({ sourceIds, questions }) =>
    !sourceIds.includes("s2") && questions.every((question) => !question.sourceIds.includes("s2"))
  ));

  const privateHost = makeRawAnalysis();
  privateHost.sources[2].url = "http://127.0.0.1/document";
  assert.throws(() => processFixture(privateHost), /private host/);

  const placeholder = makeRawAnalysis();
  placeholder.sources[0].url = "https://example.invalid/not-real-evidence";
  assert.throws(() => processFixture(placeholder), /real, retrievable evidence source/);
});

test("rejects analyses with effectively empty research", () => {
  const raw = makeRawAnalysis();
  for (const finding of raw.research) {
    for (const question of finding.questions) {
      question.status = "unanswered";
      question.sourceIds = [];
    }
  }
  assert.throws(
    () => processFixture(raw),
    (error) => error instanceof AnalysisValidationError
      && error.details.check === "minimum-research-coverage",
  );
});

test("rejects duplicate joint event paths", () => {
  const raw = makeRawAnalysis();
  raw.scenarios[1].eventPath = structuredClone(raw.scenarios[0].eventPath);
  assert.throws(
    () => processFixture(raw),
    /duplicates an existing company event path/,
  );
});
