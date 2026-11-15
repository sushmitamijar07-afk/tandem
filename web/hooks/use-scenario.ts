"use client";

import { useSyncExternalStore } from "react";
import { isScenario, type Scenario } from "@/lib/mocks";

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const search = () => window.location.search;

/** Raw query string, "" on the server. */
export function useSearch(): string {
  return useSyncExternalStore(subscribe, search, () => "");
}

/** Mock scenario from ?state=. Only meaningful when USE_MOCKS is on. */
export function useScenario(): Scenario {
  const q = new URLSearchParams(useSearch()).get("state");
  return isScenario(q) ? q : "open";
}

/** ?as=1 fakes a connected wallet under mocks. */
export function useMockWallet(): boolean {
  return new URLSearchParams(useSearch()).get("as") === "1";
}
