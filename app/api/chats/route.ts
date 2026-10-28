import { createChat, listChats } from "@/lib/chats";
import { currentUser, SIGNED_OUT } from "@/lib/session";

const NOT_IN = () => new Response("You aren't in that campaign.", { status: 404 });

/** GET /api/chats[?campaign=<id>]: the account's personal chats, or a campaign's, most recently
 *  used first. */
export async function GET(req: Request) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const chats = await listChats(user.id, new URL(req.url).searchParams.get("campaign") ?? undefined);
  return chats ? Response.json(chats) : NOT_IN();
}

/** POST /api/chats {campaignId?}: a new, empty chat, personal or in a campaign. */
export async function POST(req: Request) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const body = (await req.json().catch(() => ({}))) as { campaignId?: unknown };
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId : undefined;
  const made = await createChat(user.id, campaignId);
  return made ? Response.json(made, { status: 201 }) : NOT_IN();
}
