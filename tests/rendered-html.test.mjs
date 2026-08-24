import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the scenario product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Possible — Probability-weighted stock scenarios<\/title>/i);
  assert.match(html, /Price the possible/);
  assert.match(html, /20 ways the next three years unfold/);
  assert.match(html, /Probability check/);
  assert.match(html, /100/);
  assert.match(html, /Not investment advice/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps the probability and live-research guardrails", async () => {
  const [page, route, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.equal((page.match(/probability: \d+/g) ?? []).length, 20);
  assert.match(page, /sum \+ item\.probability \* item\.price/);
  assert.match(route, /total !== 100/);
  assert.match(route, /Math\.abs\(expected - data\.expectedPrice\)/);
  assert.match(route, /tools: \[\{ type: "web_search" \}\]/);
  assert.match(route, /OPENAI_API_KEY/);
  assert.match(layout, /Possible/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("ships container and Kubernetes delivery guardrails", async () => {
  const [dockerfile, workflow, deployment, health] = await Promise.all([
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/ci-container-k8s.yml", import.meta.url), "utf8"),
    readFile(new URL("../k8s/deployment.yaml", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dockerfile, /USER node/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /runs-on: \[self-hosted, macOS, ARM64\]/);
  assert.match(workflow, /set image deployment\/possible/);
  assert.match(workflow, /rollout status deployment\/possible/);
  assert.match(deployment, /readOnlyRootFilesystem: true/);
  assert.match(deployment, /path: \/api\/health/);
  assert.match(health, /status: "ok"/);
});
