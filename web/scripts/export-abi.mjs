// pnpm abi: regenerate the IntentBook / PriceGuard / BatchSettler ABIs in lib/contracts.ts from ../contracts/out.
// No-op safe: if contracts/out (forge build output) is missing, prints why and exits 0 without touching anything.
// Keeps SPEC D34: INTENT_BOOK_ABI also carries every PriceGuard and BatchSettler error (they bubble up
// through settle/preview), de-duplicated by signature. Constructors, receive and fallback are dropped.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../contracts/out");
const target = resolve(here, "../lib/contracts.ts");

if (!existsSync(out)) {
  console.log("abi: ../contracts/out not found. Run `forge build` in contracts/ first. Nothing changed.");
  process.exit(0);
}

const load = (name) => {
  const file = resolve(out, `${name}.sol/${name}.json`);
  if (!existsSync(file)) return null;
  const { abi } = JSON.parse(readFileSync(file, "utf8"));
  return abi.filter((x) => ["function", "event", "error"].includes(x.type));
};

const book = load("IntentBook");
const guard = load("PriceGuard");
const settler = load("BatchSettler");
const missing = [
  ["IntentBook", book],
  ["PriceGuard", guard],
  ["BatchSettler", settler],
]
  .filter(([, v]) => !v)
  .map(([n]) => n);
if (missing.length) {
  console.log(`abi: no build output for ${missing.join(", ")} in contracts/out. Nothing changed.`);
  process.exit(0);
}

const sig = (x) => `${x.type}:${x.name}(${(x.inputs ?? []).map((i) => i.type).join(",")})`;

function mergeErrors(base, ...others) {
  const seen = new Set(base.map(sig));
  const merged = [...base];
  for (const abi of others) {
    for (const x of abi) {
      if (x.type !== "error" || seen.has(sig(x))) continue;
      seen.add(sig(x));
      merged.push(x);
    }
  }
  return merged;
}

const sorted = (abi) => [...abi].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

function replaceAbi(src, name, abi) {
  const start = src.indexOf(`export const ${name} = `);
  if (start < 0) throw new Error(`export ${name} not found in lib/contracts.ts`);
  const end = src.indexOf("] as const;", start);
  if (end < 0) throw new Error(`end of ${name} not found`);
  const body = JSON.stringify(abi, null, 2);
  return `${src.slice(0, start)}export const ${name} = ${body} as const;${src.slice(end + "] as const;".length)}`;
}

let src = readFileSync(target, "utf8");
src = replaceAbi(src, "INTENT_BOOK_ABI", sorted(mergeErrors(book, guard, settler)));
src = replaceAbi(src, "PRICE_GUARD_ABI", sorted(guard));
src = replaceAbi(src, "BATCH_SETTLER_ABI", sorted(settler));
writeFileSync(target, src);
console.log("abi: updated INTENT_BOOK_ABI (with PriceGuard + BatchSettler errors merged), PRICE_GUARD_ABI, BATCH_SETTLER_ABI.");
