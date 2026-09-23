"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, type Settings, SettingsSchema } from "@/lib/settings";

const KEY = "arkham.settings";

// Cached by raw string: useSyncExternalStore needs the same object for an unchanged store.
let cache: { raw: string | null; value: Settings } = { raw: null, value: DEFAULT_SETTINGS };
const listeners = new Set<() => void>();
let unstored: string | null = null;

function raw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return unstored;
  }
}

export function readSettings(): Settings {
  const r = raw();
  if (r !== cache.raw) {
    let value = DEFAULT_SETTINGS;
    try {
      const parsed = SettingsSchema.partial().safeParse(JSON.parse(r ?? "null"));
      if (parsed.success) value = { ...DEFAULT_SETTINGS, ...parsed.data };
    } catch {}
    cache = { raw: r, value };
  }
  return cache.value;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // `storage` fires only in other tabs; update() notifies this one
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, readSettings, () => DEFAULT_SETTINGS);
  const update = useCallback((patch: Partial<Settings>) => {
    const next = JSON.stringify({ ...readSettings(), ...patch });
    try {
      localStorage.setItem(KEY, next);
    } catch {
      unstored = next;
    }
    for (const l of listeners) l();
  }, []);
  return { settings, update };
}
