"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { processAnalysis } from "../lib/analysis-engine";
import type { Analysis, FactorStates, RawAnalysis } from "../lib/analysis-types";
import { analysisReportFilename, createAnalysisReportPdf } from "../lib/pdf-report";
import { researchFramework } from "../lib/research-framework";

const sampleScenarioInputs = [
  ["Category-defining AI device", 2, 360, "New hardware category creates a material replacement cycle."],
  ["Services acceleration", 3, 340, "Paid services and advertising compound above expectations."],
  ["India growth inflection", 5, 318, "Premium share and local manufacturing expand together."],
  ["Share gains in premium", 6, 302, "Ecosystem retention drives durable device share gains."],
  ["Strong execution", 8, 286, "Revenue and margins land near the high end of guidance."],
  ["AI monetization", 8, 274, "Private AI features improve upgrades and services ARPU."],
  ["Gross margin expansion", 8, 261, "Mix, silicon and supply-chain savings lift profitability."],
  ["Buyback-led compounding", 7, 252, "Stable demand plus repurchases grows per-share value."],
  ["Base case — upside", 8, 245, "Mid-single-digit growth and a steady valuation multiple."],
  ["Base case", 8, 234, "Mature devices, healthy services and disciplined capital return."],
  ["Base case — cautious", 8, 220, "Flat hardware is offset by services and buybacks."],
  ["Soft replacement cycle", 6, 205, "Consumers hold devices longer than forecast."],
  ["Regulatory drag", 5, 190, "App-store remedies reduce high-margin services economics."],
  ["China demand pressure", 5, 175, "Local competition and geopolitics weaken a key market."],
  ["Margin squeeze", 4, 160, "Input costs rise while pricing power softens."],
  ["Product-cycle stumble", 3, 145, "Major launches fail to stimulate replacement demand."],
  ["Global recession", 2, 132, "Discretionary demand contracts across regions."],
  ["Major antitrust remedy", 2, 118, "Distribution and platform economics are structurally reset."],
  ["Supply-chain shock", 1, 104, "Concentrated manufacturing is disrupted for several quarters."],
  ["Severe bear case", 1, 82, "Multiple shocks impair growth and compress the valuation."],
] as const;

function factorStatesForRank(index: number): FactorStates {
  const values = ["downturn", "steady", "expansion"] as const;
  const demand = ["contraction", "steady", "growth"] as const;
  const execution = ["miss", "meet", "beat"] as const;
  const valuation = ["compression", "steady", "expansion"] as const;
  const balanceSheet = ["deteriorating", "steady", "improving"] as const;
  let code = 242 - index;
  const digits = [0, 0, 0, 0, 0];
  for (let digit = 4; digit >= 0; digit -= 1) {
    digits[digit] = code % 3;
    code = Math.floor(code / 3);
  }
  return {
    macro: values[digits[0]],
    industryDemand: demand[digits[1]],
    companyExecution: execution[digits[2]],
    valuationRegime: valuation[digits[3]],
    balanceSheet: balanceSheet[digits[4]],
  };
}

