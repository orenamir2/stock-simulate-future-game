export const MARKET_OPTIONS = [
  { value: "auto", label: "Auto / U.S." },
  { value: "europe", label: "Europe" },
  { value: "south-korea", label: "South Korea" },
  { value: "israel", label: "Israel" },
] as const;

export type Market = (typeof MARKET_OPTIONS)[number]["value"];

const SECURITY_CODE = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;

export function normalizeSecurityCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidSecurityCode(value: string): boolean {
  return SECURITY_CODE.test(normalizeSecurityCode(value));
}

export function isMarket(value: unknown): value is Market {
  return typeof value === "string" && MARKET_OPTIONS.some((option) => option.value === value);
}

export function marketResearchContext(market: Market): string {
  switch (market) {
    case "europe":
      return `The user selected Europe. Treat an exchange suffix (for example .DE, .PA, .AS or .L) as part of the requested identifier and use it to disambiguate the listing. Identify the exact exchange and jurisdiction. Prefer the exchange, the relevant national securities regulator or official filing repository, ESEF annual financial reports, and issuer investor-relations documents. Do not assume SEC filings exist.`;
    case "south-korea":
      return `The user selected South Korea. Numeric six-digit security codes are valid. Resolve the requested code on KRX (KOSPI, KOSDAQ or KONEX as applicable). Prefer KRX market data, DART filings from South Korea's Financial Supervisory Service, and issuer investor-relations documents. Use original Korean disclosures when they are authoritative, translating claims accurately.`;
    case "israel":
      return `The user selected Israel. Resolve the requested security on the Tel Aviv Stock Exchange unless an explicit suffix identifies another listing. Prefer TASE market data, MAGNA filings from the Israel Securities Authority, and issuer investor-relations documents. Use original Hebrew disclosures when they are authoritative, translating claims accurately.`;
    default:
      return `No region was selected. Resolve the identifier globally and do not assume it is a U.S. security. An exchange suffix is part of the requested identifier and must be used to disambiguate the listing.`;
  }
}
