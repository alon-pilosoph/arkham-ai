// Chats and their messages, always read and written for one account: every query is scoped by
// the asking user's id, so a chat that isn't theirs is simply not found.

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { chat, chatMessage } from "./db/schema";

export type ChatSummary = { id: string; title: string | null; archived: boolean; updatedAt: string };
export type StoredMessage = { id: string; parentId: string | null; format: string; content: unknown };

/** Long enough for any answer with its tool results; anything bigger is refused, not truncated. */
export const MAX_MESSAGE_BYTES = 512_000;
export const MAX_TITLE = 120;

const summary = (c: typeof chat.$inferSelect): ChatSummary => ({
  id: c.id,
  title: c.title,
  archived: c.archived,
  updatedAt: c.updatedAt.toISOString(),
});

export async function listChats(userId: string): Promise<ChatSummary[]> {
  const db = await getDb();
  const rows = await db.select().from(chat).where(eq(chat.userId, userId)).orderBy(desc(chat.updatedAt));
  return rows.map(summary);
}

export async function createChat(userId: string): Promise<ChatSummary> {
  const db = await getDb();
  const [row] = await db.insert(chat).values({ id: crypto.randomUUID(), userId }).returning();
  return summary(row);
}

async function owned(userId: string, chatId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getChat(userId: string, chatId: string): Promise<ChatSummary | null> {
  const row = await owned(userId, chatId);
  return row ? summary(row) : null;
}

export async function updateChat(
  userId: string,
  chatId: string,
  changes: { title?: string; archived?: boolean },
): Promise<boolean> {
  const db = await getDb();
  const set = {
    ...(changes.title !== undefined ? { title: changes.title.trim().slice(0, MAX_TITLE) } : {}),
    ...(changes.archived !== undefined ? { archived: changes.archived } : {}),
  };
  if (!Object.keys(set).length) return !!(await owned(userId, chatId));
  const done = await db
    .update(chat)
    .set(set)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning({ id: chat.id });
  return done.length > 0;
}

export async function deleteChat(userId: string, chatId: string): Promise<boolean> {
  const db = await getDb();
  const done = await db
    .delete(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning({ id: chat.id });
  return done.length > 0;
}

export async function listMessages(userId: string, chatId: string): Promise<StoredMessage[] | null> {
  if (!(await owned(userId, chatId))) return null;
  const db = await getDb();
  const rows = await db.select().from(chatMessage).where(eq(chatMessage.chatId, chatId)).orderBy(asc(chatMessage.createdAt));
  return rows.map((m) => ({ id: m.id, parentId: m.parentId, format: m.format, content: m.content }));
}

/** Writes a message, or rewrites it if the id is already stored (an answer finished after it
 *  paused), and marks the chat as just used. */
export async function putMessage(userId: string, chatId: string, message: StoredMessage): Promise<boolean> {
  if (!(await owned(userId, chatId))) return false;
  const db = await getDb();
  await db
    .insert(chatMessage)
    .values({ chatId, ...message })
    .onConflictDoUpdate({
      target: [chatMessage.chatId, chatMessage.id],
      set: { parentId: message.parentId, format: message.format, content: message.content },
    });
  await db.update(chat).set({ updatedAt: new Date() }).where(eq(chat.id, chatId));
  return true;
}

export async function deleteMessage(userId: string, chatId: string, messageId: string): Promise<boolean> {
  if (!(await owned(userId, chatId))) return false;
  const db = await getDb();
  await db.delete(chatMessage).where(and(eq(chatMessage.chatId, chatId), eq(chatMessage.id, messageId)));
  return true;
}
