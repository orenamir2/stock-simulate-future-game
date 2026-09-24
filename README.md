# Possible — stock scenario agent

Possible researches a public company and converts the evidence into 20 coherent, probability-weighted three-year company-event paths, then aggregates identical terminal prices into non-overlapping buckets. Events carry dated states, prerequisites, incompatibilities, conditional likelihoods, evidence and explicit unknowns. The server rejects impossible or cyclic paths, deduplicates overlapping revenue exposures, values paths before aggregation, and preserves constituent probability, dividends and terminal wealth inside each bucket. The UI exposes the expected-value math, scenario distribution, research signals, methodology, explicit valuation inputs, and source ledger.

The market selector supports U.S./automatic resolution, Europe, South Korea, and Israel. International inputs may contain digits and exchange suffixes: use `SAP.DE` for a German listing, `005930` with South Korea selected, or `TEVA` with Israel selected. European symbols should include an exchange suffix when the bare symbol is ambiguous. Research is directed to local primary sources (including ESEF/national repositories, Korea's DART/KRX, and Israel's MAGNA/TASE), and minor-unit quotes such as pence or agorot are normalized to their ISO currency's major unit before valuation.

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

The research route invokes `codex exec` in non-interactive, ephemeral, read-only mode as a two-stage pipeline. The first call uses live web search and `config/stock-research.schema.json` to produce a compact evidence dossier; the second disables web search and converts only that dossier into the 20-scenario object required by `config/stock-analysis.schema.json`. Server code then independently validates and derives all calculated fields in `lib/analysis-engine.ts`. The local schema paths resolve from the project working directory unless `STOCK_RESEARCH_SCHEMA_PATH` or `STOCK_ANALYSIS_SCHEMA_PATH` overrides them. Child processes receive an allowlisted environment and do not use `OPENAI_API_KEY`. Usage is charged against the ChatGPT plan associated with the Codex login and remains subject to that plan's limits.

Research runs use live web search, low reasoning effort, an 8-minute research inactivity timeout, and a 25-minute end-to-end safety timeout by default. The research prompt also asks the agent to use a bounded set of focused searches and return once the minimum evidence standard is met. Generation uses minimal reasoning by default and relies on the hard request deadline because the schema-constrained Codex command emits no intermediate output while constructing its large JSON response. The five-minute margin keeps process cleanup, validation, persistence, and response delivery inside the 30-minute user-facing limit. Any Codex research output resets the research inactivity timer. Terminal Codex JSONL error events fail immediately, and cancellation or timeout kills the complete Unix process group so descendants cannot continue as orphans. Set `CODEX_REASONING_EFFORT`, `CODEX_GENERATION_REASONING_EFFORT`, `CODEX_IDLE_TIMEOUT_MS`, or `CODEX_TIMEOUT_MS` to tune those operational limits; Kubernetes declares the same defaults in `k8s/deployment.yaml`.

Pod stdout reports eight numbered stages for each request: admission, prompt/schema preparation, Codex planning, live evidence retrieval, structured generation, output parsing and source stamping, validation/calculation, and persistence/response delivery. Filter the single-line JSON stage stream with `kubectl logs -f deployment/possible | grep '\[analysis-stage\]'`. Each entry includes an explicit `status` (`in_progress`, `completed`, `retrying`, `failed`, or `cancelled`), request ID, ticker, stage, progress percentage, and research attempt. During Codex work, 30-second heartbeats also report event/search/reasoning counts, the latest search query and event type, output byte counts, and time since the agent last produced output. Parsing and validation entries include source, scenario, question-status, and coverage totals.

Path weights are derived from the most-specific applicable conditional event assumptions, evidence-shrunk toward equal priors, and normalized by the server. Metadata distinguishes those elicited inputs from the calibrated path probabilities. Expected terminal price is `Σ (scenario probability × scenario price) / 100`. Expected total return and expected annualized return are calculated per constituent path—including modeled dividends—and then probability-weighted. This avoids presenting the CAGR of the mean terminal price as though it were the mean scenario CAGR. Outputs are uncertain estimates, not investment advice.

## GHCR and local Kubernetes CI/CD

Every pull request runs the production build and tests. Every push to `main` then:

1. Builds the image for `linux/amd64` and `linux/arm64`, including the pinned Codex CLI.
2. Publishes immutable SHA and `latest` tags to `ghcr.io/orenamir2/stock-simulate-future-game` with SBOM and provenance.
3. Uses the self-hosted macOS ARM64 runner to create `possible/codex-auth-bootstrap` from the runner's local Codex login when the pod has not been authenticated yet.
4. Deploys the exact GHCR digest to local Kubernetes.
5. Verifies both Codex subscription authentication with a live minimal request and application health.

The GHCR image never contains `auth.json`. Kubernetes mounts the bootstrap credential as a read-only secret, and an init container seeds it only when the retained writable `CODEX_HOME` is empty. Codex then owns and refreshes the persistent pod credential without a later rollout replacing it with a stale bootstrap copy. The Codex-home volume is retained on `desktop-worker2`; authenticate that pod directly with `codex login --device-auth` so it does not share a rotating refresh token with the runner or desktop login.

The self-hosted runner must have `kubectl` and access to the `docker-desktop` context. For first bootstrap only, run `codex login` as the same operating-system user that runs the runner. If its authentication file is elsewhere, set the repository variable `LOCAL_CODEX_AUTH_FILE` to its absolute path. After the first rollout, run `kubectl -n possible exec -it deployment/possible -c possible -- codex login --device-auth` once to give the retained pod home an independent subscription session. `LOCAL_KUBE_CONTEXT` is optional and defaults to `docker-desktop`.

For private GHCR pulls, configure repository secret `GHCR_PAT` with `read:packages`. If omitted, the deployment job refreshes the pull secret using its GitHub token.

The app is exposed locally at `http://localhost:8080`.

Completed live analyses are written as individual JSON snapshots and shown in the History tab. The Kubernetes deployment mounts the `possible-analysis-history` PVC at `/var/lib/possible/analysis-history`. In this multi-node kind cluster, a `hostPath` is stored inside one virtual node's container filesystem; it is not automatically shared between kind nodes merely because they all run on the same Mac. The deployment is therefore pinned to `desktop-worker2`, which owns the retained history directory. Recreating that kind node also recreates its filesystem, so copy important snapshots out of the cluster before rebuilding it. Local `npm run dev` uses the project folder at `data/analysis-history` by default, or `ANALYSIS_HISTORY_DIR` when set.

Saved analyses can also be emailed as the same PDF produced by **Export PDF**. Delivery uses authenticated SMTP and defaults to `orenamir2@gmail.com`; set `ANALYSIS_EMAIL_TO` to override the recipient. For Gmail, use an app password rather than the account password. Configure local development with `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and optionally `SMTP_FROM`. Configure Kubernetes without committing credentials:

```bash
kubectl -n possible create secret generic possible-smtp \
  --from-literal=SMTP_HOST=smtp.gmail.com \
  --from-literal=SMTP_PORT=465 \
  --from-literal=SMTP_SECURE=true \
  --from-literal=SMTP_USER=your-sender@gmail.com \
  --from-literal=SMTP_PASSWORD='your-app-password' \
  --from-literal=SMTP_FROM=your-sender@gmail.com \
  --dry-run=client -o yaml | kubectl apply -f -
```

The SMTP secret is optional at deployment time so the rest of the app remains available before email is configured; the email endpoint returns a configuration error until the required values exist.

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
