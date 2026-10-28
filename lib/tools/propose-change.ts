import { tool } from "ai";
import { z } from "zod";
import { type DeckSwap, priceSwap, type RecordInput, type SeatView, STATUSES } from "../campaign/store";
import { getCards } from "../cards";
import { type Failure, failureText, notFound, safely, toolError, toolText } from "../format";
import { type CampaignContext, ToolContextSchema } from "../tool-context";

/** A change ready for a player to apply: checked and priced against the campaign as it was when
 *  proposed. Nothing is written until a player applies it, which checks it all again. */
export type Proposal = {
  ok: true;
  proposalId: string;
  campaignId: string;
  version: number;
  summary: string[];
  change: { kind: "scenario"; record: RecordInput } | { kind: "deck"; swap: DeckSwap; cost: number };
};

export type ProposeResult = Proposal | Failure;

const Cards = z
  .array(z.object({ code: z.string().describe("A card code a tool returned"), qty: z.number().int().min(1).max(3) }))
  .max(20);

const inputSchema = z.object({
  kind: z
    .enum(["scenario", "deck"])
    .describe('"scenario": what a scenario (or a correction) did to the seats; "deck": cards in or out of one seat\'s deck'),
  seats: z
    .array(
      z.object({
        seat: z.string().describe("The seat's name, as the campaign note gives it"),
        xpEarned: z.number().int().min(0).max(50).optional(),
        xpSpent: z.number().int().min(0).max(50).optional().describe("XP spent outside a deck change, for a correction"),
        physicalTrauma: z.number().int().min(-5).max(5).optional().describe("Trauma gained, or negative when healed"),
        mentalTrauma: z.number().int().min(-5).max(5).optional(),
        status: z.enum(STATUSES).optional().describe("killed or insane when the investigator was; active to bring a seat back"),
      }),
    )
    .max(8)
    .optional()
    .describe('For "scenario"'),
  nextScenario: z.string().optional().describe('For "scenario": the next scenario\'s name, or "finished"'),
  seat: z.string().optional().describe('For "deck": the seat\'s name'),
  add: Cards.optional().describe('For "deck": cards bought or upgraded into, paid for with XP'),
  remove: Cards.optional().describe('For "deck": cards taken out, including the lower level of an upgrade'),
  campaignAdd: Cards.optional().describe('For "deck": cards the campaign put in (story assets, weaknesses), free'),
  campaignRemove: Cards.optional().describe('For "deck": cards the campaign took out'),
});

export type ProposeInput = z.infer<typeof inputSchema>;

const byCode = (cards: { code: string; qty: number }[] = []) =>
  cards.reduce<Record<string, number>>((m, c) => {
    m[c.code] = (m[c.code] ?? 0) + c.qty;
    return m;
  }, {});

function findSeat(c: CampaignContext, name: string): SeatView | undefined {
  return c.seats.find((s) => s.id === name || s.name.toLowerCase() === name.trim().toLowerCase());
}

