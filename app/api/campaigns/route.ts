import { campaignFromProposal, StartSchema, startCampaign } from "@/lib/campaign/start";
import { currentUser, SIGNED_OUT } from "@/lib/session";

/** GET /api/campaigns?proposal=<id>: the campaign a chat's card already created, if any. */
export async function GET(req: Request) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const proposal = new URL(req.url).searchParams.get("proposal") ?? "";
  return Response.json({ campaignId: await campaignFromProposal(user.id, proposal) });
}

/** POST /api/campaigns {proposal as the card holds it}: start a campaign from a chat's card. */
export async function POST(req: Request) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const parsed = StartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request: not a proposal.", { status: 400 });
  const done = await startCampaign(user.id, parsed.data);
  return done.ok
    ? Response.json({ ok: true, campaignId: done.value })
    : Response.json({ ok: false, error: done.error }, { status: 409 });
}