function makeSample(): Analysis {
  const baselineRevenue = 390;
  const scenarios: RawAnalysis["scenarios"] = sampleScenarioInputs.map(
    ([name, weight, targetPrice, thesis], index) => {
      const revenueCagrPct = 8 - index * 0.65;
      const netIncomeMarginPct = 27 - index * 0.45;
      const dilutedShares = 14.7 + index * 0.035;
      const forecastRevenue = baselineRevenue * Math.pow(1 + revenueCagrPct / 100, 3);
      const netIncome = forecastRevenue * (netIncomeMarginPct / 100);
      return {
        name,
        thesis,
        relativeLikelihood: weight,
        probabilityRationale: "Illustrative relative weight; live runs must ground this in cited base rates and evidence.",
        valuationMethod: "Forward net-income multiple",
        factorStates: factorStatesForRank(index),
        valuationInputs: {
          revenueCagrPct,
          operatingMarginPct: netIncomeMarginPct + 5,
          freeCashFlowMarginPct: netIncomeMarginPct + 1.5,
          netIncomeMarginPct,
          balanceSheetValue: 60,
          netCash: 45 - index * 1.5,
          dilutedShares,
          reportingToTradingFxRate: 1,
          valuationBasis: "equity-value-multiple",
          valuationMetric: "net-income",
          valuationMultiple: (targetPrice * dilutedShares) / netIncome,
          cumulativeDividendsPerShare: 4.5,
        },
        keyDrivers: [
          `${revenueCagrPct.toFixed(1)}% revenue CAGR`,
          `${netIncomeMarginPct.toFixed(1)}% net margin`,
          `${dilutedShares.toFixed(2)}B diluted shares`,
        ],
        sourceIds: index < 12 ? ["s1", "s2", "s6"] : ["s1", "s5", "s6"],
      };
    },
  );

  const findings = [
    "Installed-base economics and recurring services diversify a mature hardware model.",
    "Retention is strong, while the timing of the next major replacement cycle is uncertain.",
    "Premium devices remain attractive, but geographic and category growth varies widely.",
    "Brand, ecosystem switching costs and custom silicon remain meaningful advantages.",
    "Cash conversion and margins are strong; hardware cyclicality still affects comparisons.",
    "Liquidity is ample relative to modeled obligations and downside funding needs.",
    "Execution is consistent, though succession and platform regulation deserve monitoring.",
    "Repurchases support per-share growth, with returns dependent on the price paid.",
    "The current price requires durable margins and continued per-share compounding.",
    "App-store remedies and geographic concentration create correlated downside risk.",
    "Currency, rates and consumer demand can materially change the three-year path.",
    "AI products, developer policy changes and replacement demand are key thesis tests.",
  ];
  const research: RawAnalysis["research"] = researchFramework.map((category, index) => ({
    categoryId: category.id,
    score: [1, 1, 1, 2, 2, 2, 1, 2, 0, -1, 0, 1][index],
    finding: findings[index],
    questions: category.questions.map((question, questionIndex) => ({
      questionIndex,
      status:
        (index === 1 && questionIndex === 1) || (index === 9 && questionIndex === 2)
          ? "partial" as const
          : "answered" as const,
      answer: `Illustrative answer: ${question}`,
      sourceIds: index < 9 ? ["s1", "s2", "s3"] : ["s4", "s5", "s6"],
    })),
    sourceIds: index < 9 ? ["s1", "s2", "s3"] : ["s4", "s5", "s6"],
  }));

  const raw: RawAnalysis = {
    ticker: "AAPL",
    company: "Apple Inc.",
    exchange: "Nasdaq Global Select Market",
    securityType: "common-stock",
    shareClass: "Common stock",
    instrumentId: "0000320193",
    instrumentIdType: "cik",
    tradingCurrency: "USD",
    reportingCurrency: "USD",
    currentPrice: 226.9,
    priceAsOf: "2026-08-23T16:00:00-04:00",
    fiscalDataAsOf: "2025-09-27",
    adrRatio: 1,
    currentReportingToTradingFxRate: 1,
    fxRateAsOf: "2026-08-23T16:00:00-04:00",
    marketDataSourceId: "s8",
    latestFilingSourceId: "s1",
    fxSourceId: "s8",
    summary: "Illustrative assumptions show how server-derived prices, returns, confidence and probability weights are presented. Run live research before relying on any company-specific conclusion.",
    baseline: {
      scale: "billions",
      asOf: "2025-09-27",
      revenue: baselineRevenue,
      operatingMarginPct: 31.5,
      freeCashFlowMarginPct: 27,
      netIncomeMarginPct: 25,
      netCash: 45,
      dilutedShares: 15.1,
      balanceSheetValue: 60,
      sourceIds: ["s1", "s2"],
    },
    scenarios,
    signals: [
      { label: "Earnings quality", value: "Strong", tone: "good", detail: "Illustrative margin and cash-conversion signal" },
      { label: "Consumer pulse", value: "Mixed", tone: "neutral", detail: "Upgrade intent remains the largest open question" },
      { label: "Competitive pressure", value: "Rising", tone: "neutral", detail: "Premium position is strong; the AI narrative is contested" },
      { label: "Risk concentration", value: "Medium", tone: "neutral", detail: "China and services regulation dominate downside" },
    ],
    research,
    sources: [
      { id: "s1", title: "Annual report", publisher: "SEC EDGAR", publishedAt: "2025-10-31", accessedAt: "2026-08-23T12:00:00Z", type: "filing", url: "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm" },
      { id: "s2", title: "Quarterly results", publisher: "Apple", publishedAt: "2025-10-30", accessedAt: "2026-08-23T12:00:00Z", type: "company", url: "https://www.apple.com/newsroom/2025/10/apple-reports-fourth-quarter-results/" },
      { id: "s3", title: "Investor relations materials", publisher: "Apple Investor Relations", publishedAt: "2025-10-30", accessedAt: "2026-08-23T12:00:00Z", type: "company", url: "https://investor.apple.com/investor-relations/default.aspx" },
      { id: "s4", title: "Consumer sentiment series", publisher: "Federal Reserve Bank of St. Louis", publishedAt: "2026-08-14", accessedAt: "2026-08-23T12:00:00Z", type: "government", url: "https://fred.stlouisfed.org/series/UMCSENT" },
      { id: "s5", title: "Digital Markets Act materials", publisher: "European Commission", publishedAt: "2026-06-01", accessedAt: "2026-08-23T12:00:00Z", type: "regulator", url: "https://competition-policy.ec.europa.eu/antitrust-and-cartels/digital-markets-act_en" },
      { id: "s6", title: "Global smartphone market share", publisher: "Counterpoint Research", publishedAt: "2026-07-30", accessedAt: "2026-08-23T12:00:00Z", type: "industry", url: "https://www.counterpointresearch.com/insights/global-smartphone-share/" },
      { id: "s7", title: "Competitor annual report", publisher: "SEC EDGAR", publishedAt: "2025-02-05", accessedAt: "2026-08-23T12:00:00Z", type: "competitor", url: "https://www.sec.gov/Archives/edgar/data/1652044/000165204425000012/goog-20241231.htm" },
      { id: "s8", title: "AAPL market reference", publisher: "Nasdaq", publishedAt: "2026-08-23", accessedAt: "2026-08-23T20:00:00Z", type: "market", url: "https://www.nasdaq.com/market-activity/stocks/aapl" },
    ],
  };
  return { ...processAnalysis(raw, "AAPL"), live: false, engine: "illustrative" };
}