export async function propose(input: ProposeInput, campaign: CampaignContext | null | undefined): Promise<ProposeResult> {
  if (!campaign)
    return toolError(
      "This chat isn't in a campaign, so there is nothing to change. Campaign chats are opened from the campaign switcher.",
    );
  const store = await getCards();
  const base = { ok: true as const, proposalId: crypto.randomUUID(), campaignId: campaign.id, version: campaign.version };
  if (input.kind === "deck") {
    const s = input.seat ? findSeat(campaign, input.seat) : undefined;
    if (!s) return notFound(`No seat named "${input.seat ?? ""}". The seats: ${campaign.seats.map((x) => x.name).join(", ")}.`);
    const swap: DeckSwap = {
      seatId: s.id,
      add: byCode(input.add),
      remove: byCode(input.remove),
      campaignAdd: byCode(input.campaignAdd),
      campaignRemove: byCode(input.campaignRemove),
    };
    const priced = await priceSwap(campaign, swap);
    if (!priced.ok) return toolError(priced.error);
    const name = (code: string) => store.get(code)?.name ?? code;
    const level = (code: string) => {
      const xp = store.get(code)?.xp;
      return xp ? ` (${xp})` : "";
    };
    const lines = [
      ...priced.value.lines.map(
        (l) =>
          `${l.qty}× ${name(l.code)}${level(l.code)}${l.upgradedFrom ? `, upgraded from ${name(l.upgradedFrom)}${level(l.upgradedFrom)}` : ""}: ${l.xp} XP`,
      ),
      ...Object.entries(swap.remove)
        .filter(([code]) => !priced.value.lines.some((l) => l.upgradedFrom === code))
        .map(([code, qty]) => `${qty}× ${name(code)}${level(code)} out`),
      ...Object.entries(swap.campaignAdd ?? {}).map(([code, qty]) => `${qty}× ${name(code)} added by the campaign`),
      ...Object.entries(swap.campaignRemove ?? {}).map(([code, qty]) => `${qty}× ${name(code)} removed by the campaign`),
    ];
    return {
      ...base,
      summary: [`${s.name}: ${priced.value.cost} XP of ${s.xp.unspent} unspent`, ...lines],
      change: { kind: "deck", swap, cost: priced.value.cost },
    };
  }
  const record: RecordInput = { entries: [], statuses: [] };
  const summary: string[] = [];
  for (const row of input.seats ?? []) {
    const s = findSeat(campaign, row.seat);
    if (!s) return notFound(`No seat named "${row.seat}". The seats: ${campaign.seats.map((x) => x.name).join(", ")}.`);
    const parts: string[] = [];
    const add = (kind: "xp" | "physical" | "mental", amount: number | undefined, words: string) => {
      if (!amount) return;
      record.entries.push({ seatId: s.id, kind, amount });
      parts.push(words);
    };
    add("xp", row.xpEarned, `+${row.xpEarned} XP`);
    add("xp", row.xpSpent ? -row.xpSpent : undefined, `${row.xpSpent} XP spent`);
    add("physical", row.physicalTrauma, `${(row.physicalTrauma ?? 0) > 0 ? "+" : ""}${row.physicalTrauma} physical trauma`);
    add("mental", row.mentalTrauma, `${(row.mentalTrauma ?? 0) > 0 ? "+" : ""}${row.mentalTrauma} mental trauma`);
    if (row.status && row.status !== s.status) {
      record.statuses?.push({ seatId: s.id, status: row.status });
      parts.push(row.status === "active" ? "back in play" : row.status);
    }
    const xpAfter = s.xp.unspent + (row.xpEarned ?? 0) - (row.xpSpent ?? 0);
    if (xpAfter < 0) return toolError(`${s.name} has ${s.xp.unspent} unspent XP, not enough to spend ${row.xpSpent}.`);
    if (parts.length) summary.push(`${s.name}: ${parts.join(", ")}`);
  }
  if (input.nextScenario) {
    const wanted = input.nextScenario.trim().toLowerCase();
    const i = wanted === "finished" ? campaign.scenarios.length : campaign.scenarios.findIndex((x) => x.toLowerCase() === wanted);
    if (i < 0)
      return notFound(
        `No scenario "${input.nextScenario}" in ${campaign.campaignName}. Its scenarios: ${campaign.scenarios.join(", ")}.`,
      );
    if (i !== campaign.nextScenario) {
      record.nextScenario = i;
      summary.push(`Next scenario: ${campaign.scenarios[i] ?? "the campaign is finished"}`);
    }
  }
  if (!summary.length) return toolError("That changes nothing: name what each seat earned, lost or spent, or the next scenario.");
  return { ...base, summary, change: { kind: "scenario", record } };
}

export function proposeText(r: ProposeResult): string {
  if (!r.ok) return failureText(r);
  return [
    "PROPOSED, NOT APPLIED. The players see this as a card with Apply and Discard; nothing changes until one of them applies it:",
    ...r.summary.map((l) => `- ${l}`),
  ].join("\n");
}

export const proposeChangeTool = tool({
  description:
    "In a campaign's chat, propose a change to the campaign for the players to apply: what a scenario did (XP earned, " +
    "trauma, an investigator killed or driven insane, the next scenario), or cards in and out of one seat's deck, priced " +
    "in XP by the Rules Reference and checked against the deck's rules and the seat's unspent XP. Writes nothing: the " +
    "players apply it from a card. Use it once the players have said what happened or agreed on a swap, with card codes " +
    "from a tool, never from memory.",
  inputSchema,
  contextSchema: ToolContextSchema,
  execute: (input, { context }): Promise<ProposeResult> => safely(() => propose(input, context?.campaign)),
  toModelOutput: ({ output }) => toolText(proposeText(output)),
});
