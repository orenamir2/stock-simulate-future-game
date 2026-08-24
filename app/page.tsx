"use client";

import { FormEvent, useMemo, useState } from "react";
import { researchFramework } from "../lib/research-framework";

type Scenario = { name: string; probability: number; price: number; thesis: string; type: "bull" | "base" | "bear"; targetEquityValue: number; targetDilutedShares: number; valuationMethod: string; keyDrivers: string[]; sourceIds: string[] };
type ResearchFinding = { categoryId: string; score: number; evidenceStrength: number; finding: string; unansweredQuestions: string[]; sourceIds: string[] };
type Source = { id: string; title: string; publisher: string; publishedAt: string; url: string; type: string; primary: boolean };
type Analysis = {
  ticker: string; company: string; currentPrice: number; expectedPrice: number; confidence: number; summary: string; scenarios: Scenario[];
  signals: { label: string; value: string; tone: "good" | "neutral" | "bad"; detail: string }[];
  research: ResearchFinding[]; sources: Source[]; live?: boolean;
};

const sampleScenarioInputs: Omit<Scenario, "targetEquityValue" | "targetDilutedShares" | "valuationMethod" | "keyDrivers" | "sourceIds">[] = [
  { name: "Category-defining AI device", probability: 2, price: 360, thesis: "New hardware category creates a material replacement cycle.", type: "bull" },
  { name: "Services acceleration", probability: 3, price: 340, thesis: "Paid services and advertising compound above expectations.", type: "bull" },
  { name: "India growth inflection", probability: 5, price: 318, thesis: "Premium share and local manufacturing expand together.", type: "bull" },
  { name: "Share gains in premium", probability: 6, price: 302, thesis: "Ecosystem retention drives durable device share gains.", type: "bull" },
  { name: "Strong execution", probability: 8, price: 286, thesis: "Revenue and margins land near the high end of guidance.", type: "bull" },
  { name: "AI monetization", probability: 8, price: 274, thesis: "Private AI features improve upgrades and services ARPU.", type: "bull" },
  { name: "Gross margin expansion", probability: 8, price: 261, thesis: "Mix, silicon and supply-chain savings lift profitability.", type: "bull" },
  { name: "Buyback-led compounding", probability: 7, price: 252, thesis: "Stable demand plus repurchases grows per-share value.", type: "bull" },
  { name: "Base case — upside", probability: 8, price: 245, thesis: "Mid-single-digit growth and steady valuation multiple.", type: "base" },
  { name: "Base case", probability: 8, price: 234, thesis: "Mature devices, healthy services, disciplined capital return.", type: "base" },
  { name: "Base case — cautious", probability: 8, price: 220, thesis: "Flat hardware offset by services and buybacks.", type: "base" },
  { name: "Soft replacement cycle", probability: 6, price: 205, thesis: "Consumers hold devices longer than forecast.", type: "base" },
  { name: "Regulatory drag", probability: 5, price: 190, thesis: "App-store remedies reduce high-margin services economics.", type: "bear" },
  { name: "China demand pressure", probability: 5, price: 175, thesis: "Local competition and geopolitics weaken a key market.", type: "bear" },
  { name: "Margin squeeze", probability: 4, price: 160, thesis: "Input costs rise while pricing power softens.", type: "bear" },
  { name: "Product-cycle stumble", probability: 3, price: 145, thesis: "Major launches fail to stimulate replacement demand.", type: "bear" },
  { name: "Global recession", probability: 2, price: 132, thesis: "Discretionary demand contracts across regions.", type: "bear" },
  { name: "Major antitrust remedy", probability: 2, price: 118, thesis: "Distribution and platform economics are structurally reset.", type: "bear" },
  { name: "Supply-chain shock", probability: 1, price: 104, thesis: "Concentrated manufacturing is disrupted for several quarters.", type: "bear" },
  { name: "Severe bear case", probability: 1, price: 82, thesis: "Multiple shocks impair growth and compress the valuation.", type: "bear" },
];

