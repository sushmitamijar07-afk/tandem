"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
/** false during server render and hydration, true afterwards. */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