const stages = [
  "Resolving security & live market data",
  "Reading filings and earnings history",
  "Answering 48 research questions",
  "Auditing gaps and source quality",
  "Building explicit valuation cases",
  "Normalizing evidence-shrunk likelihoods",
];

function formatMoney(value: number, currency: string, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits,
  }).format(value);
}

function formatTimestamp(value: string) {
  return new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export default function Home() {
  const [query, setQuery] = useState("AAPL");
  const [analysis, setAnalysis] = useState<Analysis>(() => makeSample());
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(0);
  const [filter, setFilter] = useState<"all" | "bull" | "base" | "bear">("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notice, setNotice] = useState("Illustrative dataset");
  const [error, setError] = useState<string | null>(null);
  const [openResearch, setOpenResearch] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const probabilityTotal = analysis.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0);
  const filtered = filter === "all" ? analysis.scenarios : analysis.scenarios.filter((scenario) => scenario.type === filter);
  const ranges = useMemo(() => {
    const result = { bull: 0, base: 0, bear: 0 };
    analysis.scenarios.forEach((scenario) => { result[scenario.type] += scenario.probability; });
    return result;
  }, [analysis]);
  const sourceMap = useMemo(
    () => new Map(analysis.sources.map((source) => [source.id, source])),
    [analysis],
  );

  function exportPdf() {
    try {
      const pdf = createAnalysisReportPdf(analysis);
      const blob = new Blob([pdf], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = analysisReportFilename(analysis);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setError("The PDF could not be generated. Please retry.");
    }
  }

  async function runAnalysis(event: FormEvent) {
    event.preventDefault();
    const ticker = query.trim().toUpperCase();
    if (!/^[A-Z.-]{1,8}$/.test(ticker)) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setStage(0);
    setExpanded(null);
    setError(null);
    const timer = window.setInterval(
      () => setStage((value) => Math.min(value + 1, stages.length - 1)),
      8_000,
    );
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
        signal: controller.signal,
      });
      const payload = await response.json() as Analysis | { error?: string };
      if (!response.ok || !("scenarios" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Research service unavailable");
      }
      setAnalysis(payload);
      setNotice("Live Codex web research");
    } catch (caught) {
      const message = controller.signal.aborted
        ? "Research cancelled. The previous analysis remains unchanged."
        : caught instanceof TypeError && caught.message === "Failed to fetch"
          ? "The research connection closed unexpectedly. Please retry; the previous analysis remains unchanged."
        : caught instanceof Error
          ? caught.message
          : "Research failed. The previous analysis remains unchanged.";
      setError(message);
    } finally {
      window.clearInterval(timer);
      controllerRef.current = null;
      setStage(stages.length - 1);
      window.setTimeout(() => setRunning(false), 250);
    }
  }

  return <main>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Possible home"><span className="brandMark">P</span><span>Possible</span></a>
      <nav aria-label="Primary"><a className="active" href="#analysis">Analysis</a><a href="#method">Method</a><a href="#sources">Sources</a></nav>
      <div className="status"><span className="statusDot" /> Research agent ready</div>
    </header>

    <section id="top" className="hero">
      <div className="eyebrow">THREE-YEAR SCENARIO ENGINE</div>
      <h1>Price the possible,<br /><em>not just the probable.</em></h1>
      <p className="lede">An evidence-led agent that turns filings, market signals and explicit operating assumptions into probability-weighted futures.</p>
      <form className="tickerForm" onSubmit={runAnalysis}>
        <label htmlFor="ticker">Stock ticker</label>
        <div className="inputRow">
          <div className="tickerInput"><span className="searchIcon">⌕</span><input id="ticker" value={query} onChange={(event) => setQuery(event.target.value.toUpperCase())} maxLength={8} autoComplete="off" aria-describedby="tickerHint" /></div>
          <button type="submit" disabled={running}>{running ? "Researching…" : "Run analysis"}<span aria-hidden="true">→</span></button>
        </div>
        <span id="tickerHint">Try AAPL, MSFT, NVDA or any listed company</span>
      </form>
      <div className="heroMeta"><span><b>48</b> answered questions</span><i /><span><b>20</b> outcome buckets</span><i /><span><b>3</b>-year horizon</span><i /><span><b>100.0%</b> server-normalized</span></div>
    </section>

    {error && <div className="errorBanner" role="alert"><strong>Analysis not replaced.</strong> {error}</div>}

    <section id="analysis" className="analysisSection">
      <div className="sectionIntro">
        <div>
          <span className="kicker">LATEST MODEL</span>
          <h2>{analysis.company}</h2>
          <p>{analysis.ticker} · {analysis.exchange} · {analysis.shareClass} · {analysis.tradingCurrency} · {notice}</p>
          <small>Price as of {formatTimestamp(analysis.priceAsOf)} · Fiscal data through {analysis.fiscalDataAsOf} · {analysis.instrumentIdType.toUpperCase()} {analysis.instrumentId}</small>
        </div>
        <div className="analysisActions">
          <button className="exportButton" type="button" onClick={exportPdf} aria-label={`Export ${analysis.ticker} analysis as PDF`}><span aria-hidden="true">↓</span> Export PDF</button>
          <div className="confidence"><span>EVIDENCE CONFIDENCE</span><strong>{analysis.confidence}<small>/100</small></strong><div className="confidenceBar"><i style={{ width: `${analysis.confidence}%` }} /></div></div>
        </div>
      </div>

      <div className="metricGrid">
        <article className="priceCard dark"><span>Price today</span><strong>{formatMoney(analysis.currentPrice, analysis.tradingCurrency)}</strong><small>Timestamped market reference</small></article>
        <article className="priceCard lime"><span>Expected terminal price</span><strong>{formatMoney(analysis.expectedPrice, analysis.tradingCurrency)}</strong><small>Server-derived probability-weighted mean</small></article>
        <article className="priceCard"><span>Expected 3-year total return</span><strong className={analysis.expectedTotalReturnPct >= 0 ? "positive" : "negative"}>{analysis.expectedTotalReturnPct >= 0 ? "+" : ""}{analysis.expectedTotalReturnPct.toFixed(1)}%</strong><small>{analysis.expectedAnnualizedReturnPct >= 0 ? "+" : ""}{analysis.expectedAnnualizedReturnPct.toFixed(1)}% probability-weighted annualized return</small></article>
        <article className="priceCard"><span>Probability check</span><strong>{probabilityTotal.toFixed(1)}%</strong><small className={Math.abs(probabilityTotal - 100) < 0.01 ? "checked" : "warning"}>{Math.abs(probabilityTotal - 100) < 0.01 ? "✓ Server normalized" : "Needs audit"}</small></article>
      </div>

      <div className="distributionCard">
        <div className="distributionHead"><div><span className="kicker">OUTCOME DISTRIBUTION</span><h3>Where the probability sits</h3></div><span className="formula">{analysis.probabilityMethod}</span></div>
        <div className="distributionBar"><i className="bear" style={{ width: `${ranges.bear}%` }} /><i className="base" style={{ width: `${ranges.base}%` }} /><i className="bull" style={{ width: `${ranges.bull}%` }} /></div>
        <div className="distributionLegend"><span><i className="dot bear" />Bear <b>{ranges.bear.toFixed(1)}%</b></span><span><i className="dot base" />Base <b>{ranges.base.toFixed(1)}%</b></span><span><i className="dot bull" />Bull <b>{ranges.bull.toFixed(1)}%</b></span></div>
        <p className="modelSummary">{analysis.summary}</p>
      </div>

      <div className="signalsGrid">{analysis.signals.map((signal) => <article className="signal" key={signal.label}><div><span>{signal.label}</span><i className={`signalDot ${signal.tone}`} /></div><strong>{signal.value}</strong><p>{signal.detail}</p></article>)}</div>

      <div className="researchHeader"><div><span className="kicker">EVIDENCE SCORECARD</span><h2>The questions behind the probability</h2><p>All 48 questions carry an answer status and claim-level source references.</p></div><span>{analysis.research.filter((item) => item.unansweredQuestions.length > 0).length} categories with open questions</span></div>
      <div className="researchGrid">{analysis.research.map((finding) => {
        const category = researchFramework.find(({ id }) => id === finding.categoryId);
        if (!category) return null;
        const isOpen = openResearch === finding.categoryId;
        return <article className={`researchCard ${isOpen ? "open" : ""}`} key={finding.categoryId}>
          <button type="button" onClick={() => setOpenResearch(isOpen ? null : finding.categoryId)} aria-expanded={isOpen}>
            <div><span>{category.label}</span><span className={`score score${finding.score}`}>{finding.score > 0 ? "+" : ""}{finding.score}</span></div>
            <p>{finding.finding}</p>
            <div className="evidenceStrength"><span>Server-rated evidence</span>{[1, 2, 3].map((level) => <i key={level} className={level <= finding.evidenceStrength ? "filled" : ""} />)}<small>{finding.evidenceStrength}/3</small></div>
            <b>{isOpen ? "Close" : "4 answers"} ↗</b>
          </button>
          {isOpen && <div className="researchDetail">
            <h4>Question-level evidence</h4>
            <ul>{finding.questions.map((answer) => <li key={answer.questionIndex} className={answer.status}><strong>{category.questions[answer.questionIndex]}</strong><span>{answer.answer}</span><small>{answer.status} · {answer.sourceIds.map((id) => `[${id}]`).join(" ") || "No evidence cited"}</small></li>)}</ul>
            <h4>Preferred evidence</h4><p>{category.preferredSources.join(" · ")}</p>
            {finding.unansweredQuestions.length > 0 && <><h4>Still open or partial</h4><ul className="unanswered">{finding.unansweredQuestions.map((question) => <li key={question}>{question}</li>)}</ul></>}
            <h4>Category evidence</h4><div className="citationLinks">{finding.sourceIds.map((id) => { const source = sourceMap.get(id); return source ? <a key={id} href={source.url} target="_blank" rel="noreferrer">[{id}] {source.publisher}</a> : null; })}</div>
          </div>}
        </article>;
      })}</div>

      <div className="scenarioHeader"><div><span className="kicker">SCENARIO BOOK</span><h2>20 ways the next three years unfold</h2><p>Each row represents a non-overlapping terminal-price bucket; its center price is calculated from explicit inputs.</p></div><div className="filters" aria-label="Filter scenarios">{(["all", "bull", "base", "bear"] as const).map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All 20" : item}</button>)}</div></div>
      <div className="scenarioTable" role="table" aria-label="Probability weighted scenarios">
        <div className="tableHead" role="row"><span>#</span><span>Scenario</span><span>Probability</span><span>3Y price</span><span>Total return</span><span /></div>
        {filtered.map((scenario) => {
          const index = analysis.scenarios.indexOf(scenario);
          const upperRange = scenario.priceRangeMax === null ? "∞" : formatMoney(scenario.priceRangeMax, analysis.tradingCurrency, 0);
          return <div className={`scenarioRow ${expanded === index ? "open" : ""}`} key={scenario.name} role="row" onClick={() => setExpanded(expanded === index ? null : index)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setExpanded(expanded === index ? null : index); }}>
            <span className="rank">{String(index + 1).padStart(2, "0")}</span>
            <span className="scenarioName"><i className={`dot ${scenario.type}`} />{scenario.name}<small>
              <span>{scenario.thesis}</span>
              <b>{scenario.valuationMethod}: {scenario.valuationMetricValue.toFixed(1)} {analysis.baseline.scale} × {scenario.valuationInputs.valuationMultiple.toFixed(1)} = {scenario.targetEquityValue.toFixed(1)} {analysis.baseline.scale} equity ÷ {scenario.targetDilutedShares.toFixed(2)} {analysis.baseline.scale} shares = {formatMoney(scenario.price, analysis.tradingCurrency)}</b>
              <em>Outcome bucket {formatMoney(scenario.priceRangeMin, analysis.tradingCurrency, 0)} to {upperRange} · {scenario.keyDrivers.join(" · ")}</em>
              <i>{scenario.probabilityRationale} Sources {scenario.sourceIds.map((id) => `[${id}]`).join(" ")}</i>
            </small></span>
            <span className="prob"><i><b style={{ width: `${Math.min(scenario.probability * 7, 100)}%` }} /></i>{scenario.probability.toFixed(1)}%</span>
            <strong>{formatMoney(scenario.price, analysis.tradingCurrency, 0)}</strong>
            <strong className={scenario.totalReturnPct >= 0 ? "positive" : "negative"}>{scenario.totalReturnPct >= 0 ? "+" : ""}{scenario.totalReturnPct.toFixed(0)}%</strong>
            <span className="chevron">⌄</span>
          </div>;
        })}
      </div>
    </section>

    <section id="method" className="methodSection"><div className="methodCopy"><span className="kicker">HOW THE AGENT THINKS</span><h2>Evidence first.<br />Arithmetic on the server.</h2><p>The model gathers evidence and proposes assumptions. Deterministic code rates source coverage, derives valuations and returns, shrinks likelihoods, and normalizes the distribution.</p><div className="guardrail">Not investment advice. Outputs are uncertain estimates and should be stress-tested against your own assumptions.</div></div><ol className="pipeline">{["Resolve security, share class, currencies & timestamps", "Read filings and at least 10 quarters", "Answer 48 questions with claim-level citations", "Derive evidence quality from coverage and source independence", "Build 20 unique factor-state combinations", "Calculate valuation from revenue, margins, balance sheet, FX & dilution", "Partition terminal prices into non-overlapping outcome buckets", "Shrink likelihoods and normalize to 100.0%"].map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p><i>{index < 3 ? "EVIDENCE" : index < 5 ? "AUDIT" : "SERVER"}</i></li>)}</ol></section>

    <section id="sources" className="sourcesSection"><div><span className="kicker">SOURCE LEDGER</span><h2>Traceable by design</h2><p>Primary status is derived from source type; exact dates and document URLs are required.</p></div><div className="sourceList">{analysis.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><span>↗</span><div><strong>[{source.id}] {source.title}</strong><small>{source.publisher} · published {source.publishedAt} · accessed {formatTimestamp(source.accessedAt)} · {source.type} · {source.primary ? "Primary" : "Secondary"}</small></div></a>)}</div></section>

    <footer><span className="brand"><span className="brandMark">P</span>Possible</span><p>Built for clearer thinking under uncertainty.</p><span>Research model · v0.2</span></footer>

    {running && <div className="researchOverlay" role="status" aria-live="polite"><div className="researchPanel"><span className="agentOrb" /><div><span className="kicker">RESEARCH AGENT</span><h3>{stages[stage]}</h3><p>{query} · Step {stage + 1} of {stages.length}</p></div><button className="cancelResearch" type="button" onClick={() => controllerRef.current?.abort()}>Cancel</button><div className="stageTrack">{stages.map((_, index) => <i key={index} className={index <= stage ? "done" : ""} />)}</div></div></div>}
  </main>;
}
