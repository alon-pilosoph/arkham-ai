"use client";

// The chat runtime, with chats stored in the app's own database (app/api/chats) instead of
// Assistant Cloud: a thread list adapter for the sidebar, and a history adapter per chat that
// stores each message as assistant-ui hands it over. Wired as @assistant-ui/ai-sdk's
// useChatRuntime wires its cloud adapter.

import { useChat } from "@ai-sdk/react";
import { type AssistantChatTransport, useAISDKRuntime } from "@assistant-ui/ai-sdk";
import {
  type GenericThreadHistoryAdapter,
  type MessageFormatAdapter,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
  type ThreadMessage,
  useAui,
  useAuiState,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import type { UIMessage } from "ai";
import { createAssistantStream } from "assistant-stream";
import { useMemo, useState } from "react";
import type { ChatSummary, StoredMessage } from "@/lib/chats";

const TITLE_CHARS = 60;

type RemoteThreadMetadata = Awaited<ReturnType<RemoteThreadListAdapter["fetch"]>>;
type Transport = AssistantChatTransport<UIMessage>;

async function call<T = void>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  if (res.status === 401) {
    window.location.assign("/sign-in");
    throw new Error("signed out");
  }
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const metadata = (c: ChatSummary): RemoteThreadMetadata => ({
  status: c.archived ? "archived" : "regular",
  remoteId: c.id,
  title: c.title ?? undefined,
  lastMessageAt: new Date(c.updatedAt),
});

/** A chat's title: its first question, cut at a word. No model call, so it costs nothing. */
export function titleFrom(messages: readonly ThreadMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = (first?.content ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= TITLE_CHARS) return text || "New chat";
  const cut = text.slice(0, TITLE_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : TITLE_CHARS)}…`;
}

const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    return { threads: (await call<ChatSummary[]>("/api/chats")).map(metadata) };
  },
  async initialize() {
    const created = await call<ChatSummary>("/api/chats", { method: "POST" });
    return { remoteId: created.id };
  },
  async fetch(remoteId) {
    return metadata(await call<ChatSummary>(`/api/chats/${remoteId}`));
  },
  async rename(remoteId, title) {
    await call(`/api/chats/${remoteId}`, { method: "PATCH", body: JSON.stringify({ title }) });
  },
  async archive(remoteId) {
    await call(`/api/chats/${remoteId}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  },
  async unarchive(remoteId) {
    await call(`/api/chats/${remoteId}`, { method: "PATCH", body: JSON.stringify({ archived: false }) });
  },
  async delete(remoteId) {
    await call(`/api/chats/${remoteId}`, { method: "DELETE" });
  },
  async generateTitle(remoteId, messages) {
    const title = titleFrom(messages);
    await call(`/api/chats/${remoteId}`, { method: "PATCH", body: JSON.stringify({ title }) });
    return createAssistantStream((c) => c.appendText(title));
  },
};

type ThreadListItem = {
  getState(): { remoteId?: string | undefined };
  initialize(): Promise<{ remoteId: string }>;
};

/** The history of the chat the hook is mounted in. The chat's id is read on every call, since a
 *  new chat only gets one when its first message is stored. */
function historyAdapter(item: () => ThreadListItem): ThreadHistoryAdapter {
  const chatId = async (create: boolean) =>
    item().getState().remoteId ?? (create ? (await item().initialize()).remoteId : undefined);
  return {
    // useAISDKRuntime always goes through withFormat; these keep the plain interface complete
    async load() {
      return { messages: [] };
    },
    async append() {},
    withFormat<TMessage, TStorage extends Record<string, unknown>>(
      format: MessageFormatAdapter<TMessage, TStorage>,
    ): GenericThreadHistoryAdapter<TMessage> {
      const put = async (entry: { parentId: string | null; message: TMessage }) => {
        const id = await chatId(true);
        const stored: Omit<StoredMessage, "id"> = {
          parentId: entry.parentId,
          format: format.format,
          content: format.encode(entry),
        };
        await call(`/api/chats/${id}/messages/${encodeURIComponent(format.getId(entry.message))}`, {
          method: "PUT",
          body: JSON.stringify(stored),
        });
      };
      return {
        async load() {
          const id = await chatId(false);
          if (!id) return { messages: [] };
          const stored = await call<StoredMessage[]>(`/api/chats/${id}/messages`);
          const messages = stored
            .filter((m) => m.format === format.format)
            .map((m) => format.decode({ id: m.id, parent_id: m.parentId, format: m.format, content: m.content as TStorage }));
          return { messages };
        },
        append: put,
        update: put,
        async delete(entries) {
          const id = await chatId(false);
          if (!id) return;
          for (const e of entries)
            await call(`/api/chats/${id}/messages/${encodeURIComponent(format.getId(e.message))}`, { method: "DELETE" });
        },
      };
    },
  };
}

/** The hook assistant-ui mounts once per chat: the AI SDK's useChat for that thread, with its
 *  history. Made outside any component, as assistant-ui calls it inside each thread. */
function chatHook(transport: Transport, adapters: Record<string, unknown>) {
  // biome-ignore lint/correctness/noComponentHookFactories: assistant-ui takes the per-thread hook as an option; it is made once (useState below), so its identity never changes
  return function useStoredChat() {
    const id = useAuiState((s) => s.threadListItem.id);
    const aui = useAui();
    const history = useMemo(() => historyAdapter(() => aui.threadListItem() as unknown as ThreadListItem), [aui]);
    const chat = useChat({ id, transport });
    return useAISDKRuntime(chat, { adapters: { ...adapters, history } });
  };
}

export function useStoredChatRuntime(transport: Transport, adapters: Record<string, unknown>) {
  const [adapter] = useState(() => threadListAdapter);
  const [runtimeHook] = useState(() => chatHook(transport, adapters));
  return useRemoteThreadListRuntime({ runtimeHook, adapter, allowNesting: true });
}
