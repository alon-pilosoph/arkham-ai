// Imported by the client: keep it free of server modules.

import type { UIMessage } from "ai";

export const HISTORY_MESSAGES = 24;

/** Earlier turns keep only their text, so stale tool results are never re-read as fresh. */
export function trimHistory<M extends UIMessage>(messages: M[]): M[] {
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  const kept = messages
    .map((m, i) => (i >= lastUser ? m : { ...m, parts: m.parts.filter((p) => p.type === "text") }))
    .filter((m) => m.parts.length > 0)
    .slice(-HISTORY_MESSAGES);
  const first = kept.findIndex((m) => m.role === "user");
  return first < 0 ? [] : kept.slice(first);
}
