import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isAnalysisPublishable } from "./analysis-engine.ts";
import type { Analysis } from "./analysis-types";

const HISTORY_FILE_PATTERN = /^[0-9TZ.-]+_[A-Z.-]{1,8}_[0-9a-f-]+\.json$/;

export type StoredAnalysis = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  analysis: Analysis;
};

export type AnalysisHistorySummary = {
  id: string;
  createdAt: string;
  ticker: string;
  company: string;
  tradingCurrency: string;
  currentPrice: number;
  expectedPrice: number;
  expectedTotalReturnPct: number;
  confidence: number;
  priceAsOf: string;
};

function historyDirectory() {
  return process.env.ANALYSIS_HISTORY_DIR ?? resolve(process.cwd(), "data/analysis-history");
}

function isStoredAnalysis(value: unknown): value is StoredAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<StoredAnalysis>;
  return record.schemaVersion === 1
    && typeof record.id === "string"
    && typeof record.createdAt === "string"
    && Boolean(record.analysis)
    && typeof record.analysis?.ticker === "string"
    && Array.isArray(record.analysis?.scenarios)
    && isAnalysisPublishable(record.analysis as Analysis);
}

function summary(record: StoredAnalysis): AnalysisHistorySummary {
  const { analysis } = record;
  return {
    id: record.id,
    createdAt: record.createdAt,
    ticker: analysis.ticker,
    company: analysis.company,
    tradingCurrency: analysis.tradingCurrency,
    currentPrice: analysis.currentPrice,
    expectedPrice: analysis.expectedPrice,
    expectedTotalReturnPct: analysis.expectedTotalReturnPct,
    confidence: analysis.confidence,
    priceAsOf: analysis.priceAsOf,
  };
}

async function readHistoryFile(filename: string): Promise<StoredAnalysis | null> {
  if (!HISTORY_FILE_PATTERN.test(filename)) return null;
  try {
    const value = JSON.parse(await readFile(resolve(historyDirectory(), filename), "utf8")) as unknown;
    return isStoredAnalysis(value) ? value : null;
  } catch (error) {
    console.warn("Skipped unreadable analysis history file", {
      filename,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function saveAnalysisHistory(
  analysis: Analysis,
  createdAt = new Date(),
): Promise<AnalysisHistorySummary> {
  const createdAtIso = createdAt.toISOString();
  const id = `${createdAtIso.replace(/[:]/g, "-")}_${analysis.ticker}_${randomUUID()}.json`;
  const record: StoredAnalysis = { schemaVersion: 1, id, createdAt: createdAtIso, analysis };
  const directory = historyDirectory();
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
  return summary(record);
}

export async function listAnalysisHistory(limit = 200): Promise<AnalysisHistorySummary[]> {
  const directory = historyDirectory();
  await mkdir(directory, { recursive: true });
  const filenames = (await readdir(directory))
    .filter((filename) => HISTORY_FILE_PATTERN.test(filename))
    .sort()
    .reverse()
    .slice(0, Math.max(1, Math.min(limit, 500)));
  const records = await Promise.all(filenames.map(readHistoryFile));
  return records.filter((record): record is StoredAnalysis => record !== null).map(summary);
}

export async function getAnalysisHistory(id: string): Promise<StoredAnalysis | null> {
  if (!HISTORY_FILE_PATTERN.test(id)) return null;
  const record = await readHistoryFile(id);
  return record?.id === id ? record : null;
}
