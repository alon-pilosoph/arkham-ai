import { tool } from "ai";
import { z } from "zod";
import {
  type DeckSwap,
  DIFFICULTIES,
  type Difficulty,
  MAX_DIRECTION,
  priceSwap,
  type RecordInput,
  type SeatView,
  STATUSES,
} from "../campaign/store";
import { getCards } from "../cards";
import { startingVersions } from "../deck-links";
import { fetchDeck, parseRef } from "../decks";
import { type Failure, failureText, notFound, safely, toolError, toolText, untrusted } from "../format";
import { type CampaignContext, ToolContextSchema } from "../tool-context";

/** A change ready for a player to apply: checked and priced against the campaign as it was when
 *  proposed. Nothing is written until a player applies it, which checks it all again. */
export type Proposal = {
  ok: true;
  proposalId: string;
  campaignId: string;
  version: number;
  summary: string[];
  change:
    | { kind: "scenario"; record: RecordInput }
    | { kind: "deck"; swap: DeckSwap; cost: number }
    | { kind: "direction"; seatId: string; direction: string }
    | { kind: "seat"; name: string; userId?: string }
    | { kind: "lock"; seatId: string; deck: string; target?: string }
    | { kind: "undo"; changeId: string }
    | { kind: "settings"; settings: { name?: string; difficulty?: Difficulty; taboo?: boolean; nextScenario?: number } };
  /** What the card offers to ask next, once the change is applied. */
  followUp?: string;
  /** For the model only: what to settle with the players before they apply it. */
  notes?: string[];
};

export type ProposeResult = Proposal | Failure;

const Cards = z
  .array(z.object({ code: z.string().describe("A card code a tool returned"), qty: z.number().int().min(1).max(3) }))
  .max(20);