const sampleScenarios: Scenario[] = sampleScenarioInputs.map((scenario) => ({
  ...scenario,
  targetDilutedShares: 15.1,
  targetEquityValue: Number((scenario.price * 15.1).toFixed(1)),
  valuationMethod: scenario.type === "base" ? "Forward earnings + net cash" : "Scenario earnings multiple + net cash",
  keyDrivers: scenario.type === "bull" ? ["Revenue growth above base", "Stable-to-higher margins", "Continued buybacks"] : scenario.type === "bear" ? ["Revenue below base", "Margin compression", "Valuation de-rating"] : ["Mid-single-digit growth", "Stable margins", "Continued buybacks"],
  sourceIds: ["s1", "s2", "s3"],
}));

const sampleResearch: ResearchFinding[] = researchFramework.map((category, index) => ({
  categoryId: category.id,
  score: [1, 1, 1, 2, 2, 2, 1, 2, 0, -1, 0, 1][index],
  evidenceStrength: index < 9 ? 2 : 1,
  finding: [
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
  ][index],
  unansweredQuestions: index === 1 ? ["What is current device-level upgrade intent by region?"] : index === 9 ? ["What will final app-store remedies cost?"] : [],
  sourceIds: index < 9 ? ["s1", "s2", "s3"] : ["s4", "s5"],
}));

const makeSample = (ticker = "AAPL"): Analysis => {
  const currentPrice = 226.9;
  return {
    ticker, company: ticker === "AAPL" ? "Apple Inc." : `${ticker} — illustrative model`, currentPrice,
    expectedPrice: sampleScenarios.reduce((sum, item) => sum + item.probability * item.price, 0) / 100, confidence: 64,
    summary: "Services durability and capital returns support the center of the distribution. The widest uncertainty sits around AI-led replacement demand, China exposure, and regulatory pressure on platform economics.",
    scenarios: sampleScenarios,
    signals: [
      { label: "Earnings quality", value: "Strong", tone: "good", detail: "8 of 10 reports showed resilient gross margin" },
      { label: "Consumer pulse", value: "+12", tone: "good", detail: "Positive, but upgrade intent remains mixed" },
      { label: "Competitive pressure", value: "Rising", tone: "neutral", detail: "Premium position strong; AI narrative is contested" },
      { label: "Risk concentration", value: "Medium", tone: "neutral", detail: "China and services regulation dominate downside" },
    ],
    research: sampleResearch,
    sources: [
      { id: "s1", title: "Form 10-K and quarterly filings", publisher: "SEC EDGAR", publishedAt: "Latest filings", type: "filing", primary: true, url: "https://www.sec.gov/edgar/search/" },
      { id: "s2", title: "Investor relations earnings materials", publisher: "Apple", publishedAt: "Latest quarter", type: "company", primary: true, url: "https://investor.apple.com/" },
      { id: "s3", title: "Proxy and governance filings", publisher: "SEC EDGAR", publishedAt: "Latest proxy", type: "filing", primary: true, url: "https://www.sec.gov/edgar/search/" },
      { id: "s4", title: "Consumer confidence and spending", publisher: "FRED", publishedAt: "Current series", type: "government", primary: true, url: "https://fred.stlouisfed.org/" },
      { id: "s5", title: "Competition policy cases", publisher: "European Commission", publishedAt: "Current cases", type: "regulator", primary: true, url: "https://competition-policy.ec.europa.eu/" },
      { id: "s6", title: "Smartphone market context", publisher: "Industry research", publishedAt: "Recent", type: "industry", primary: false, url: "https://www.counterpointresearch.com/" },
      { id: "s7", title: "Competitor public filings", publisher: "SEC EDGAR", publishedAt: "Latest filings", type: "competitor", primary: true, url: "https://www.sec.gov/edgar/search/" },
      { id: "s8", title: "Market price reference", publisher: "Nasdaq", publishedAt: "Illustrative", type: "market", primary: false, url: "https://www.nasdaq.com/market-activity/stocks/aapl" },
    ],
  };
};

