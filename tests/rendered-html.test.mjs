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
  assert.match(html, /Export PDF/);
  assert.match(html, /History/);
  assert.match(html, /South Korea/);
  assert.match(html, /Israel/);
  assert.match(html, /005930/);
  assert.match(html, /100/);
  assert.match(html, /Not investment advice/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps the probability and live-research guardrails", async () => {
  const [page, route, historyRoute, historyStore, engine, framework, schema, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/history/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/analysis-history.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/analysis-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/research-framework.ts", import.meta.url), "utf8"),
    readFile(new URL("../config/stock-analysis.schema.json", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.equal((page.match(/targetPrice/g) ?? []).length, 2);
  assert.match(page, /expectedTotalReturnPct/);
  assert.match(page, /terminalPriceStandardDeviation/);
  assert.match(page, /createAnalysisReportPdf/);
  assert.doesNotMatch(page, /setAnalysis\(makeSample\(ticker\)\)/);
  assert.match(route, /processAnalysis/);
  assert.match(route, /saveAnalysisHistory/);
  assert.match(historyRoute, /listAnalysisHistory/);
  assert.match(historyStore, /ANALYSIS_HISTORY_DIR/);
  assert.match(engine, /normalizeProbabilities/);
  assert.match(engine, /deriveScenario/);
  assert.match(engine, /addPriceBuckets/);
  assert.match(engine, /unexpected fields/);
  assert.match(route, /codex/);
  assert.match(route, /--output-schema/);
  assert.match(route, /--json/);
  assert.match(route, /Analysis step \$\{boundedStep\}\/\$\{ANALYSIS_STEP_COUNT\}/);
  assert.match(route, /retrieve-live-evidence/);
  assert.match(route, /generate-structured-analysis/);
  assert.match(route, /heartbeat: true/);
  assert.match(route, /\[analysis-stage\]/);
  assert.match(route, /latestWebSearchQuery/);
  assert.match(route, /AnalysisStageStatus/);
  assert.doesNotMatch(route, /Codex research still running/);
  assert.match(route, /--sandbox/);
  assert.match(route, /read-only/);
  assert.match(route, /web_search="live"/);
  assert.match(route, /model_reasoning_effort/);
  assert.match(route, /CodexTimeoutError/);
  assert.match(route, /status: 504/);
  assert.match(route, /MAX_RESEARCH_ATTEMPTS = 2/);
  assert.match(route, /retry-insufficient-research/);
  assert.match(route, /researchStatuses/);
  assert.match(route, /researchInProgress/);
  assert.match(route, /RESPONSE_KEEPALIVE_INTERVAL_MS/);
  assert.match(route, /X-Accel-Buffering/);
  assert.match(route, /request\.signal/);
  assert.match(page, /research connection closed unexpectedly/);
  assert.doesNotMatch(route, /env: process\.env/);
  assert.match(engine, /Research coverage audit failed/);
  assert.match(engine, /calculateConfidence/);
  assert.equal((framework.match(/id: "[a-z-]+"/g) ?? []).length, 12);
  assert.equal((framework.match(/questions: \[/g) ?? []).length, 12);
  assert.match(framework, /What expectations for growth, margins and reinvestment are embedded/);
  assert.match(schema, /"priceAsOf"/);
  assert.match(schema, /"tradingCurrency"/);
  assert.match(schema, /"valuationInputs"/);
  assert.match(schema, /"questionIndex"/);
  assert.doesNotMatch(schema, /"expectedPrice"/);
  assert.doesNotMatch(route, /OPENAI_API_KEY/);
  assert.match(layout, /Possible/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("ships container and Kubernetes delivery guardrails", async () => {
  const [dockerfile, workflow, deployment, historyStorage, kustomization, service, health] = await Promise.all([
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/ci-container-k8s.yml", import.meta.url), "utf8"),
    readFile(new URL("../k8s/deployment.yaml", import.meta.url), "utf8"),
    readFile(new URL("../k8s/history-storage.yaml", import.meta.url), "utf8"),
    readFile(new URL("../k8s/kustomization.yaml", import.meta.url), "utf8"),
    readFile(new URL("../k8s/service.yaml", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dockerfile, /USER 1000:1000/);
  assert.match(dockerfile, /@openai\/codex/);
  assert.match(dockerfile, /ca-certificates/);
  assert.match(dockerfile, /ANALYSIS_HISTORY_DIR/);
  assert.match(workflow, /ghcr\.io/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /codex-auth-bootstrap/);
  assert.match(workflow, /--field-selector=status\.phase=Running/);
  assert.match(workflow, /wait --for=condition=Ready/);
  assert.match(workflow, /runs-on: \[self-hosted, macOS, ARM64\]/);
  assert.match(workflow, /group: possible-production-\$\{\{ github\.ref \}\}/);
  assert.match(workflow, /set image deployment\/possible/);
  assert.match(workflow, /rollout status deployment\/possible/);
  assert.match(deployment, /readOnlyRootFilesystem: true/);
  assert.match(deployment, /runAsUser: 1000/);
  assert.match(deployment, /ghcr-pull/);
  assert.match(deployment, /codex-auth-source/);
  assert.match(deployment, /path: \/api\/health/);
  assert.match(deployment, /claimName: possible-analysis-history/);
  assert.match(deployment, /kubernetes\.io\/hostname: desktop-worker2/);
  assert.match(deployment, /name: prepare-analysis-history/);
  assert.match(deployment, /chown 1000:1000 \/var\/lib\/possible\/analysis-history/);
  assert.match(deployment, /add:\s+- CHOWN/);
  assert.match(historyStorage, /kind: PersistentVolume/);
  assert.match(historyStorage, /kind: PersistentVolumeClaim/);
  assert.match(historyStorage, /persistentVolumeReclaimPolicy: Retain/);
  assert.match(historyStorage, /data\/analysis-history/);
  assert.match(kustomization, /history-storage\.yaml/);
  assert.match(service, /type: LoadBalancer/);
  assert.match(service, /port: 8080/);
  assert.match(health, /status: "ok"/);
});
