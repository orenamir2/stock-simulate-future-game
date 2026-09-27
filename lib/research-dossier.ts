import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Market } from "./market-support.ts";

const CHECKPOINT_FILE_PATTERN = /^[0-9TZ.-]+_[A-Z0-9.-]{1,24}_[a-z-]+_[0-9a-f-]+\.json$/;

export type ResearchDossierCheckpoint = {
  schemaVersion: 1;
  id: string;
  requestId: string;
  ticker: string;
  market: Market;
  requestStartedAt: string;
  researchCompletedAt: string;
  dossier: unknown;
};

function historyDirectory() {
  return process.env.ANALYSIS_HISTORY_DIR ?? resolve(process.cwd(), "data/analysis-history");
}

function checkpointDirectory() {
  return resolve(historyDirectory(), "research-dossiers");
}

function isCheckpoint(value: unknown): value is ResearchDossierCheckpoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<ResearchDossierCheckpoint>;
  return record.schemaVersion === 1
    && typeof record.id === "string"
    && CHECKPOINT_FILE_PATTERN.test(record.id)
    && typeof record.requestId === "string"
    && typeof record.ticker === "string"
    && typeof record.market === "string"
    && typeof record.requestStartedAt === "string"
    && typeof record.researchCompletedAt === "string"
    && typeof record.dossier === "object"
    && record.dossier !== null
    && !Array.isArray(record.dossier);
}

async function readCheckpoint(filename: string): Promise<ResearchDossierCheckpoint | null> {
  if (!CHECKPOINT_FILE_PATTERN.test(filename)) return null;
  try {
    const value = JSON.parse(await readFile(resolve(checkpointDirectory(), filename), "utf8")) as unknown;
    return isCheckpoint(value) && value.id === filename ? value : null;
  } catch (error) {
    console.warn("Skipped unreadable research dossier checkpoint", {
      filename,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function saveResearchDossierCheckpoint({
  requestId,
  ticker,
  market,
  requestStartedAt,
  researchCompletedAt,
  dossier,
}: Omit<ResearchDossierCheckpoint, "schemaVersion" | "id">): Promise<ResearchDossierCheckpoint> {
  const safeTicker = ticker.toUpperCase();
  if (!/^[A-Z0-9.-]{1,24}$/.test(safeTicker)) throw new Error("Cannot checkpoint an invalid ticker");
  const id = `${researchCompletedAt.replace(/[:]/g, "-")}_${safeTicker}_${market}_${requestId}.json`;
  if (!CHECKPOINT_FILE_PATTERN.test(id)) throw new Error("Cannot checkpoint invalid research metadata");
  const record: ResearchDossierCheckpoint = {
    schemaVersion: 1,
    id,
    requestId,
    ticker: safeTicker,
    market,
    requestStartedAt,
    researchCompletedAt,
    dossier,
  };
  const directory = checkpointDirectory();
  const destination = resolve(directory, id);
  const temporary = `${destination}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return record;
}

export async function loadRecentResearchDossierCheckpoint(
  ticker: string,
  market: Market,
  now = new Date(),
  maxAgeMs = 30 * 60_000,
): Promise<ResearchDossierCheckpoint | null> {
  const directory = checkpointDirectory();
  await mkdir(directory, { recursive: true });
  const filenames = (await readdir(directory))
    .filter((filename) => CHECKPOINT_FILE_PATTERN.test(filename))
    .sort()
    .reverse();
  for (const filename of filenames) {
    const checkpoint = await readCheckpoint(filename);
    if (!checkpoint || checkpoint.ticker !== ticker.toUpperCase() || checkpoint.market !== market) continue;
    const completedAtMs = Date.parse(checkpoint.researchCompletedAt);
    const ageMs = now.getTime() - completedAtMs;
    if (Number.isFinite(completedAtMs) && ageMs >= 0 && ageMs <= maxAgeMs) return checkpoint;
  }
  return null;
}

export async function removeResearchDossierCheckpoint(id: string): Promise<void> {
  if (!CHECKPOINT_FILE_PATTERN.test(id)) return;
  await unlink(resolve(checkpointDirectory(), id)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
