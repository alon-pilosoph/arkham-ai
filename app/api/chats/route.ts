import { createChat, listChats } from "@/lib/chats";
import { currentUser, SIGNED_OUT } from "@/lib/session";

/** GET /api/chats: the account's chats, most recently used first. */
export async function GET(req: Request) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  return Response.json(await listChats(user.id));
}

/** POST /api/chats: a new, empty chat. */
export async function POST(req: Request) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  return Response.json(await createChat(user.id), { status: 201 });
}
