import { researchFramework } from "../lib/research-framework.ts";
import type { FactorStates, RawAnalysis } from "../lib/analysis-types.ts";

function factorStates(index: number): FactorStates {
  const macro = ["downturn", "steady", "expansion"] as const;
  const demand = ["contraction", "steady", "growth"] as const;
  const execution = ["miss", "meet", "beat"] as const;
  const valuation = ["compression", "steady", "expansion"] as const;
  const balanceSheet = ["deteriorating", "steady", "improving"] as const;
  let code = index;
  const digits = [0, 0, 0, 0, 0];
  for (let digit = 4; digit >= 0; digit -= 1) {
    digits[digit] = code % 3;
    code = Math.floor(code / 3);
  }
  return {
    macro: macro[digits[0]],
    industryDemand: demand[digits[1]],
    companyExecution: execution[digits[2]],
    valuationRegime: valuation[digits[3]],
    balanceSheet: balanceSheet[digits[4]],
  };
}

export function makeRawAnalysis(): RawAnalysis {
  return {
    ticker: "TEST",
    company: "Test Company",
    exchange: "Test Exchange",
    securityType: "common-stock",
    shareClass: "Common",
    instrumentId: "TEST-ID",
    instrumentIdType: "exchange-symbol",
    tradingCurrency: "USD",
    reportingCurrency: "USD",
    currentPrice: 25,
    priceAsOf: "2024-12-31T16:00:00Z",
    fiscalDataAsOf: "2024-09-30",
    adrRatio: 1,
    currentReportingToTradingFxRate: 1,
    fxRateAsOf: "2024-12-31T16:00:00Z",
    marketDataSourceId: "s8",
    latestFilingSourceId: "s1",
    fxSourceId: "s8",
    summary: "Fixture analysis",
    baseline: {
      scale: "millions",
      asOf: "2024-09-30",
      revenue: 100,
      operatingMarginPct: 15,
      freeCashFlowMarginPct: 10,
      netIncomeMarginPct: 8,
      netCash: 20,
      dilutedShares: 10,
      balanceSheetValue: 80,
      sourceIds: ["s1", "s2"],
    },
    scenarios: Array.from({ length: 20 }, (_, index) => ({
      name: `Scenario ${index + 1}`,
      thesis: `Distinct scenario ${index + 1}`,
      relativeLikelihood: index + 1,
      probabilityRationale: "Fixture likelihood rationale",
      valuationMethod: "Forward net-income multiple",
      factorStates: factorStates(index),
      valuationInputs: {
        revenueCagrPct: -5 + index,
        operatingMarginPct: 12 + index * 0.5,
        freeCashFlowMarginPct: 8 + index * 0.4,
        netIncomeMarginPct: 6 + index * 0.35,
        balanceSheetValue: 70 + index,
        netCash: 10 + index,
        dilutedShares: 10 - index * 0.05,
        reportingToTradingFxRate: 1,
        valuationBasis: "equity-value-multiple",
        valuationMetric: "net-income",
        valuationMultiple: 8 + index,
        cumulativeDividendsPerShare: 1 + index * 0.05,
      },
      keyDrivers: [`Driver ${index + 1}A`, `Driver ${index + 1}B`],
      sourceIds: ["s1", "s2", "s5"],
    })),
    signals: [
      { label: "Signal 1", value: "Positive", tone: "good", detail: "Detail 1" },
      { label: "Signal 2", value: "Mixed", tone: "neutral", detail: "Detail 2" },
      { label: "Signal 3", value: "Negative", tone: "bad", detail: "Detail 3" },
      { label: "Signal 4", value: "Mixed", tone: "neutral", detail: "Detail 4" },
    ],
    research: researchFramework.map((category, categoryIndex) => ({
      categoryId: category.id,
      score: categoryIndex % 3 - 1,
      finding: `Finding for ${category.label}`,
      questions: category.questions.map((question, questionIndex) => ({
        questionIndex,
        status: "answered",
        answer: `Answer to ${question}`,
        sourceIds: ["s1", "s2", "s4"],
      })),
      sourceIds: ["s1", "s2", "s4"],
    })),
    sources: [
      { id: "s1", title: "Annual filing", publisher: "SEC", publishedAt: "2024-10-31", accessedAt: "2024-12-31T17:00:00Z", url: "https://www.sec.gov/Archives/test-filing", type: "filing" },
      { id: "s2", title: "Results", publisher: "Company", publishedAt: "2024-10-30", accessedAt: "2024-12-31T17:00:00Z", url: "https://investor.example.com/results", type: "company" },
      { id: "s3", title: "Regulatory record", publisher: "Regulator", publishedAt: "2024-09-15", accessedAt: "2024-12-31T17:00:00Z", url: "https://regulator.example.org/record", type: "regulator" },
      { id: "s4", title: "Economic series", publisher: "Government", publishedAt: "2024-12-15", accessedAt: "2024-12-31T17:00:00Z", url: "https://data.example.gov/series", type: "government" },
      { id: "s5", title: "Industry report", publisher: "Industry", publishedAt: "2024-12-01", accessedAt: "2024-12-31T17:00:00Z", url: "https://industry.example.net/report", type: "industry" },
      { id: "s6", title: "Competitor filing", publisher: "Competitor", publishedAt: "2024-10-20", accessedAt: "2024-12-31T17:00:00Z", url: "https://competitor.example.com/filing", type: "competitor" },
      { id: "s7", title: "Customer record", publisher: "Customer", publishedAt: "2024-11-11", accessedAt: "2024-12-31T17:00:00Z", url: "https://customer.example.edu/record", type: "customer" },
      { id: "s8", title: "Market quote", publisher: "Exchange", publishedAt: "2024-12-31", accessedAt: "2024-12-31T17:00:00Z", url: "https://market.example.io/quote", type: "market" },
    ],
  };
}
