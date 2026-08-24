# Possible — stock scenario agent

Possible researches a public company and converts the evidence into exactly 20 mutually exclusive, probability-weighted three-year stock-price scenarios. The UI exposes the expected-value math, scenario distribution, research signals, methodology, and source ledger.

## Run locally with ChatGPT Plus

Install and authenticate Codex CLI, then start the app:

```bash
npm install --global @openai/codex@0.144.4
codex login
npm install
npm run dev
```

The research route invokes `codex exec` in non-interactive, ephemeral, read-only mode and validates its response against `config/stock-analysis.schema.json`. It does not use `OPENAI_API_KEY`. Usage is charged against the ChatGPT plan associated with the Codex login and remains subject to that plan's limits.

Expected price is `Σ (scenario probability × scenario price) / 100`. Expected three-year return is `(expected price / current price) − 1`; the interface also shows the annualized equivalent. Outputs are uncertain estimates, not investment advice.

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

## Manual container test

Never copy `auth.json` into an image. Mount a disposable writable Codex home instead:

```bash
docker build -t possible:local .
docker run --rm -p 3000:3000 \
  -e CODEX_HOME=/var/lib/codex \
  -v "$HOME/.codex:/var/lib/codex" \
  possible:local
```

Keep this deployment private. The route validates tickers, permits one research run at a time, and runs Codex in a read-only sandbox, but a personal ChatGPT credential is still inappropriate for an internet-facing multi-user service.