const inputSchema = z.object({
  kind: z
    .enum(["scenario", "deck", "direction", "seat", "lock", "undo", "settings"])
    .describe(
      '"scenario": what a scenario (or a correction) did to the seats; "deck": cards in or out of one seat\'s deck; ' +
        '"direction": where the players want one seat\'s deck to go; "seat": a new seat; "lock": lock in a deck for a seat; ' +
        '"undo": take back an earlier change; "settings": the campaign\'s name, difficulty, taboo or next scenario',
    ),
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
  nextScenario: z.string().optional().describe('For "scenario" and "settings": the next scenario\'s name, or "finished"'),
  seat: z.string().optional().describe('For "deck", "direction", "seat" and "lock": the seat\'s name'),
  mine: z.boolean().optional().describe('For "seat": true if it is the seat of the player who is asking'),
  deck: z.string().optional().describe('For "lock": an ArkhamDB deck link'),
  target: z.string().optional().describe('For "lock": an ArkhamDB link to the finished deck this one is building toward'),
  undo: z
    .string()
    .optional()
    .describe('For "undo": words from the change as the newest message lists it; left out, the latest change'),
  name: z.string().min(1).max(80).optional().describe('For "settings": a new name for the campaign'),
  difficulty: z.enum(DIFFICULTIES).optional().describe('For "settings"'),
  taboo: z.boolean().optional().describe('For "settings"'),
  direction: z
    .string()
    .max(MAX_DIRECTION)
    .optional()
    .describe('For "direction": what they said, kept short, such as "a flex mystic, not a battle mage". Empty clears it.'),
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

function scenarioIndex(c: CampaignContext, name: string): number {
  const wanted = name.trim().toLowerCase();
  return wanted === "finished" ? c.scenarios.length : c.scenarios.findIndex((x) => x.toLowerCase() === wanted);
}

const noScenario = (c: CampaignContext, name: string) =>
  notFound(`No scenario "${name}" in ${c.campaignName}. Its scenarios: ${c.scenarios.join(", ")}.`);

export async function propose(input: ProposeInput, campaign: CampaignContext | null | undefined): Promise<ProposeResult> {
  if (!campaign)
    return toolError(
      "This chat isn't in a campaign, so there is nothing to change. Campaign chats are opened from the campaign switcher.",
    );
  const store = await getCards();
  const base = { ok: true as const, proposalId: crypto.randomUUID(), campaignId: campaign.id, version: campaign.version };
  if (input.kind === "seat") {
    const name = input.seat?.trim();
    if (!name) return toolError("Name the seat.");
    if (findSeat(campaign, name)) return toolError(`There is already a seat named ${name}.`);
    return {
      ...base,
      summary: [`Add ${name}'s seat`],
      change: { kind: "seat", name, ...(input.mine ? { userId: campaign.askerId } : {}) },
    };
  }
  if (input.kind === "lock") {
    const s = input.seat ? findSeat(campaign, input.seat) : undefined;
    if (!s) return notFound(`No seat named "${input.seat ?? ""}". The seats: ${campaign.seats.map((x) => x.name).join(", ")}.`);
    const ref = parseRef(input.deck ?? "");
    if (!ref) return toolError(`${input.deck ?? "That"} isn't an ArkhamDB deck link.`);
    const read = await fetchDeck(ref);
    if (!read.ok) return toolError(`Couldn't read that deck: ${read.message}`);
    const { deck } = read.data;
    const versions = input.target ? [] : await startingVersions(deck);
    return {
      ...base,
      summary: [
        `${s.name}: lock in ${deck.name || "an unnamed deck"} (${store.get(deck.investigator_code)?.name ?? "?"})`,
        ...(input.target ? ["Keeping the finished deck as the target"] : []),
      ],
      change: { kind: "lock", seatId: s.id, deck: input.deck as string, ...(input.target ? { target: input.target } : {}) },
      notes: versions.map(
        (v) =>
          `This deck links a version with less XP: ${untrusted("deck name", v.name)}, ${v.xp} XP, ${v.url}. Unless they've settled it, ask which they play from; to start from it, propose again with that as deck and this one as target.`,
      ),
    };
  }
  if (input.kind === "undo") {
    const wanted = input.undo?.trim().toLowerCase();
    const x = campaign.changes.find(
      (c) => c.kind !== "revert" && !c.revertedBy && (!wanted || c.summary.toLowerCase().includes(wanted)),
    );
    if (!x) return notFound(wanted ? `No change matches "${input.undo}".` : "There is no change to undo.");
    return { ...base, summary: [`Undo: ${x.summary}`], change: { kind: "undo", changeId: x.id } };
  }
  if (input.kind === "settings") {
    const settings: Extract<Proposal["change"], { kind: "settings" }>["settings"] = {};
    const summary: string[] = [];
    if (input.name && input.name !== campaign.name) {
      settings.name = input.name;
      summary.push(`Rename the campaign to ${input.name}`);
    }
    if (input.difficulty && input.difficulty !== campaign.difficulty) {
      settings.difficulty = input.difficulty;
      summary.push(`Difficulty: ${input.difficulty}`);
    }
    if (input.taboo !== undefined && input.taboo !== campaign.taboo) {
      settings.taboo = input.taboo;
      summary.push(`Taboo list ${input.taboo ? "on" : "off"}`);
    }
    if (input.nextScenario) {
      const i = scenarioIndex(campaign, input.nextScenario);
      if (i < 0) return noScenario(campaign, input.nextScenario);
      if (i !== campaign.nextScenario) {
        settings.nextScenario = i;
        summary.push(`Next scenario: ${campaign.scenarios[i] ?? "the campaign is finished"}`);
      }
    }
    if (!summary.length) return toolError("Those are the settings already.");
    return { ...base, summary, change: { kind: "settings", settings } };
  }
  if (input.kind === "direction") {
    const s = input.seat ? findSeat(campaign, input.seat) : undefined;
    if (!s) return notFound(`No seat named "${input.seat ?? ""}". The seats: ${campaign.seats.map((x) => x.name).join(", ")}.`);
    const direction = (input.direction ?? "").trim();
    if (direction === (s.direction ?? "")) return toolError(`That is already ${s.name}'s direction.`);
    return {
      ...base,
      summary: [direction ? `${s.name}'s deck: ${direction}` : `${s.name}'s deck: clear the direction`],
      change: { kind: "direction", seatId: s.id, direction },
    };
  }
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
    const i = scenarioIndex(campaign, input.nextScenario);
    if (i < 0) return noScenario(campaign, input.nextScenario);
    if (i !== campaign.nextScenario) {
      record.nextScenario = i;
      summary.push(`Next scenario: ${campaign.scenarios[i] ?? "the campaign is finished"}`);
    }
  }
  if (!summary.length) return toolError("That changes nothing: name what each seat earned, lost or spent, or the next scenario.");
  const earners = (input.seats ?? []).filter((row) => row.xpEarned).map((row) => findSeat(campaign, row.seat)?.name);
  const followUp = earners.length ? `Let's look at upgrades for ${earners.join(" and ")}.` : undefined;
  return { ...base, summary, change: { kind: "scenario", record }, ...(followUp ? { followUp } : {}) };
}

export function proposeText(r: ProposeResult): string {
  if (!r.ok) return failureText(r);
  return [
    "PROPOSED, NOT APPLIED. The players see this as a card with Apply and Discard; nothing changes until one of them applies it:",
    ...r.summary.map((l) => `- ${l}`),
    ...(r.notes ?? []).map((n) => `NOTE: ${n}`),
  ].join("\n");
}

export const proposeChangeTool = tool({
  description:
    "In a campaign's chat, propose a change to the campaign for the players to apply: what a scenario did (XP earned, " +
    "trauma, an investigator killed or driven insane, the next scenario), cards in and out of one seat's deck, priced " +
    "in XP by the Rules Reference and checked against the deck's rules and the seat's unspent XP, or where the players " +
    "want a seat's deck to go, which every later chat then sees. Also a new seat, a deck locked in for a seat, an undo of " +
    "an earlier change, and the campaign's settings. Writes nothing: the " +
    "players apply it from a card. Use it once the players have said what happened or agreed on a swap, with card codes " +
    "from a tool, never from memory.",
  inputSchema,
  contextSchema: ToolContextSchema,
  execute: (input, { context }): Promise<ProposeResult> => safely(() => propose(input, context?.campaign)),
  toModelOutput: ({ output }) => toolText(proposeText(output)),
});
