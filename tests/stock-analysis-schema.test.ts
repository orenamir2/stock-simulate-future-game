import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("constant output-schema fields declare their JSON types", async () => {
  const schemaUrl = new URL("../config/stock-analysis.schema.json", import.meta.url);
  const schema = JSON.parse(await readFile(schemaUrl, "utf8")) as unknown;
  const missingTypes: string[] = [];

  function visit(value: unknown, path: string): void {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    if (Object.hasOwn(record, "const") && typeof record.type !== "string") {
      missingTypes.push(path);
    }
    for (const [key, child] of Object.entries(record)) {
      visit(child, path ? `${path}.${key}` : key);
    }
  }

  visit(schema, "");
  assert.deepEqual(missingTypes, []);
});
