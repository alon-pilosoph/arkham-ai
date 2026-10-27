import { z } from "zod";
import { deleteMessage, MAX_MESSAGE_BYTES, putMessage } from "@/lib/chats";
import { currentUser, SIGNED_OUT } from "@/lib/session";

type Ctx = RouteContext<"/api/chats/[id]/messages/[messageId]">;

const Message = z.object({
  parentId: z.string().max(200).nullable(),
  format: z.string().min(1).max(50),
  content: z.record(z.string(), z.unknown()),
});

/** PUT /api/chats/<id>/messages/<messageId> {parentId, format, content}: store a message, or
 *  replace it. */
export async function PUT(req: Request, ctx: Ctx) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const { id, messageId } = await ctx.params;
  const body = await req.text();
  if (body.length > MAX_MESSAGE_BYTES) return new Response("That message is too large to store.", { status: 413 });
  let json: unknown = null;
  try {
    json = JSON.parse(body);
  } catch {}
  const parsed = Message.safeParse(json);
  if (!parsed.success || messageId.length > 200)
    return new Response("Bad request: expected {parentId, format, content}", { status: 400 });
  const stored = await putMessage(user.id, id, { id: messageId, ...parsed.data });
  return stored ? new Response(null, { status: 204 }) : new Response("No such chat.", { status: 404 });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const { id, messageId } = await ctx.params;
  return (await deleteMessage(user.id, id, messageId))
    ? new Response(null, { status: 204 })
    : new Response("No such chat.", { status: 404 });
}
