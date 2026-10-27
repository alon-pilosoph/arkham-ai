// Who may have an account. The app is invite-only: the owner of the deployment (OWNER_EMAIL) can
// always sign up; anyone else needs an invite, which campaigns will add.

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { user } from "./db/schema";

export function isOwner(email: string): boolean {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return !!owner && email.trim().toLowerCase() === owner;
}

export async function mayJoin(email: string): Promise<boolean> {
  return isOwner(email);
}

export async function hasAccount(email: string): Promise<boolean> {
  const db = await getDb();
  const found = await db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase())).limit(1);
  return found.length > 0;
}
