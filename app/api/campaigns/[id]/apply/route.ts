import { z } from "zod";
import { readLock } from "@/lib/campaign/lock";
import {
  addSeat,
  changeDeck,
  DIFFICULTIES,
  lockDeck,
  MAX_DIRECTION,
  proposalChange,
  record,
  revert,
  setDirection,
  updateSettings,
} from "@/lib/campaign/store";
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
    z.object({ kind: z.literal("direction"), seatId: z.string(), direction: z.string().max(MAX_DIRECTION) }),
    z.object({ kind: z.literal("seat"), name: z.string().max(60), userId: z.string().optional() }),
    z.object({ kind: z.literal("lock"), seatId: z.string(), deck: z.string().max(200), target: z.string().max(200).optional() }),
    z.object({ kind: z.literal("undo"), changeId: z.string() }),
    z.object({
      kind: z.literal("settings"),
      settings: z.object({
        name: z.string().max(80).optional(),
        difficulty: z.enum(DIFFICULTIES).optional(),
        taboo: z.boolean().optional(),
        nextScenario: z.number().int().min(0).optional(),
      }),
    }),
  ]),
});

async function apply(userId: string, id: string, version: number, proposalId: string, change: z.infer<typeof Apply>["change"]) {
  switch (change.kind) {
    case "scenario":
      return record(userId, id, version, { ...change.record, proposalId });
    case "deck":
      return changeDeck(userId, id, version, { ...change.swap, proposalId });
    case "direction":
      return setDirection(userId, id, version, { ...change, proposalId });
    case "seat":
      return addSeat(userId, id, version, { name: change.name, userId: change.userId, proposalId });
    case "lock": {
      const lock = await readLock(change.deck, change.target);
      return lock.ok ? lockDeck(userId, id, version, { seatId: change.seatId, ...lock.value, proposalId }) : lock;
    }
    case "undo":
      return revert(userId, id, version, change.changeId, proposalId);
    case "settings":
      return updateSettings(userId, id, version, change.settings, proposalId);
  }
}

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
  const done = await apply(user.id, id, version, proposalId, change);
  return done.ok ? Response.json({ ok: true }) : Response.json({ ok: false, error: done.error }, { status: 409 });
}
