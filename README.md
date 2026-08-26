# Possible — stock scenario agent

Possible researches a public company and converts the evidence into exactly 20 probability-weighted three-year terminal-price buckets. Each bucket is non-overlapping and the full bucket range covers every non-negative terminal price. The UI exposes the expected-value math, scenario distribution, research signals, methodology, explicit valuation inputs, and source ledger.

Each run answers a fixed 48-question research framework covering the business model, products and customers, market structure, competition and moat, financial quality, balance sheet, management and governance, capital allocation, valuation, risks and regulation, macro/geopolitics, and catalysts/expectations. Every answer records answered/partial/unanswered status and claim-level source IDs. Evidence strength and confidence are derived by server code from coverage, primary evidence and source-domain independence; the research model cannot return either score.

The research model returns operating and valuation assumptions, not calculated outputs. Server code derives forecast revenue, the selected valuation metric, enterprise/equity value, FX conversion, per-share price, total return and annualized return. It also converts positive relative-likelihood weights into evidence-shrunk percentages and normalizes them to exactly 100.0%. This is a conservative structural improvement, not a claim of empirical calibration; production-quality probabilities still require stored forecast vintages and walk-forward backtesting.

## Run locally with ChatGPT Plus

Install and authenticate Codex CLI, then start the app:

```bash
npm install --global @openai/codex@0.144.4
codex login
npm install
npm run dev
```

The research route invokes `codex exec` in non-interactive, ephemeral, read-only mode and validates its response against `config/stock-analysis.schema.json`, then independently validates and derives all calculated fields in `lib/analysis-engine.ts`. The local schema path resolves from the project working directory unless `STOCK_ANALYSIS_SCHEMA_PATH` overrides it. The child process receives an allowlisted environment and does not use `OPENAI_API_KEY`. Usage is charged against the ChatGPT plan associated with the Codex login and remains subject to that plan's limits.

Research runs use live web search, low reasoning effort, and a 60-minute safety timeout by default. Set `CODEX_REASONING_EFFORT` or `CODEX_TIMEOUT_MS` to tune those operational limits; Kubernetes declares the same defaults in `k8s/deployment.yaml`.

Pod logs report eight numbered phases for each request: admission, prompt/schema preparation, Codex planning, live evidence retrieval, structured generation, output parsing and source stamping, validation/calculation, and persistence/response delivery. Codex JSONL events drive the research phases, so web-search counts and the latest event appear in the periodic progress heartbeat instead of a generic running message. Every entry includes the request ID and ticker for filtering.

Expected terminal price is `Σ (scenario probability × scenario price) / 100`. Expected total return and expected annualized return are calculated per scenario—including modeled dividends—and then probability-weighted. This avoids presenting the CAGR of the mean terminal price as though it were the mean scenario CAGR. Outputs are uncertain estimates, not investment advice.

## GHCR and local Kubernetes CI/CD

Every pull request runs the production build and tests. Every push to `main` then:

1. Builds the image for `linux/amd64` and `linux/arm64`, including the pinned Codex CLI.
2. Publishes immutable SHA and `latest` tags to `ghcr.io/orenamir2/stock-simulate-future-game` with SBOM and provenance.
3. Uses the self-hosted macOS ARM64 runner to create `possible/codex-auth-bootstrap` from the runner's local Codex login.
4. Deploys the exact GHCR digest to local Kubernetes.
5. Verifies both Codex subscription authentication and application health.

The GHCR image never contains `auth.json`. Kubernetes mounts the credential as a read-only secret, and an init container copies it into a writable in-memory `CODEX_HOME` so Codex can refresh its tokens. The credential disappears when the pod is deleted.

The self-hosted runner must have `kubectl` and access to the `docker-desktop` context. Run `codex login` as the same operating-system user that runs the runner. If its authentication file is elsewhere, set the repository variable `LOCAL_CODEX_AUTH_FILE` to its absolute path. `LOCAL_KUBE_CONTEXT` is optional and defaults to `docker-desktop`.

For private GHCR pulls, configure repository secret `GHCR_PAT` with `read:packages`. If omitted, the deployment job refreshes the pull secret using its GitHub token.

The app is exposed locally at `http://localhost:8080`.

Completed live analyses are written as individual JSON snapshots and shown in the History tab. The Kubernetes deployment mounts the `possible-analysis-history` PVC at `/var/lib/possible/analysis-history`; its retained host-path PV stores the files on the Mac under `data/analysis-history`. If the repository is moved, update `spec.hostPath.path` in `k8s/history-storage.yaml` before applying the manifests. Local `npm run dev` uses that same project folder by default, or `ANALYSIS_HISTORY_DIR` when set.

## Manual container test

Never copy `auth.json` into an image. Mount a disposable writable Codex home instead:

```bash
docker build -t possible:local .
mkdir -p data/analysis-history
docker run --rm -p 3000:3000 \
  -e CODEX_HOME=/var/lib/codex \
  -v "$HOME/.codex:/var/lib/codex" \
  -v "$PWD/data/analysis-history:/var/lib/possible/analysis-history" \
  possible:local
```

Keep this deployment private. The route validates tickers, permits one research run at a time, and runs Codex in a read-only sandbox, but a personal ChatGPT credential is still inappropriate for an internet-facing multi-user service.
