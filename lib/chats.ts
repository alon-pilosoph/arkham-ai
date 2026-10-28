// Chats and their messages, always read and written for one account: a personal chat is its
// author's alone, a campaign's chat is every member's, and anything else is simply not found.

import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "./db";
import { campaignMember, chat, chatMessage } from "./db/schema";

export type ChatSummary = {
  id: string;
  title: string | null;
  archived: boolean;
  updatedAt: string;
  campaignId: string | null;
};
export type StoredMessage = { id: string; parentId: string | null; format: string; content: unknown };

/** Long enough for any answer with its tool results; anything bigger is refused, not truncated. */
export const MAX_MESSAGE_BYTES = 512_000;
export const MAX_TITLE = 120;

const summary = (c: typeof chat.$inferSelect): ChatSummary => ({
  id: c.id,
  title: c.title,
  archived: c.archived,
  updatedAt: c.updatedAt.toISOString(),
  campaignId: c.campaignId,
});

async function memberOf(userId: string, campaignId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: campaignMember.campaignId })
    .from(campaignMember)
    .where(and(eq(campaignMember.userId, userId), eq(campaignMember.campaignId, campaignId)))
    .limit(1);
  return rows.length > 0;
}

/** The chats an account may open: its own personal ones and its campaigns'. */
function visibleTo(userId: string) {
  const campaigns = getDb().then((db) =>
    db.select({ id: campaignMember.campaignId }).from(campaignMember).where(eq(campaignMember.userId, userId)),
  );
  return campaigns.then((rows) => {
    const ids = rows.map((r) => r.id);
    const personal = and(eq(chat.userId, userId), isNull(chat.campaignId));
    return ids.length ? or(personal, inArray(chat.campaignId, ids)) : personal;
  });
}

/** Personal chats, or a campaign's when given one the account is in (null when it isn't). */
export async function listChats(userId: string, campaignId?: string): Promise<ChatSummary[] | null> {
  if (campaignId && !(await memberOf(userId, campaignId))) return null;
  const db = await getDb();
  const scope = campaignId ? eq(chat.campaignId, campaignId) : and(eq(chat.userId, userId), isNull(chat.campaignId));
  const rows = await db.select().from(chat).where(scope).orderBy(desc(chat.updatedAt));
  return rows.map(summary);
}

export async function createChat(userId: string, campaignId?: string): Promise<ChatSummary | null> {
  if (campaignId && !(await memberOf(userId, campaignId))) return null;
  const db = await getDb();
  const [row] = await db
    .insert(chat)
    .values({ id: crypto.randomUUID(), userId, campaignId: campaignId ?? null })
    .returning();
  return summary(row);
}

async function owned(userId: string, chatId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(chat)
    .where(and(eq(chat.id, chatId), await visibleTo(userId)))
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
  if (!(await owned(userId, chatId))) return false;
  if (!Object.keys(set).length) return true;
  await db.update(chat).set(set).where(eq(chat.id, chatId));
  return true;
}

export async function deleteChat(userId: string, chatId: string): Promise<boolean> {
  if (!(await owned(userId, chatId))) return false;
  const db = await getDb();
  await db.delete(chat).where(eq(chat.id, chatId));
  return true;
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
