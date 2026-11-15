import { describe, expect, it } from "vitest";
import { matchedSummary, sideTotals } from "./summary";
import { mockSnapshot } from "./mocks";
import { phaseOf } from "./phase";

describe("round summary (brief example 1)", () => {
  const snap = mockSnapshot("open", 1_800_000_000);
  const cur = snap.rounds[0];
  it("splits swaps by side", () => {
    const t = sideTotals(cur);
    expect(t.btcCount).toBe(1);
    expect(t.musdCount).toBe(2);
    expect(t.musdIn).toBe(4000n * 10n ** 18n);
  });
  it("matched part excludes the failed order", () => {
    const m = matchedSummary(cur);
    expect(m?.musd).toBe(3000n * 10n ** 18n);
    expect(m?.btc).toBe(38_352_144_000_000_000n);
    expect(m?.poolIsBtc).toBe(true);
  });
  it("phases follow D38", () => {
    expect(phaseOf(cur, cur.closeAt - 10)).toBe("open");
    expect(phaseOf(cur, cur.closeAt)).toBe("ready");
    expect(phaseOf(cur, cur.expireAt)).toBe("refund");
    expect(phaseOf({ ...cur, batch: { ...cur.batch, live: 0 } }, cur.closeAt)).toBe("empty");
  });
});
