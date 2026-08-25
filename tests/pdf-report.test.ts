import assert from "node:assert/strict";
import test from "node:test";
import { processAnalysis } from "../lib/analysis-engine.ts";
import { analysisReportFilename, createAnalysisReportPdf } from "../lib/pdf-report.ts";
import { makeRawAnalysis } from "./analysis-fixture.ts";

test("generates a downloadable analysis PDF", () => {
  const analysis = processAnalysis(makeRawAnalysis(), "TEST", new Date("2024-12-31T18:00:00Z"));
  const pdf = createAnalysisReportPdf(analysis);
  const text = new TextDecoder().decode(pdf);

  assert.ok(pdf.length > 10_000);
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /Test Company/);
  assert.match(text, /SCENARIO BOOK/);
  assert.match(text, /SOURCE LEDGER/);
  assert.match(text, /\/Count [2-9]/);
  assert.match(text, /%%EOF\n$/);
  assert.equal(analysisReportFilename(analysis), "possible-test-2024-12-31.pdf");
});
