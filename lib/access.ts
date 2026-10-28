// Who may have an account. The app is invite-only: the owner of the deployment (OWNER_EMAIL) can
// always sign up; anyone else needs a live invite link (lib/campaign/invites.ts), either in the
// request's cookie or recorded for their address when they asked for a sign-in link.

import { eq } from "drizzle-orm";
import { findInvite, inviteToken, wasInvited } from "./campaign/invites";
import { getDb } from "./db";
import { user } from "./db/schema";

export function isOwner(email: string): boolean {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return !!owner && email.trim().toLowerCase() === owner;
}

export async function mayJoin(email: string, headers?: Headers): Promise<boolean> {
  if (isOwner(email)) return true;
  if (await findInvite(inviteToken(headers))) return true;
  return wasInvited(email);
}

export async function hasAccount(email: string): Promise<boolean> {
  const db = await getDb();
  const found = await db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase())).limit(1);
  return found.length > 0;
}
