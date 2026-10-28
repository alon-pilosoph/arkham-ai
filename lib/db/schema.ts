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

// Campaigns: only what deckbuilding needs (docs/plans/campaigns.md). The players keep their
// campaign log elsewhere.

/** A Chapter 1 campaign (lib/campaigns.ts code) as one group plays it. `version` goes up with
 *  every change, so a change made from a stale page is refused instead of overwriting another. */
export const campaign = pgTable("campaign", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  difficulty: text("difficulty").notNull().default("standard"),
  taboo: boolean("taboo").notNull().default(false),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  nextScenario: integer("next_scenario").notNull().default(0),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at").notNull().$defaultFn(now),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(now),
});

export const campaignMember = pgTable(
  "campaign_member",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at").notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] }), index("campaign_member_user_idx").on(t.userId)],
);

/** An invite link's secret. Replacing the link revokes the old one. */
export const campaignInvite = pgTable("campaign_invite", {
  token: text("token").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().$defaultFn(now),
  revokedAt: timestamp("revoked_at"),
});

/** An address that asked for a sign-in link while holding an invite, so the link can create its
 *  account even when opened in another browser. */
export const invitedEmail = pgTable(
  "invited_email",
  {
    email: text("email").notNull(),
    token: text("token")
      .notNull()
      .references(() => campaignInvite.token, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.email, t.token] })],
);

/** A player's place in a campaign: an investigator and their deck. Not an account: one account
 *  can play two seats, and a seat needs no account at all. */
export const seat = pgTable(
  "seat",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    investigatorCode: text("investigator_code"),
    status: text("status").notNull().default("active"),
    /** The deck now: the newest version, unless a revert went back to an earlier one. */
    deckId: text("deck_id"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("seat_campaign_idx").on(t.campaignId)],
);

/** One version of a seat's deck. Versions are never changed or deleted: a change makes a new one. */
export const deckVersion = pgTable(
  "deck_version",
  {
    id: text("id").primaryKey(),
    seatId: text("seat_id")
      .notNull()
      .references(() => seat.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    /** The list as ArkhamDB shapes it: investigator_code, slots, sideSlots, ignoreDeckLimitSlots,
     *  meta, taboo_id. */
    list: jsonb("list").notNull(),
    /** Cards the campaign added (story assets, weaknesses): in the deck, bought with no XP. */
    campaignCards: jsonb("campaign_cards").notNull().default({}),
    source: text("source"),
    changeId: text("change_id"),
    createdAt: timestamp("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("deck_version_seat_idx").on(t.seatId)],
);

/** The XP and trauma ledgers: XP earned is positive and spent negative; trauma is physical or
 *  mental. Totals are sums, and every entry names the change that made it. */
export const seatEntry = pgTable(
  "seat_entry",
  {
    id: text("id").primaryKey(),
    seatId: text("seat_id")
      .notNull()
      .references(() => seat.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    amount: integer("amount").notNull(),
    note: text("note"),
    changeId: text("change_id").notNull(),
    createdAt: timestamp("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("seat_entry_seat_idx").on(t.seatId)],
);

/** Every applied change, with what it did, so the history can show it and a revert can undo it. */
export const campaignChange = pgTable(
  "campaign_change",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    payload: jsonb("payload").notNull(),
    revertOf: text("revert_of"),
    revertedBy: text("reverted_by"),
    chatId: text("chat_id"),
    createdAt: timestamp("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("campaign_change_campaign_idx").on(t.campaignId, t.createdAt)],
);
