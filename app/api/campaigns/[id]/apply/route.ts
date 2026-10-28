import { z } from "zod";
import { changeDeck, proposalChange, record } from "@/lib/campaign/store";
import { currentUser, SIGNED_OUT } from "@/lib/session";

const Counts = z.record(z.string().max(20), z.number().int().min(1).max(10));

// The proposal as the proposeChange card holds it. Applying checks everything again (membership,
// the campaign's version, XP, deck rules), so a card can't apply more than the page could.
const Apply = z.object({
  proposalId: z.string().max(100),
  version: z.number().int().min(0),
  change: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("scenario"),
      record: z.object({
        entries: z
          .array(z.object({ seatId: z.string(), kind: z.enum(["xp", "physical", "mental"]), amount: z.number().int() }))
          .max(40),
        statuses: z
          .array(z.object({ seatId: z.string(), status: z.enum(["active", "killed", "insane"]) }))
          .max(8)
          .optional(),
        nextScenario: z.number().int().min(0).optional(),
      }),
    }),
    z.object({
      kind: z.literal("deck"),
      swap: z.object({
        seatId: z.string(),
        add: Counts,
        remove: Counts,
        campaignAdd: Counts.optional(),
        campaignRemove: Counts.optional(),
      }),
    }),
  ]),
});

/** POST /api/campaigns/<id>/apply {proposalId, version, change}: apply a chat's proposal. */
export async function POST(req: Request, ctx: RouteContext<"/api/campaigns/[id]/apply">) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const { id } = await ctx.params;
  const parsed = Apply.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request: not a proposal.", { status: 400 });
  const { proposalId, version, change } = parsed.data;
  // a card pressed twice, or in two tabs, applies once
  if (await proposalChange(user.id, id, proposalId)) return Response.json({ ok: true, already: true });
  const done =
    change.kind === "scenario"
      ? await record(user.id, id, version, { ...change.record, proposalId })
      : await changeDeck(user.id, id, version, { ...change.swap, proposalId });
  return done.ok ? Response.json({ ok: true }) : Response.json({ ok: false, error: done.error }, { status: 409 });
}
