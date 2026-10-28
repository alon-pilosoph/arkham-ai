// Invite links. A campaign has at most one live link; replacing it revokes the old one. Opening
// a link leaves its token in a cookie (proxy.ts), which is what lets a new account be created:
// Google sign-in carries the cookie through its callback, and asking for an email link while
// holding it records the address, so the link works in any browser.

import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { campaign, campaignInvite, campaignMember, invitedEmail, user } from "../db/schema";

export { INVITE_COOKIE } from "./invite-cookie";

import { INVITE_COOKIE } from "./invite-cookie";

export type Invite = { token: string; campaignId: string; campaignName: string; invitedBy: string };

export function inviteToken(headers: Headers | undefined): string | null {
  const cookie = headers?.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${INVITE_COOKIE}=([A-Za-z0-9_-]+)`));
  return m?.[1] ?? null;
}

/** A live invite: the link was not replaced and its campaign still exists. */
export async function findInvite(token: string | null): Promise<Invite | null> {
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      token: campaignInvite.token,
      campaignId: campaign.id,
      campaignName: campaign.name,
      invitedBy: sql<string>`coalesce(nullif(${user.name}, ''), ${user.email})`,
    })
    .from(campaignInvite)
    .innerJoin(campaign, eq(campaign.id, campaignInvite.campaignId))
    .innerJoin(user, eq(user.id, campaignInvite.createdBy))
    .where(and(eq(campaignInvite.token, token), isNull(campaignInvite.revokedAt)))
    .limit(1);
  return row ?? null;
}

/** The campaign's link, made on first use. */
export async function currentInvite(campaignId: string, userId: string): Promise<string> {
  const db = await getDb();
  const [live] = await db
    .select({ token: campaignInvite.token })
    .from(campaignInvite)
    .where(and(eq(campaignInvite.campaignId, campaignId), isNull(campaignInvite.revokedAt)))
    .limit(1);
  return live?.token ?? replaceInvite(campaignId, userId);
}

export async function replaceInvite(campaignId: string, userId: string): Promise<string> {
  const db = await getDb();
  const token = randomBytes(24).toString("base64url");
  await db.transaction(async (tx) => {
    await tx
      .update(campaignInvite)
      .set({ revokedAt: new Date() })
      .where(and(eq(campaignInvite.campaignId, campaignId), isNull(campaignInvite.revokedAt)));
    await tx.insert(campaignInvite).values({ token, campaignId, createdBy: userId });
  });
  return token;
}

export async function rememberInvitedEmail(email: string, token: string): Promise<void> {
  const db = await getDb();
  await db.insert(invitedEmail).values({ email: email.trim().toLowerCase(), token }).onConflictDoNothing();
}

/** Whether this address asked for a sign-in link while holding a link that is still live. */
export async function wasInvited(email: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ token: invitedEmail.token })
    .from(invitedEmail)
    .innerJoin(campaignInvite, eq(campaignInvite.token, invitedEmail.token))
    .where(and(eq(invitedEmail.email, email.trim().toLowerCase()), isNull(campaignInvite.revokedAt)))
    .limit(1);
  return rows.length > 0;
}

/** Adds the account to the invite's campaign; a member already is one. */
export async function join(token: string, userId: string): Promise<string | null> {
  const invite = await findInvite(token);
  if (!invite) return null;
  const db = await getDb();
  await db.insert(campaignMember).values({ campaignId: invite.campaignId, userId }).onConflictDoNothing();
  return invite.campaignId;
}
