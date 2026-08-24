# Possible — stock scenario agent

Possible researches a public company and converts the evidence into exactly 20 mutually exclusive, probability-weighted three-year stock-price scenarios. The UI exposes the expected-value math, scenario distribution, research signals, methodology, and source ledger.

## Run locally

```bash
npm install
npm run dev
```

The app opens with an illustrative AAPL dataset. For live research, add `OPENAI_API_KEY` to `.env.local`. You can optionally set `OPENAI_MODEL`; it defaults to `gpt-5.5`.

The research route uses the OpenAI Responses API with web search and strict structured output. It prioritizes SEC and investor-relations sources, audits that all 20 probabilities total 100%, and independently recalculates the expected price before returning the result.

Expected price is `Σ (scenario probability × scenario price) / 100`. Expected three-year return is `(expected price / current price) − 1`; the interface also shows the annualized equivalent. Outputs are uncertain estimates, not investment advice.

## Container and local Kubernetes CI/CD

Every pull request runs the production build and tests. Every push to `main` then:

1. Builds the image for both `linux/amd64` and `linux/arm64`.
2. Publishes immutable SHA and `latest` tags to `ghcr.io/orenamir2/stock-simulate-future-game`.
3. Produces SBOM and provenance attestations.
4. Deploys the exact published digest to the `possible` namespace on local Kubernetes.
5. Waits for the `/api/health` readiness check and rollout to succeed.

The deployment job needs a self-hosted GitHub Actions runner because a GitHub-hosted runner cannot reach Kubernetes on your laptop. In the repository, open **Settings → Actions → Runners → New self-hosted runner** and register the macOS ARM64 machine that can run `kubectl`. The workflow targets GitHub's standard `self-hosted`, `macOS`, and `ARM64` labels. The runner must have `kubectl` installed and access to the intended kubeconfig.

Configure these GitHub repository settings:

- Environment: `local-k8s` (optional approval protection can be enabled).
- Variable: `LOCAL_KUBE_CONTEXT`, normally `docker-desktop`.
- Secret: `OPENAI_API_KEY` to enable live research; omit it for illustrative mode.
- Secret: `GHCR_PAT` with `read:packages` is recommended for durable image pulls. If omitted, the workflow uses its short-lived `GITHUB_TOKEN` and refreshes the pull secret on every deployment.

The app is exposed through a NodePort service at `http://localhost:30080` on Docker Desktop Kubernetes. Change `k8s/service.yaml` if that port is already in use.

To run the container without Kubernetes:

```bash
docker build -t possible:local .
docker run --rm -p 3000:3000 -e OPENAI_API_KEY possible:local
```
