import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  loadRecentResearchDossierCheckpoint,
  removeResearchDossierCheckpoint,
  saveResearchDossierCheckpoint,
} from "../lib/research-dossier.ts";

test("research dossiers survive generation retries and expire", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "possible-research-dossier-"));
  const previousDirectory = process.env.ANALYSIS_HISTORY_DIR;
  process.env.ANALYSIS_HISTORY_DIR = directory;
  try {
    const completedAt = new Date("2026-09-27T09:00:00.000Z");
    const checkpoint = await saveResearchDossierCheckpoint({
      requestId: "123e4567-e89b-12d3-a456-426614174000",
      ticker: "NIKE",
      market: "auto",
      requestStartedAt: "2026-09-27T08:55:00.000Z",
      researchCompletedAt: completedAt.toISOString(),
      dossier: { ticker: "NIKE", sources: [] },
    });

    const persisted = JSON.parse(await readFile(
      resolve(directory, "research-dossiers", checkpoint.id),
      "utf8",
    )) as { ticker: string };
    assert.equal(persisted.ticker, "NIKE");
    assert.equal(
      (await loadRecentResearchDossierCheckpoint("NIKE", "auto", new Date("2026-09-27T09:20:00.000Z")))?.id,
      checkpoint.id,
    );
    assert.equal(
      await loadRecentResearchDossierCheckpoint("NIKE", "auto", new Date("2026-09-27T09:31:00.000Z")),
      null,
    );

    await removeResearchDossierCheckpoint(checkpoint.id);
    assert.equal(
      await loadRecentResearchDossierCheckpoint("NIKE", "auto", new Date("2026-09-27T09:20:00.000Z")),
      null,
    );
  } finally {
    if (previousDirectory === undefined) delete process.env.ANALYSIS_HISTORY_DIR;
    else process.env.ANALYSIS_HISTORY_DIR = previousDirectory;
    await rm(directory, { recursive: true, force: true });
  }
});