const stages = ["Resolving security & live market data", "Reading filings and earnings history", "Triangulating 12 research categories", "Auditing gaps and source quality", "Building explicit valuation cases", "Calibrating and normalizing 20 scenarios"];

export default function Home() {
  const [query, setQuery] = useState("AAPL");
  const [analysis, setAnalysis] = useState<Analysis>(() => makeSample());
  const [running, setRunning] = useState(false); const [stage, setStage] = useState(0);
  const [filter, setFilter] = useState<"all" | "bull" | "base" | "bear">("all");
  const [expanded, setExpanded] = useState<number | null>(null); const [notice, setNotice] = useState("Illustrative dataset");
  const [openResearch, setOpenResearch] = useState<string | null>(null);
  const expectedReturn = ((analysis.expectedPrice / analysis.currentPrice) - 1) * 100;
  const cagr = (Math.pow(analysis.expectedPrice / analysis.currentPrice, 1 / 3) - 1) * 100;
  const probabilityTotal = analysis.scenarios.reduce((sum, s) => sum + s.probability, 0);
  const filtered = filter === "all" ? analysis.scenarios : analysis.scenarios.filter((s) => s.type === filter);
  const ranges = useMemo(() => { const result = { bull: 0, base: 0, bear: 0 }; analysis.scenarios.forEach((s) => result[s.type] += s.probability); return result; }, [analysis]);
  const sourceMap = useMemo(() => new Map(analysis.sources.map((source) => [source.id, source])), [analysis]);

  async function runAnalysis(event: FormEvent) {
    event.preventDefault(); const ticker = query.trim().toUpperCase(); if (!/^[A-Z.-]{1,8}$/.test(ticker)) return;
    setRunning(true); setStage(0); setExpanded(null);
    const timer = window.setInterval(() => setStage((value) => Math.min(value + 1, stages.length - 1)), 1000);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker }) });
      if (!response.ok) throw new Error("Research service unavailable"); const next = await response.json() as Analysis;
      setAnalysis(next); setNotice(next.live ? "Live Codex web research" : "Illustrative dataset");
    } catch { setAnalysis(makeSample(ticker)); setNotice("Illustrative dataset — Codex research is unavailable"); }
    finally { window.clearInterval(timer); setStage(stages.length - 1); window.setTimeout(() => setRunning(false), 450); }
  }

  return <main>
    <header className="topbar"><a className="brand" href="#top" aria-label="Possible home"><span className="brandMark">P</span><span>Possible</span></a><nav aria-label="Primary"><a className="active" href="#analysis">Analysis</a><a href="#method">Method</a><a href="#sources">Sources</a></nav><div className="status"><span className="statusDot" /> Research agent ready</div></header>
    <section id="top" className="hero"><div className="eyebrow">THREE-YEAR SCENARIO ENGINE</div><h1>Price the possible,<br /><em>not just the probable.</em></h1><p className="lede">An evidence-led agent that turns filings, market signals and real-world risks into 20 probability-weighted futures.</p>
      <form className="tickerForm" onSubmit={runAnalysis}><label htmlFor="ticker">Stock ticker</label><div className="inputRow"><div className="tickerInput"><span className="searchIcon">⌕</span><input id="ticker" value={query} onChange={(e) => setQuery(e.target.value.toUpperCase())} maxLength={8} autoComplete="off" aria-describedby="tickerHint" /></div><button type="submit" disabled={running}>{running ? "Researching…" : "Run analysis"}<span aria-hidden="true">→</span></button></div><span id="tickerHint">Try AAPL, MSFT, NVDA or any listed company</span></form>
      <div className="heroMeta"><span><b>10</b> earnings reports</span><i /><span><b>20</b> scenarios</span><i /><span><b>3</b>-year horizon</span><i /><span><b>100%</b> probability audited</span></div></section>
    <section id="analysis" className="analysisSection"><div className="sectionIntro"><div><span className="kicker">LATEST MODEL</span><h2>{analysis.company}</h2><p>{analysis.ticker} · 3-year horizon · {notice}</p></div><div className="confidence"><span>MODEL CONFIDENCE</span><strong>{analysis.confidence}<small>/100</small></strong><div className="confidenceBar"><i style={{ width: `${analysis.confidence}%` }} /></div></div></div>
      <div className="metricGrid"><article className="priceCard dark"><span>Price today</span><strong>${analysis.currentPrice.toFixed(2)}</strong><small>Starting point</small></article><article className="priceCard lime"><span>Probability-weighted value</span><strong>${analysis.expectedPrice.toFixed(2)}</strong><small>Σ probability × scenario price</small></article><article className="priceCard"><span>Expected 3-year return</span><strong className={expectedReturn >= 0 ? "positive" : "negative"}>{expectedReturn >= 0 ? "+" : ""}{expectedReturn.toFixed(1)}%</strong><small>{cagr >= 0 ? "+" : ""}{cagr.toFixed(1)}% annualized</small></article><article className="priceCard"><span>Probability check</span><strong>{probabilityTotal}%</strong><small className={probabilityTotal === 100 ? "checked" : "warning"}>{probabilityTotal === 100 ? "✓ Normalized" : "Needs audit"}</small></article></div>
      <div className="distributionCard"><div className="distributionHead"><div><span className="kicker">OUTCOME DISTRIBUTION</span><h3>Where the probability sits</h3></div><span className="formula">EV = Σ (probability × price)</span></div><div className="distributionBar"><i className="bear" style={{ width: `${ranges.bear}%` }} /><i className="base" style={{ width: `${ranges.base}%` }} /><i className="bull" style={{ width: `${ranges.bull}%` }} /></div><div className="distributionLegend"><span><i className="dot bear" />Bear <b>{ranges.bear}%</b></span><span><i className="dot base" />Base <b>{ranges.base}%</b></span><span><i className="dot bull" />Bull <b>{ranges.bull}%</b></span></div><p className="modelSummary">{analysis.summary}</p></div>
      <div className="signalsGrid">{analysis.signals.map((signal) => <article className="signal" key={signal.label}><div><span>{signal.label}</span><i className={`signalDot ${signal.tone}`} /></div><strong>{signal.value}</strong><p>{signal.detail}</p></article>)}</div>
      <div className="researchHeader"><div><span className="kicker">EVIDENCE SCORECARD</span><h2>The questions behind the probability</h2><p>Each category records direction, evidence strength, citations and what remains unknown.</p></div><span>{analysis.research.filter((item) => item.unansweredQuestions.length > 0).length} categories with open questions</span></div>
      <div className="researchGrid">{analysis.research.map((finding) => { const category = researchFramework.find(({ id }) => id === finding.categoryId); if (!category) return null; const isOpen = openResearch === finding.categoryId; return <article className={`researchCard ${isOpen ? "open" : ""}`} key={finding.categoryId}><button type="button" onClick={() => setOpenResearch(isOpen ? null : finding.categoryId)} aria-expanded={isOpen}><div><span>{category.label}</span><span className={`score score${finding.score}`}>{finding.score > 0 ? "+" : ""}{finding.score}</span></div><p>{finding.finding}</p><div className="evidenceStrength"><span>Evidence</span>{[1, 2, 3].map((level) => <i key={level} className={level <= finding.evidenceStrength ? "filled" : ""} />)}<small>{finding.evidenceStrength}/3</small></div><b>{isOpen ? "Close" : `${category.questions.length} questions`} ↗</b></button>{isOpen && <div className="researchDetail"><h4>Questions asked</h4><ul>{category.questions.map((question) => <li key={question}>{question}</li>)}</ul><h4>Preferred evidence</h4><p>{category.preferredSources.join(" · ")}</p>{finding.unansweredQuestions.length > 0 && <><h4>Still unanswered</h4><ul className="unanswered">{finding.unansweredQuestions.map((question) => <li key={question}>{question}</li>)}</ul></>}<h4>Evidence used</h4><div className="citationLinks">{finding.sourceIds.map((id) => { const source = sourceMap.get(id); return source ? <a key={id} href={source.url} target="_blank" rel="noreferrer">[{id}] {source.publisher}</a> : null; })}</div></div>}</article>; })}</div>
      <div className="scenarioHeader"><div><span className="kicker">SCENARIO BOOK</span><h2>20 ways the next three years unfold</h2></div><div className="filters" aria-label="Filter scenarios">{(["all", "bull", "base", "bear"] as const).map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item === "all" ? "All 20" : item}</button>)}</div></div>
      <div className="scenarioTable" role="table" aria-label="Probability weighted scenarios"><div className="tableHead" role="row"><span>#</span><span>Scenario</span><span>Probability</span><span>3Y price</span><span>Return</span><span /></div>{filtered.map((scenario) => { const index = analysis.scenarios.indexOf(scenario); const ret = (scenario.price / analysis.currentPrice - 1) * 100; return <div className={`scenarioRow ${expanded === index ? "open" : ""}`} key={`${scenario.name}-${index}`} role="row" onClick={() => setExpanded(expanded === index ? null : index)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setExpanded(expanded === index ? null : index); }}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="scenarioName"><i className={`dot ${scenario.type}`} />{scenario.name}<small><span>{scenario.thesis}</span><b>{scenario.valuationMethod}: {scenario.targetEquityValue.toFixed(1)} equity value ÷ {scenario.targetDilutedShares.toFixed(2)} diluted shares = ${scenario.price.toFixed(2)}</b><em>{scenario.keyDrivers.join(" · ")}</em><i>Sources {scenario.sourceIds.map((id) => `[${id}]`).join(" ")}</i></small></span><span className="prob"><i><b style={{ width: `${Math.min(scenario.probability * 7, 100)}%` }} /></i>{scenario.probability}%</span><strong>${scenario.price.toFixed(0)}</strong><strong className={ret >= 0 ? "positive" : "negative"}>{ret >= 0 ? "+" : ""}{ret.toFixed(0)}%</strong><span className="chevron">⌄</span></div>; })}</div>
    </section>
    <section id="method" className="methodSection"><div className="methodCopy"><span className="kicker">HOW THE AGENT THINKS</span><h2>Evidence first.<br />Probabilities second.</h2><p>Each run rebuilds the evidence set before it estimates a price. Confidence is calculated from coverage and source quality—not self-reported by the model.</p><div className="guardrail">Not investment advice. Outputs are uncertain estimates and should be stress-tested against your own assumptions.</div></div><ol className="pipeline">{["Resolve security, live price & timestamp", "Read filings and at least 10 quarters", "Answer 48 questions across 12 categories", "Triangulate claims and record missing evidence", "Score evidence direction and strength", "Build explicit business and valuation cases", "Generate mutually exclusive company scenarios", "Audit valuation math & normalize to 100%"].map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p><i>{index < 2 ? "PRIMARY" : index < 5 ? "EVIDENCE" : "MODEL"}</i></li>)}</ol></section>
    <section id="sources" className="sourcesSection"><div><span className="kicker">SOURCE LEDGER</span><h2>Traceable by design</h2><p>Primary sources establish facts; independent sources test the story.</p></div><div className="sourceList">{analysis.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><span>↗</span><div><strong>[{source.id}] {source.title}</strong><small>{source.publisher} · {source.publishedAt} · {source.type} · {source.primary ? "Primary" : "Secondary"}</small></div></a>)}</div></section>
    <footer><span className="brand"><span className="brandMark">P</span>Possible</span><p>Built for clearer thinking under uncertainty.</p><span>Research model · v0.1</span></footer>
    {running && <div className="researchOverlay" role="status" aria-live="polite"><div className="researchPanel"><span className="agentOrb" /><div><span className="kicker">RESEARCH AGENT</span><h3>{stages[stage]}</h3><p>{query} · Step {stage + 1} of {stages.length}</p></div><div className="stageTrack">{stages.map((_, index) => <i key={index} className={index <= stage ? "done" : ""} />)}</div></div></div>}
  </main>;
}
