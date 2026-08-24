export type ResearchCategory = {
  id: string;
  label: string;
  questions: readonly string[];
  preferredSources: readonly string[];
};

export const researchFramework: readonly ResearchCategory[] = [
  {
    id: "business-model",
    label: "Business model",
    questions: [
      "How does the company make money by product, geography, channel and customer type?",
      "Which revenue is recurring, usage-based, transactional or cyclical?",
      "What are the unit economics, pricing power and cost structure?",
      "What must remain true for the business to compound for three years?",
    ],
    preferredSources: ["10-K/20-F", "segment notes", "investor day", "industry data"],
  },
  {
    id: "product-customers",
    label: "Product & customers",
    questions: [
      "What customer problem is solved, and how mission-critical is the product?",
      "Are adoption, retention, churn, usage, backlog and customer concentration improving?",
      "What do customers say about quality, value, switching and alternatives?",
      "Is the roadmap creating a replacement cycle, cross-sell or a new market?",
    ],
    preferredSources: ["product disclosures", "customer reviews", "channel checks", "usage data"],
  },
  {
    id: "market-industry",
    label: "Market & industry",
    questions: [
      "How large is the real addressable market and how quickly is it growing?",
      "What share does the company have, and is growth from share gains or the category?",
      "Where is the industry in its capacity, inventory and demand cycle?",
      "Which structural changes could expand or shrink the profit pool?",
    ],
    preferredSources: ["government data", "trade associations", "customer filings", "industry research"],
  },
  {
    id: "competition-moat",
    label: "Competition & moat",
    questions: [
      "Who are the direct, substitute and emerging competitors?",
      "Is the moat based on cost, network effects, data, brand, regulation or switching costs?",
      "Are win rates, market share, price gaps and R&D intensity strengthening?",
      "What would cause the moat to weaken faster than expected?",
    ],
    preferredSources: ["competitor filings", "market-share data", "patents", "pricing pages"],
  },
  {
    id: "financial-quality",
    label: "Financial quality",
    questions: [
      "What are the 3–5 year trends in organic revenue, margins, ROIC and free cash flow?",
      "How much profit converts to cash after stock compensation and required investment?",
      "Are receivables, inventory, deferred revenue or one-offs contradicting earnings?",
      "Which operating drivers explain historical estimate misses?",
    ],
    preferredSources: ["10-Q/10-K", "cash-flow statement", "footnotes", "earnings history"],
  },
  {
    id: "balance-sheet",
    label: "Balance sheet",
    questions: [
      "Can liquidity fund operations and maturities through a severe downside case?",
      "What debt, lease, pension, guarantee and off-balance-sheet obligations exist?",
      "Are working-capital needs or counterparty exposures rising?",
      "Could dilution, refinancing or covenant pressure impair per-share value?",
    ],
    preferredSources: ["debt footnotes", "credit ratings", "maturity schedule", "liquidity disclosures"],
  },
  {
    id: "management-governance",
    label: "Management & governance",
    questions: [
      "Has management allocated capital and met guidance credibly across cycles?",
      "Are incentives aligned with durable per-share value rather than adjusted targets?",
      "What do insider ownership, transactions, turnover and succession plans signal?",
      "Are related-party, audit, control or governance concerns material?",
    ],
    preferredSources: ["proxy statement", "Form 4", "earnings transcripts", "governance filings"],
  },
  {
    id: "capital-allocation",
    label: "Capital allocation",
    questions: [
      "What returns have reinvestment, acquisitions, buybacks and dividends produced?",
      "Are buybacks creating value after dilution and at the prices paid?",
      "How much investment is maintenance versus growth spending?",
      "What is the likely three-year change in diluted share count and net cash or debt?",
    ],
    preferredSources: ["cash-flow statement", "acquisition notes", "share count", "capital policy"],
  },
  {
    id: "valuation",
    label: "Valuation",
    questions: [
      "What expectations for growth, margins and reinvestment are embedded in today’s price?",
      "Which valuation method matches the economics: DCF, earnings, FCF, book value or sum-of-parts?",
      "How does valuation compare with the company’s history and truly comparable firms?",
      "What equity value follows from bear, base and bull operating assumptions after dilution?",
    ],
    preferredSources: ["live market data", "company filings", "peer filings", "risk-free and credit data"],
  },
  {
    id: "risks-regulation",
    label: "Risk & regulation",
    questions: [
      "What operational, legal, regulatory, cyber, safety and accounting risks can impair value?",
      "Which exposures are concentrated by supplier, customer, product or geography?",
      "What is the probability, financial severity and leading indicator for each major risk?",
      "Which risks are correlated and should appear together in a scenario?",
    ],
    preferredSources: ["risk factors", "regulators", "court records", "security and recall notices"],
  },
  {
    id: "macro-geopolitics",
    label: "Macro & geopolitics",
    questions: [
      "How sensitive are volume, pricing, costs and valuation to rates, inflation and recession?",
      "What currency, commodity, tariff, trade and sovereign exposures matter?",
      "Which historical periods provide useful stress-test elasticities?",
      "What macro variables are leading indicators for this specific business?",
    ],
    preferredSources: ["central banks", "government statistics", "customs data", "commodity data"],
  },
  {
    id: "catalysts-expectations",
    label: "Catalysts & expectations",
    questions: [
      "Which dated events could change fundamentals or the market narrative?",
      "Where do company guidance, consensus and observable leading indicators disagree?",
      "What does positioning, short interest and options-implied volatility suggest—not prove?",
      "What evidence would falsify the bull, base and bear theses?",
    ],
    preferredSources: ["company calendar", "guidance", "estimate history", "exchange market data"],
  },
] as const;

export const researchFrameworkPrompt = researchFramework
  .map(
    (category) =>
      `${category.id} (${category.label})\nQuestions: ${category.questions.join(" | ")}\nPreferred sources: ${category.preferredSources.join(", ")}`,
  )
  .join("\n\n");
