import assert from "node:assert/strict";
import test from "node:test";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import {
  configuredDurationMs,
  sanitizeCodexErrorMessage,
  terminateProcessTree,
} from "../lib/codex-supervisor.ts";

function fakeChild(pid = 42) {
  const destroyed: string[] = [];
  const directKills: Array<NodeJS.Signals | number | undefined> = [];
  const stream = (name: string) => ({ destroy: () => { destroyed.push(name); } });
  const child = {
    pid,
    kill: (signal?: NodeJS.Signals | number) => {
      directKills.push(signal);
      return true;
    },
    stdin: stream("stdin"),
    stdout: stream("stdout"),
    stderr: stream("stderr"),
  } as unknown as ChildProcessWithoutNullStreams;
  return { child, destroyed, directKills };
}

test("terminates the complete Unix process group and closes its pipes", () => {
  const { child, destroyed, directKills } = fakeChild();
  const groupKills: Array<[number, NodeJS.Signals | number | undefined]> = [];
  terminateProcessTree(child, "linux", (pid, signal) => {
    groupKills.push([pid, signal]);
    return true;
  });
  assert.deepEqual(groupKills, [[-42, "SIGKILL"]]);
  assert.deepEqual(directKills, []);
  assert.deepEqual(destroyed.sort(), ["stderr", "stdin", "stdout"]);
});

test("falls back to killing the direct child when group termination fails", () => {
  const { child, destroyed, directKills } = fakeChild();
  terminateProcessTree(child, "linux", () => {
    throw new Error("group already gone");
  });
  assert.deepEqual(directKills, ["SIGKILL"]);
  assert.deepEqual(destroyed.sort(), ["stderr", "stdin", "stdout"]);
});

test("sanitizes terminal event messages before logging", () => {
  const sanitized = sanitizeCodexErrorMessage(
    "request failed\nAuthorization: Bearer secret-value access_token=token-value sk-secret123456789",
  );
  assert.doesNotMatch(sanitized, /secret-value|token-value|sk-secret/);
  assert.doesNotMatch(sanitized, /[\r\n]/);
  assert.match(sanitized, /\[redacted\]/);
});

test("uses only positive finite configured durations", () => {
  assert.equal(configuredDurationMs("2500", 1000), 2500);
  assert.equal(configuredDurationMs("0", 1000), 1000);
  assert.equal(configuredDurationMs("invalid", 1000), 1000);
});
