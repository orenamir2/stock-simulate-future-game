import assert from "node:assert/strict";
import test from "node:test";
import {
  isMarket,
  isValidSecurityCode,
  marketResearchContext,
  normalizeSecurityCode,
} from "../lib/market-support.ts";

test("accepts international exchange symbols including Korean numeric codes", () => {
  for (const symbol of ["AAPL", "SAP.DE", "005930", "TEVA.TA", "000660.KS"]) {
    assert.equal(isValidSecurityCode(symbol), true, symbol);
  }
  for (const symbol of ["", "../AAPL", "AAPL US", "AAPL;DROP", "1234567890123"]) {
    assert.equal(isValidSecurityCode(symbol), false, symbol);
  }
  assert.equal(normalizeSecurityCode(" sap.de "), "SAP.DE");
});

test("validates market choices and supplies local primary-source guidance", () => {
  assert.equal(isMarket("south-korea"), true);
  assert.equal(isMarket("canada"), false);
  assert.match(marketResearchContext("europe"), /ESEF/);
  assert.match(marketResearchContext("south-korea"), /DART/);
  assert.match(marketResearchContext("israel"), /MAGNA/);
});
