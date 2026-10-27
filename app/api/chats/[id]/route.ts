import { z } from "zod";
import { deleteChat, getChat, MAX_TITLE, updateChat } from "@/lib/chats";
import { currentUser, SIGNED_OUT } from "@/lib/session";

const NOT_FOUND = () => new Response("No such chat.", { status: 404 });

export async function GET(req: Request, ctx: RouteContext<"/api/chats/[id]">) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const found = await getChat(user.id, (await ctx.params).id);
  return found ? Response.json(found) : NOT_FOUND();
}

const Changes = z
  .object({
    title: z
      .string()
      .max(MAX_TITLE * 4)
      .optional(),
    archived: z.boolean().optional(),
  })
  .strict();

/** PATCH /api/chats/<id> {title?, archived?}: rename, archive or restore. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/chats/[id]">) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const parsed = Changes.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request: expected {title?, archived?}", { status: 400 });
  return (await updateChat(user.id, (await ctx.params).id, parsed.data)) ? new Response(null, { status: 204 }) : NOT_FOUND();
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/chats/[id]">) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  return (await deleteChat(user.id, (await ctx.params).id)) ? new Response(null, { status: 204 }) : NOT_FOUND();
}
