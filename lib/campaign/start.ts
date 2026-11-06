// Starting a campaign from a chat's card, from its first scenario or from the middle of one. Decks
// are read again here rather than taken from the card, and all of them before anything is
// created, so a deck that can't be read leaves nothing behind. What the campaign starts with goes
// in as ordinary changes, so it shows in the history and can be reverted.

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { campaign, campaignMember } from "../db/schema";
import { readLock } from "./lock";
import {
  addSeat,
  createCampaign,
  DIFFICULTIES,
  type LEDGERS,
  lockDeck,
  MAX_DIRECTION,
  type RecordInput,
  type Result,
  record,
  STATUSES,
  setDirection,
} from "./store";

const Amount = z.number().int().min(0).max(100);

export const StartSchema = z.object({
  proposalId: z.string().max(100),
  name: z.string().min(1).max(80),
  code: z.string().max(20),
  difficulty: z.enum(DIFFICULTIES),
  taboo: z.boolean(),
  nextScenario: z.number().int().min(0).optional(),
  seats: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        mine: z.boolean().optional(),
        deck: z.string().max(200).optional(),
        target: z.string().max(200).optional(),
        unspentXp: Amount.optional(),
        physicalTrauma: Amount.optional(),
        mentalTrauma: Amount.optional(),
        status: z.enum(STATUSES).optional(),
        direction: z.string().max(MAX_DIRECTION).optional(),
      }),
    )
    .max(8),
});

export type StartInput = z.infer<typeof StartSchema>;

/** The campaign a card already created, for this account. */
export async function campaignFromProposal(userId: string, proposalId: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ id: campaign.id })
    .from(campaign)
    .innerJoin(campaignMember, eq(campaignMember.campaignId, campaign.id))
    .where(and(eq(campaign.proposalId, proposalId), eq(campaignMember.userId, userId)))
    .limit(1);
  return row?.id ?? null;
}

export async function startCampaign(userId: string, input: StartInput): Promise<Result<string>> {
  // a card pressed twice, or in two tabs, creates one campaign
  const existing = await campaignFromProposal(userId, input.proposalId);
  if (existing) return { ok: true, value: existing };

  const seats = [];
  for (const s of input.seats) {
    const lock = s.deck ? await readLock(s.deck, s.target) : null;
    if (lock && !lock.ok) return { ok: false, error: `${s.name}: ${lock.error}` };
    seats.push({ ...s, lock: lock?.value });
  }

  const made = await createCampaign(userId, input);
  if (!made.ok) return made;
  const id = made.value;
  let version = 0;
  const step = async <T>(done: Result<T>): Promise<T> => {
    if (!done.ok) throw new Error(done.error);
    version++;
    return done.value;
  };

  const opening: RecordInput = { entries: [], statuses: [], nextScenario: input.nextScenario };
  for (const s of seats) {
    const seatId = (await step(await addSeat(userId, id, version, { name: s.name, userId: s.mine ? userId : null }))) as string;
    if (s.lock) await step(await lockDeck(userId, id, version, { seatId, ...s.lock }));
    if (s.direction) await step(await setDirection(userId, id, version, { seatId, direction: s.direction }));
    const amounts: [(typeof LEDGERS)[number], number | undefined][] = [
      ["xp", s.unspentXp],
      ["physical", s.physicalTrauma],
      ["mental", s.mentalTrauma],
    ];
    for (const [kind, amount] of amounts) if (amount) opening.entries.push({ seatId, kind, amount, note: "opening" });
    if (s.status && s.status !== "active") opening.statuses?.push({ seatId, status: s.status });
  }
  if (opening.entries.length || opening.statuses?.length || opening.nextScenario)
    await step(await record(userId, id, version, opening));
  return { ok: true, value: id };
}
