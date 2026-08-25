import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { processAnalysis } from "../lib/analysis-engine.ts";
import {
  getAnalysisHistory,
  listAnalysisHistory,
  saveAnalysisHistory,
} from "../lib/analysis-history.ts";
import { makeRawAnalysis } from "./analysis-fixture.ts";

test("persists, lists, and reloads dated analysis snapshots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "possible-history-"));
  const previousDirectory = process.env.ANALYSIS_HISTORY_DIR;
  process.env.ANALYSIS_HISTORY_DIR = directory;
  try {
    const analysis = processAnalysis(makeRawAnalysis(), "TEST", new Date("2025-01-01T00:00:00Z"));
    const saved = await saveAnalysisHistory(analysis, new Date("2025-01-02T03:04:05Z"));

    assert.equal(saved.createdAt, "2025-01-02T03:04:05.000Z");
    assert.equal(saved.ticker, "TEST");
    assert.match(saved.id, /_TEST_/);

    const items = await listAnalysisHistory();
    assert.equal(items.length, 1);
    assert.deepEqual(items[0], saved);

    const record = await getAnalysisHistory(saved.id);
    assert.equal(record?.analysis.company, "Test Company");
    assert.equal(record?.analysis.scenarios.length, 20);
    assert.equal(await getAnalysisHistory("../../not-safe.json"), null);
  } finally {
    if (previousDirectory === undefined) delete process.env.ANALYSIS_HISTORY_DIR;
    else process.env.ANALYSIS_HISTORY_DIR = previousDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});
