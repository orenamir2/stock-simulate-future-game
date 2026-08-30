export const MAX_TICKER_LENGTH = 12;

const TICKER_PATTERN = /^[A-Z0-9.-]{1,12}$/;

export function isValidTicker(ticker: string): boolean {
  return TICKER_PATTERN.test(ticker);
}
