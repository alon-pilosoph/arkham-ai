import { listMessages } from "@/lib/chats";
import { currentUser, SIGNED_OUT } from "@/lib/session";

/** GET /api/chats/<id>/messages: every stored message, oldest first, with its parent. */
export async function GET(req: Request, ctx: RouteContext<"/api/chats/[id]/messages">) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const messages = await listMessages(user.id, (await ctx.params).id);
  return messages ? Response.json(messages) : new Response("No such chat.", { status: 404 });
}
