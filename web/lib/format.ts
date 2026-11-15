/** Display helpers. MUSD 2 dp, BTC 6 dp, percentages 2 dp. All bigint, no float rounding. */

const E18 = 10n ** 18n;

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Round half up an 18-decimal bigint to `dp` places and format with thousands separators. */
export function fmtUnits(value: bigint, dp: number): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const scale = 10n ** BigInt(18 - dp);
  const rounded = (abs + scale / 2n) / scale;
  const s = rounded.toString().padStart(dp + 1, "0");
  const int = s.slice(0, s.length - dp);
  const frac = s.slice(s.length - dp);
  const body = dp > 0 ? `${group(int)}.${frac}` : group(int);
  return neg && rounded !== 0n ? `-${body}` : body;
}

export const fmtMusd = (v: bigint) => fmtUnits(v, 2);
export const fmtBtc = (v: bigint) => fmtUnits(v, 6);
/** Price, MUSD per BTC, 1e18-scaled. */
export const fmtPrice = (v: bigint) => fmtUnits(v, 2);

/** Signed, with an explicit plus. */
export function fmtSigned(v: bigint, dp: number): string {
  const s = fmtUnits(v, dp);
  return v > 0n ? `+${s}` : s;
}

/** bps -> "0.50%". */
export function fmtBps(bps: bigint | number): string {
  const b = BigInt(bps);
  const neg = b < 0n;
  const abs = neg ? -b : b;
  const s = `${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}%`;
  return neg ? `-${s}` : s;
}

export const fmtMusdUnit = (v: bigint) => `${fmtMusd(v)} MUSD`;
export const fmtBtcUnit = (v: bigint) => `${fmtBtc(v)} BTC`;

/** Parse a user-typed decimal into an 18-decimal bigint. Returns null if not a valid amount. */
export function parseAmount(input: string): bigint | null {
  const t = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  const [i, f = ""] = t.split(".");
  if (f.length > 18) return null;
  return BigInt(i || "0") * E18 + BigInt(f.padEnd(18, "0") || "0");
}

/** Plain decimal string for an input box (no separators, trailing zeros trimmed). */
export function toInputString(v: bigint, maxDp = 18): string {
  const s = v.toString().padStart(19, "0");
  const int = s.slice(0, s.length - 18);
  const frac = s.slice(s.length - 18).slice(0, maxDp).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

export function shortAddress(a: string): string {
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
export const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h);

/** Seconds -> "1:12" (or "1:02:03" past an hour). Never negative. */
export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const ss = sec.toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Hours with one decimal: "4.3 h". */
export function fmtHours(seconds: number): string {
  return `${(Math.max(0, seconds) / 3600).toFixed(1)} h`;
}

/** Local clock time "14:32" for a unix timestamp. */
export function fmtClock(unix: number): string {
  const d = new Date(unix * 1000);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
