import { proposalChange } from "@/lib/campaign/store";
import { currentUser, SIGNED_OUT } from "@/lib/session";

/** GET /api/campaigns/<id>/proposals/<proposalId>: whether a chat's proposal was applied. */
export async function GET(req: Request, ctx: RouteContext<"/api/campaigns/[id]/proposals/[proposalId]">) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const { id, proposalId } = await ctx.params;
  return Response.json({ changeId: await proposalChange(user.id, id, proposalId) });
}
