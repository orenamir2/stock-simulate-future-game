import type { ChildProcessWithoutNullStreams } from "node:child_process";

type KillSignal = NodeJS.Signals | number;
type KillGroup = (pid: number, signal?: KillSignal) => boolean;
type SupervisedChild = Pick<ChildProcessWithoutNullStreams, "pid" | "kill" | "stdin" | "stdout" | "stderr">;

const SECRET_PATTERNS = [
  /\b(?:sk|sess|pat)-[A-Za-z0-9._-]{8,}\b/g,
  /\bBearer\s+[^\s,;]+/gi,
  /(["']?(?:access[_-]?token|refresh[_-]?token|authorization)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi,
];

export function sanitizeCodexErrorMessage(message: unknown, maxLength = 500): string {
  const normalized = typeof message === "string" ? message.replace(/[\r\n\t]+/g, " ").trim() : "";
  const redacted = SECRET_PATTERNS.reduce(
    (value, pattern) => value.replace(pattern, (match, prefix?: string) => `${prefix ?? ""}[redacted]`),
    normalized,
  );
  return (redacted || "Codex reported an unspecified terminal error").slice(0, maxLength);
}

export function configuredDurationMs(value: string | undefined, fallback: number): number {
  const configured = Number(value ?? fallback);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

export function terminateProcessTree(
  child: SupervisedChild,
  platform = process.platform,
  killGroup: KillGroup = process.kill.bind(process),
) {
  try {
    if (platform !== "win32" && child.pid) {
      killGroup(-child.pid, "SIGKILL");
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // The process may already have exited.
    }
  }
  child.stdin.destroy();
  child.stdout.destroy();
  child.stderr.destroy();
}
