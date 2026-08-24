export type SourceType =
  | "filing"
  | "company"
  | "regulator"
  | "government"
  | "industry"
  | "competitor"
  | "customer"
  | "market"
  | "news";

export type Source = {
  id: string;
  title: string;
  publisher: string;
  publishedAt: string;
  accessedAt: string;
  url: string;
  type: SourceType;
  primary: boolean;
};

export type Signal = {
  label: string;
  value: string;
  tone: "good" | "neutral" | "bad";
  detail: string;
};

export type QuestionAnswer = {
  questionIndex: number;
  status: "answered" | "partial" | "unanswered";
  answer: string;
  sourceIds: string[];
};

export type RawResearchFinding = {
  categoryId: string;
  score: number;
  finding: string;
  questions: QuestionAnswer[];
  sourceIds: string[];
};

export type ResearchFinding = RawResearchFinding & {
  evidenceStrength: number;
  unansweredQuestions: string[];
};

export type FactorStates = {
  macro: "downturn" | "steady" | "expansion";
  industryDemand: "contraction" | "steady" | "growth";
  companyExecution: "miss" | "meet" | "beat";
  valuationRegime: "compression" | "steady" | "expansion";
  balanceSheet: "deteriorating" | "steady" | "improving";
};

export type ValuationInputs = {
  revenueCagrPct: number;
  operatingMarginPct: number;
  freeCashFlowMarginPct: number;
  netIncomeMarginPct: number;
  balanceSheetValue: number;
  netCash: number;
  dilutedShares: number;
  reportingToTradingFxRate: number;
  valuationBasis: "enterprise-value-multiple" | "equity-value-multiple" | "nav";
  valuationMetric: "revenue" | "ebit" | "free-cash-flow" | "net-income" | "book-value" | "nav";
  valuationMultiple: number;
  cumulativeDividendsPerShare: number;
};

export type RawScenario = {
  name: string;
  thesis: string;
  relativeLikelihood: number;
  probabilityRationale: string;
  valuationMethod: string;
  factorStates: FactorStates;
  valuationInputs: ValuationInputs;
  keyDrivers: string[];
  sourceIds: string[];
};

export type Scenario = RawScenario & {
  probability: number;
  price: number;
  targetEquityValue: number;
  targetEnterpriseValue: number | null;
  targetDilutedShares: number;
  forecastRevenue: number;
  valuationMetricValue: number;
  totalReturnPct: number;
  annualizedReturnPct: number;
  type: "bull" | "base" | "bear";
  priceRangeMin: number;
  priceRangeMax: number | null;
};

export type BaselineFinancials = {
  scale: "millions" | "billions";
  asOf: string;
  revenue: number;
  operatingMarginPct: number;
  freeCashFlowMarginPct: number;
  netIncomeMarginPct: number;
  netCash: number;
  dilutedShares: number;
  balanceSheetValue: number;
  sourceIds: string[];
};

export type RawAnalysis = {
  ticker: string;
  company: string;
  exchange: string;
  securityType: "common-stock" | "adr" | "preferred-stock" | "reit" | "other";
  shareClass: string;
  instrumentId: string;
  instrumentIdType: "cik" | "isin" | "sedol" | "exchange-symbol" | "other";
  tradingCurrency: string;
  reportingCurrency: string;
  currentPrice: number;
  priceAsOf: string;
  fiscalDataAsOf: string;
  adrRatio: number;
  currentReportingToTradingFxRate: number;
  fxRateAsOf: string;
  marketDataSourceId: string;
  latestFilingSourceId: string;
  fxSourceId: string;
  summary: string;
  baseline: BaselineFinancials;
  scenarios: RawScenario[];
  signals: Signal[];
  research: RawResearchFinding[];
  sources: Omit<Source, "primary">[];
};

export type Analysis = Omit<RawAnalysis, "scenarios" | "research" | "sources"> & {
  expectedPrice: number;
  expectedTotalReturnPct: number;
  expectedAnnualizedReturnPct: number;
  confidence: number;
  probabilityMethod: string;
  scenarios: Scenario[];
  research: ResearchFinding[];
  sources: Source[];
  live?: boolean;
  engine?: string;
};
