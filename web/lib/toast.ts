import { useSyncExternalStore } from "react";

export interface ToastItem {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  detail?: string;
  hash?: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function pushToast(t: Omit<ToastItem, "id">, ms = 8000): number {
  const id = nextId++;
  items = [...items, { ...t, id }].slice(-4);
  emit();
  if (ms > 0 && typeof window !== "undefined") setTimeout(() => dismissToast(id), ms);
  return id;
}

export function dismissToast(id: number) {
  items = items.filter((i) => i.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const empty: ToastItem[] = [];

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, () => items, () => empty);
}
