// Who is asking. Every route that reads or spends anything checks here, close to the data: the
// proxy's redirect only looks for a session cookie and proves nothing.

import { getAuth } from "./auth";

export type SignedIn = { id: string; email: string; name: string };

export async function currentUser(headers: Headers): Promise<SignedIn | null> {
  const session = await (await getAuth()).api.getSession({ headers });
  if (!session) return null;
  const { id, email, name } = session.user;
  return { id, email, name };
}

export const SIGNED_OUT = () => new Response("Sign in first.", { status: 401 });
