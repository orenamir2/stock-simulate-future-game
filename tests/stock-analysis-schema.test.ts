import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("constant output-schema fields declare their JSON types", async () => {
  const schemaUrls = [
    new URL("../config/stock-analysis.schema.json", import.meta.url),
    new URL("../config/stock-scenario-generation.schema.json", import.meta.url),
  ];
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

  for (const schemaUrl of schemaUrls) {
    visit(JSON.parse(await readFile(schemaUrl, "utf8")) as unknown, schemaUrl.pathname);
  }
  assert.deepEqual(missingTypes, []);
});

test("research schema captures evidence without scenario generation", async () => {
  const schemaUrl = new URL("../config/stock-research.schema.json", import.meta.url);
  const schema = JSON.parse(await readFile(schemaUrl, "utf8")) as {
    required: string[];
    properties: Record<string, unknown>;
  };
  assert.ok(schema.required.includes("eventCandidates"));
  assert.ok(schema.required.includes("research"));
  assert.ok(schema.required.includes("sources"));
  assert.equal(Object.hasOwn(schema.properties, "scenarios"), false);
});

test("scenario generation schema contains only fields the second stage creates", async () => {
  const scenarioSchemaUrl = new URL("../config/stock-scenario-generation.schema.json", import.meta.url);
  const fullSchemaUrl = new URL("../config/stock-analysis.schema.json", import.meta.url);
  const schema = JSON.parse(await readFile(scenarioSchemaUrl, "utf8")) as {
    required: string[];
    properties: Record<string, unknown>;
  };
  const fullSchema = JSON.parse(await readFile(fullSchemaUrl, "utf8")) as {
    properties: Record<string, unknown>;
  };
  assert.deepEqual(schema.required, ["eventModelMetadata", "companyEvents", "scenarios", "signals"]);
  assert.deepEqual(Object.keys(schema.properties), schema.required);
  for (const field of schema.required) {
    assert.deepEqual(schema.properties[field], fullSchema.properties[field]);
  }
});
