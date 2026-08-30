import assert from "node:assert/strict";
import test from "node:test";
import { isValidTicker, MAX_TICKER_LENGTH } from "../lib/ticker.ts";

test("accepts numeric exchange-qualified tickers", () => {
  assert.equal(isValidTicker("282330.KS"), true);
  assert.equal(MAX_TICKER_LENGTH, 12);
});

test("rejects malformed and oversized tickers", () => {
  assert.equal(isValidTicker(""), false);
  assert.equal(isValidTicker("282330 KS"), false);
  assert.equal(isValidTicker("ABCDEFGHIJKLM"), false);
});
