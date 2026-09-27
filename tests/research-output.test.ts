import assert from "node:assert/strict";
import test from "node:test";
import { parseResearchDossierOutput, ResearchDossierOutputError } from "../lib/research-output.ts";

function dossier() {
  return {
    ticker: "NIKE",
    company: "Nike",
    exchange: "NYSE",
    securityType: "common-stock",
    shareClass: "Class B",
    instrumentId: "320187",
    instrumentIdType: "cik",
    tradingCurrency: "USD",
    reportingCurrency: "USD",
    currentPrice: 70,
    priceAsOf: "2026-09-25T20:00:00Z",
    fiscalDataAsOf: "2026-05-31",
    adrRatio: 1,
    currentReportingToTradingFxRate: 1,
    fxRateAsOf: "2026-09-25T20:00:00Z",
    marketDataSourceId: "s1",
    latestFilingSourceId: "s2",
    fxSourceId: "s1",
    summary: "Summary",
    baseline: {},
    eventCandidates: [{}, {}, {}],
    research: Array.from({ length: 12 }, () => ({})),
    sources: Array.from({ length: 8 }, () => ({})),
  };
}

test("parses direct and fenced research JSON", () => {
  const value = dossier();
  assert.equal(parseResearchDossierOutput(JSON.stringify(value)).ticker, "NIKE");
  assert.equal(parseResearchDossierOutput(`Result:\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``).ticker, "NIKE");
});

test("rejects incomplete and expanded research objects", () => {
  const missing = dossier() as Record<string, unknown>;
  delete missing.sources;
  assert.throws(() => parseResearchDossierOutput(JSON.stringify(missing)), ResearchDossierOutputError);
  assert.throws(
    () => parseResearchDossierOutput(JSON.stringify({ ...dossier(), extra: true })),
    ResearchDossierOutputError,
  );
});
