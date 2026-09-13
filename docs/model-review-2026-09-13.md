# Company and product model review — 2026-09-13

Reviewed remote commit `d077f6d`; `git pull --ff-only` reported already up to date. Scope: research prompt/framework, structured schema, analysis types, valuation/probability/evidence engine, history, scenario UI, report output and tests. No existing GitHub issues were returned before this review.

The largest gap is causal specificity: a macro/execution label and aggregate CAGR do not explain what happened to a named product, which revenue is exposed, when the effect occurs or how it changes financing needs. The local implementation adds a cited product/segment revenue bridge and keeps different numeric product outcomes under the same broad factors. It does not claim calibrated probabilities or implement the entire roadmap below.

## Evidence informing the design

- Hall and Khan, *Adoption of New Technology* (2003): adoption depends on uncertain benefits and costs. Modeling implication: product availability alone should not imply immediate customer uptake. https://www.nber.org/papers/w9730
- NVIDIA FY2026 10-K: product transitions, customer dependence and supply/export exposures justify product-specific constraints rather than generic execution shocks. https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm
- Snowflake FY2025 10-K: consumption-based revenue and reported retention motivate separate existing-customer and new-workload drivers. This historical example is not a current operating forecast. https://www.sec.gov/Archives/edgar/data/1640147/000164014725000052/snow-20250131.htm
- FDA review process: regulatory review is a separate gate before commercialization. This is not a clinical-success probability dataset. https://www.fda.gov/patients/drug-development-process/step-4-fda-drug-review
- FDA generic competition research: entry and competitive intensity matter for price erosion; avoid a fixed universal patent-cliff haircut. https://www.fda.gov/about-fda/center-drug-evaluation-and-research-cder/generic-competition-and-drug-prices
- Gneiting and Raftery (2007): proper scoring rules provide a foundation for forecast evaluation. This supports testing probabilities against outcomes, not deriving calibration from citation counts. https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf

## Implemented locally

New structured generations require a revenue bridge in every scenario. Year-three annual revenue is `sum(baselineRevenue * volumeRatio * priceRatio + newAnnualRevenue)`. Ratios are terminal-to-baseline ratios, not annual rates. New revenue is outside the baseline cohort and must not also enter volume growth. Incumbent contraction accounts for lost customers or cannibalization. Monetary values use company baseline scale and reporting currency. Baseline rows reconcile within 0.1%; duplicate names, negative/nonfinite inputs and unsupported source references are rejected through existing scenario recovery.

Each row names a product or reported segment, event/continuation assumption, timing, observable indicator and evidence. Prompt instructions require disclosure of estimates and undisclosed splits. The scenario UI shows assumptions and calculation. Older snapshots without the bridge remain readable using legacy CAGR. With bridges, legacy CAGR is ignored. Product outcomes with different numeric bridges survive identical broad factors; price-level aggregation still needs the event-path work below.

## Remaining work

1. P1: Model company-specific event dependencies before aggregating price outcomes
2. P1: Add annual product economics, launch timing and cash-runway constraints
3. P1: Calibrate probabilities using forecast vintages and realized outcomes
4. P2: Add software cohort drivers for renewals, consumption and product cannibalization
5. P2: Model semiconductor design wins, capacity bottlenecks and export exposure
6. P2: Add drug-asset milestones, commercialization and exclusivity-loss paths
7. P1: Audit product assumptions against retrieved evidence and consistent baseline partitions

These proposals are modeling inferences from the cited evidence, not fitted coefficients. Timing, costs and funding remain terminal assumptions; product citations are not independently verified claim entailment; scenario weights are uncalibrated. The PDF does not yet expose bridge detail. No live research run or deployment was performed as part of this review.

## Created GitHub issues

- [P1: Model company-specific event dependencies before aggregating price outcomes](https://github.com/orenamir2/stock-simulate-future-game/issues/27)
- [P1: Add annual product economics, launch timing and cash-runway constraints](https://github.com/orenamir2/stock-simulate-future-game/issues/28)
- [P1: Calibrate probabilities using forecast vintages and realized outcomes](https://github.com/orenamir2/stock-simulate-future-game/issues/29)
- [P2: Add software cohort drivers for renewals, consumption and product cannibalization](https://github.com/orenamir2/stock-simulate-future-game/issues/30)
- [P2: Model semiconductor design wins, capacity bottlenecks and export exposure](https://github.com/orenamir2/stock-simulate-future-game/issues/31)
- [P2: Add drug-asset milestones, commercialization and exclusivity-loss paths](https://github.com/orenamir2/stock-simulate-future-game/issues/32)
- [P1: Audit product assumptions against retrieved evidence and consistent baseline partitions](https://github.com/orenamir2/stock-simulate-future-game/issues/33)

## Validation

Production build and all 33 tests passed, including five new product-bridge tests. Changed TypeScript files passed ESLint. Validation was completed before PR submission; no deployment was performed during the review. The pre-existing untracked `devops-game-for-pros/` directory was left untouched.

A separate TypeScript check reports seven existing errors: nullable event records/error narrowing in `app/api/analyze/route.ts`, missing `cloudflare:workers` declarations in `db/index.ts`, and missing `Fetcher`/`D1Database` globals in `worker/index.ts`. Repeating the check against a clean archive of remote commit `d077f6d` reproduced the same seven errors. No new type errors were observed. The check excludes the unrelated untracked nested project.
