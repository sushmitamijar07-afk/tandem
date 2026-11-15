/** Re-implementation of the Mezo volatile pool's getAmountOut, exact to the wei. */

const BPS = 10_000n;

/** out = a' * rB / (rA + a'), where a' = a - floor(a * feeBps / 10000). */
export function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const net = amountIn - (amountIn * feeBps) / BPS;
  return (net * reserveOut) / (reserveIn + net);
}

export interface Reserves {
  reserveMusd: bigint;
  reserveBtc: bigint;
  feeBps: bigint;
}

/** What swapping alone on the pool would give, from reserves (token0 = MUSD, token1 = BTC). */
export function aloneOut(sellBtc: boolean, amountIn: bigint, r: Reserves): bigint {
  return sellBtc
    ? getAmountOut(amountIn, r.reserveBtc, r.reserveMusd, r.feeBps)
    : getAmountOut(amountIn, r.reserveMusd, r.reserveBtc, r.feeBps);
}

/** Apply a slippage tolerance in bps: floor(x * (10000 - bps) / 10000). */
export function applySlippage(x: bigint, bps: bigint): bigint {
  return (x * (BPS - bps)) / BPS;
}

/** Value of a BTC amount in MUSD at a 1e18-scaled price. */
export function btcToMusd(btc: bigint, price: bigint): bigint {
  return (btc * price) / 10n ** 18n;
}

/** Ceil of |a - b| * 1e4 / base, in bps. */
export function diffBps(a: bigint, b: bigint, base: bigint): bigint {
  if (base === 0n) return 0n;
  const d = a > b ? a - b : b - a;
  return (d * BPS + base - 1n) / base;
}
