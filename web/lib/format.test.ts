import { describe, expect, it } from "vitest";
import {
  fmtBps,
  fmtBtc,
  fmtCountdown,
  fmtHours,
  fmtMusd,
  fmtSigned,
  fmtUnits,
  parseAmount,
  shortAddress,
  toInputString,
} from "./format";

const E = 10n ** 18n;

describe("format", () => {
  it("MUSD uses 2 dp with separators", () => {
    expect(fmtMusd(3000n * E)).toBe("3,000.00");
    expect(fmtMusd(3_910_751_662_000_000_000_000n)).toBe("3,910.75");
    expect(fmtMusd(0n)).toBe("0.00");
  });
  it("BTC uses 6 dp", () => {
    expect(fmtBtc(38_352_144_000_000_000n)).toBe("0.038352");
    expect(fmtBtc(5n * 10n ** 16n)).toBe("0.050000");
  });
  it("rounds half up", () => {
    expect(fmtUnits(5n * 10n ** 15n, 2)).toBe("0.01");
    expect(fmtUnits(4n * 10n ** 15n, 2)).toBe("0.00");
  });
  it("percentages are 2 dp", () => {
    expect(fmtBps(50)).toBe("0.50%");
    expect(fmtBps(2114n)).toBe("21.14%");
    expect(fmtBps(1714n)).toBe("17.14%");
    expect(fmtBps(0)).toBe("0.00%");
  });
  it("signed", () => {
    expect(fmtSigned(16_465_000_000_000n, 6)).toBe("+0.000016");
  });
  it("parses amounts", () => {
    expect(parseAmount("1.5")).toBe(15n * 10n ** 17n);
    expect(parseAmount("1,000")).toBe(1000n * E);
    expect(parseAmount(".5")).toBe(5n * 10n ** 17n);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1.0000000000000000001")).toBeNull();
  });
  it("round-trips input strings", () => {
    expect(toInputString(15n * 10n ** 17n)).toBe("1.5");
    expect(toInputString(3000n * E)).toBe("3000");
    expect(toInputString(1n, 6)).toBe("0");
  });
  it("countdown", () => {
    expect(fmtCountdown(72)).toBe("1:12");
    expect(fmtCountdown(-3)).toBe("0:00");
    expect(fmtCountdown(3723)).toBe("1:02:03");
  });
  it("hours and addresses", () => {
    expect(fmtHours(15480)).toBe("4.3 h");
    expect(shortAddress("0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9")).toBe("0xd16A…6AA9");
  });
});
