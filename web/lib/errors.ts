import { BaseError, decodeErrorResult } from "viem";
import { INTENT_BOOK_ABI } from "@/lib/contracts";

/** One plain sentence per custom error a user can hit. */
export const ERROR_MESSAGES: Record<string, string> = {
  BelowMinimum: "That amount is below the minimum for a swap.",
  BatchFull: "This round is full. Try again in the next round.",
  BatchClosed: "This round has already closed. Join the next one.",
  SubmitsPaused: "New swaps are paused. Existing swaps still settle or refund.",
  SpotTwapDeviation: "Can't settle yet: the pool price moved too far from its average. Try again soon.",
  OracleDeviation: "Can't settle yet: the pool and Mezo's price feed differ by too much.",
  OracleUnavailable: "Mezo's price feed didn't update in the last minute. Try again in a few seconds.",
  PoolPaused: "The pool is paused, so this round can't settle right now.",
  SettleWindowOver: "Too late to settle; use Refund everyone.",
  SettleWindowNotOver: "It's too early to refund this round.",
  NothingToClaim: "There is nothing to claim.",
  NotStarted: "Swaps haven't started yet.",
  BatchNotClosed: "This round is still open.",
  BatchNotOpen: "This round was already settled or refunded.",
  IntentNotOpen: "This swap is no longer open.",
  NotIntentOwner: "That swap belongs to another address.",
  ZeroMinOut: "Set a minimum you'll accept.",
  AmountTooLarge: "That amount is too large.",
  ValueMismatch: "The amount sent doesn't match. Try again.",
  RouterOutMismatch: "The pool gave less than expected, so settling was stopped. Try again.",
  Conservation: "The round's totals didn't add up, so settling was stopped.",
  TooManyOrders: "Too many swaps in this round to settle at once.",
  ZeroPrice: "The pool price isn't available right now.",
  InvalidParam: "Something in that request isn't valid.",
  ReentrancyGuardReentrantCall: "Please wait for the last step to finish.",
  SafeERC20FailedOperation: "A token transfer failed. Check your balance and approval.",
};

export const STALE_PRICE_MESSAGE = "Price update pending. Try again in a few seconds.";
export const REJECTED_MESSAGE = "You cancelled in your wallet.";
export const GENERIC_MESSAGE = "Something went wrong. Try again.";

export interface TxError {
  kind: "rejected" | "error";
  name?: string;
  message: string;
}

function collectText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur; i++) {
    const e = cur as { message?: string; shortMessage?: string; details?: string; reason?: string; cause?: unknown };
    for (const s of [e.shortMessage, e.message, e.details, e.reason]) if (typeof s === "string") parts.push(s);
    cur = e.cause;
  }
  return parts.join(" | ");
}

function findHexData(err: unknown): `0x${string}` | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur; i++) {
    const e = cur as { data?: unknown; cause?: unknown };
    if (typeof e.data === "string" && /^0x[0-9a-fA-F]{8,}$/.test(e.data)) return e.data as `0x${string}`;
    const inner = (e.data as { data?: unknown } | undefined)?.data;
    if (typeof inner === "string" && /^0x[0-9a-fA-F]{8,}$/.test(inner)) return inner as `0x${string}`;
    cur = e.cause;
  }
  return undefined;
}

/** Name of the custom error inside any thrown thing, if it is one of ours. */
export function errorNameOf(err: unknown): string | undefined {
  if (err instanceof BaseError) {
    const found = err.walk((e) => typeof (e as { data?: { errorName?: string } }).data?.errorName === "string") as {
      data?: { errorName?: string };
    } | null;
    const name = found?.data?.errorName;
    if (name) return name;
  }
  const hex = findHexData(err);
  if (hex) {
    try {
      return decodeErrorResult({ abi: INTENT_BOOK_ABI, data: hex }).errorName;
    } catch {
      /* not ours */
    }
  }
  const text = collectText(err);
  for (const name of Object.keys(ERROR_MESSAGES)) {
    if (new RegExp(`\\b${name}\\b`).test(text)) return name;
  }
  return undefined;
}

/** Turn anything a wallet or RPC throws into one plain sentence. */
export function describeError(err: unknown): TxError {
  const text = collectText(err);
  const code = (err as { code?: number })?.code ?? (err as { cause?: { code?: number } })?.cause?.code;
  if (code === 4001 || /user rejected|user denied|rejected the request|request rejected/i.test(text)) {
    return { kind: "rejected", message: REJECTED_MESSAGE };
  }
  if (/oracle is stale/i.test(text) || /PriceFeed: .*stale/i.test(text)) {
    return { kind: "error", message: STALE_PRICE_MESSAGE };
  }
  const name = errorNameOf(err);
  if (name && ERROR_MESSAGES[name]) return { kind: "error", name, message: ERROR_MESSAGES[name] };
  if (/insufficient funds/i.test(text)) {
    return { kind: "error", message: "Your wallet doesn't have enough BTC to pay the network fee." };
  }
  return { kind: "error", message: GENERIC_MESSAGE };
}
