// A daily cap on questions per account, so no single account (or a stolen session) can run up
// the model bill. Counted per UTC day; DAILY_QUESTIONS overrides the default.

import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { messageCount } from "./db/schema";

export const DEFAULT_DAILY_QUESTIONS = 150;

export function dailyQuestions(): number {
  const n = Number(process.env.DAILY_QUESTIONS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_QUESTIONS;
}

/** Counts one question; false when the account had already asked its day's worth. */
export async function takeQuestion(userId: string, now = new Date()): Promise<boolean> {
  const db = await getDb();
  const day = now.toISOString().slice(0, 10);
  const [row] = await db
    .insert(messageCount)
    .values({ userId, day, count: 1 })
    .onConflictDoUpdate({ target: [messageCount.userId, messageCount.day], set: { count: sql`${messageCount.count} + 1` } })
    .returning({ count: messageCount.count });
  return (row?.count ?? 1) <= dailyQuestions();
}
