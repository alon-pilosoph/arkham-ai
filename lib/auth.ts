// Accounts and sessions, with Better Auth: sign in with Google or with a one-time email link.
// Invite-only: Better Auth asks validateUserInfo before it creates any account, by any method,
// and mayJoin decides. A sign-in link is never emailed to an address that could not sign in.

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { hasAccount, mayJoin } from "./access";
import { type Db, getDb } from "./db";
import { authSchema } from "./db/schema";
import { sendEmail, signInEmail } from "./email";
import { SIGN_IN_LINK_MINUTES } from "./sign-in";

export const INVITE_ONLY = "invite_only";

/** Production uses its own domain; a preview, its branch URL; local runs, the request's. */
function baseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  const host =
    process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_BRANCH_URL;
  return host ? `https://${host}` : undefined;
}

function createAuth(db: Db) {
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
      : undefined;
  return betterAuth({
    baseURL: baseURL(),
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    socialProviders: google,
    session: { expiresIn: 60 * 24 * 3600, updateAge: 24 * 3600 },
    user: {
      validateUserInfo: async ({ user, source }) => {
        if (source.action !== "create-user") return;
        if (typeof user.email === "string" && (await mayJoin(user.email))) return;
        return { error: INVITE_ONLY, errorDescription: "This app is invite-only: ask someone you play with for an invite." };
      },
    },
    onAPIError: { errorURL: "/sign-in" },
    plugins: [
      magicLink({
        expiresIn: SIGN_IN_LINK_MINUTES * 60,
        sendMagicLink: async ({ email, url }) => {
          // a stranger's address gets nothing, and the page says the same either way
          if ((await hasAccount(email)) || (await mayJoin(email))) await sendEmail(signInEmail(email, url));
        },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Promise<Auth> | null = null;

export function getAuth(): Promise<Auth> {
  auth ??= getDb().then(createAuth);
  return auth;
}

/** Forget the cached instance, with the database: for tests. */
export function resetAuth(): void {
  auth = null;
}
