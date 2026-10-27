// The database: Better Auth's four tables, as its drizzle adapter expects them, and the app's own.
// A change here needs a migration: npm run db:generate, then commit drizzle/.

import { boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const now = () => new Date();

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().$defaultFn(now),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(now).$onUpdate(now),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(now).$onUpdate(now),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(now).$onUpdate(now),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(now).$onUpdate(now),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Questions each account asked on each day (UTC), for the daily cap. */
export const messageCount = pgTable(
  "message_count",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const authSchema = { user, session, account, verification };

/** A conversation. Personal for now: campaigns will share theirs with their members. */
export const chat = pgTable(
  "chat",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().$defaultFn(now),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("chat_user_id_idx").on(t.userId, t.updatedAt)],
);

/** A chat's messages, stored as assistant-ui hands them over: each with its parent, so edits
 *  and regenerations keep their branches, in the format assistant-ui names. */
export const chatMessage = pgTable(
  "chat_message",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    parentId: text("parent_id"),
    format: text("format").notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at").notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.id] })],
);
