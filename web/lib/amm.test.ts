import { describe, expect, it } from "vitest";
import { aloneOut, applySlippage, getAmountOut, diffBps } from "./amm";

// Reserves read on 2026-11-14 (brief section 6).
const R = { reserveMusd: 102257124585249121862151778n, reserveBtc: 1307259994017371489267n, feeBps: 4n };

describe("getAmountOut", () => {
  it("3000 MUSD -> BTC matches the chain to the wei", () => {
    expect(aloneOut(false, 3000n * 10n ** 18n, R)).toBe(38_335_679_053_412_706n);
  });
  it("0.05 BTC -> MUSD matches the chain to the wei", () => {
    expect(aloneOut(true, 5n * 10n ** 16n, R)).toBe(3_909_410_306_926_059_474_463n);
  });
  it("1 BTC -> MUSD matches the chain to the wei", () => {
    expect(aloneOut(true, 10n ** 18n, R)).toBe(78_131_452_047_320_329_097_278n);
  });
  it("returns 0 for empty input or empty reserves", () => {
    expect(getAmountOut(0n, 1n, 1n, 4n)).toBe(0n);
    expect(getAmountOut(1n, 0n, 1n, 4n)).toBe(0n);
  });
});

describe("helpers", () => {
  it("applies slippage by flooring", () => {
    expect(applySlippage(10_000n, 50n)).toBe(9_950n);
    expect(applySlippage(1n, 50n)).toBe(0n);
  });
  it("diffBps rounds up", () => {
    expect(diffBps(10_001n, 10_000n, 10_000n)).toBe(1n);
    expect(diffBps(10_000n, 10_000n, 10_000n)).toBe(0n);
  });
});
