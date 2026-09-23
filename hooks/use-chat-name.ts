"use client";

import { useAuiState } from "@assistant-ui/react";

// `s.thread` is the open chat, so the first-question fallback applies only to it.
export function useChatName(): string {
  return useAuiState((s) => {
    if (s.threadListItem.title) return s.threadListItem.title;
    if (s.threadListItem.id !== s.threads.mainThreadId) return "";
    const part = s.thread.messages.find((m) => m.role === "user")?.content.find((p) => p.type === "text");
    return part?.type === "text" ? part.text : "";
  });
}
