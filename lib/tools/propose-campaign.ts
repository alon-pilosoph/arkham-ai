import { tool } from "ai";
import { z } from "zod";
import type { StartInput } from "../campaign/start";
import { DIFFICULTIES, MAX_DIRECTION, STATUSES, scenarioNames } from "../campaign/store";
import { CAMPAIGNS } from "../campaigns";
import { getCards } from "../cards";
import { startingVersions } from "../deck-links";
import { fetchDeck, parseRef } from "../decks";
import { type Failure, failureText, notFound, safely, toolError, toolText, untrusted } from "../format";
import { ToolContextSchema } from "../tool-context";

/** A campaign ready to create from a card. Nothing exists until a player presses the button. */
export type CampaignProposal = {
  ok: true;
  start: StartInput;
  summary: string[];
  /** For the model only: what to settle with the players before they create it. */
  notes: string[];
  /** Asked in the campaign's first chat, for a campaign joined partway through. */
  ask?: string;
};

export type ProposeCampaignResult = CampaignProposal | Failure;

const inputSchema = z.object({
  name: z.string().min(1).max(80).describe("What the players call this campaign; the campaign's own name if they gave none"),
  campaign: z.string().describe("Which Chapter 1 campaign, by its name"),
  difficulty: z.enum(DIFFICULTIES),
  taboo: z.boolean().describe("Whether they play with the taboo list"),
  nextScenario: z
    .string()
    .optional()
    .describe("Only for a campaign already under way: the name of the scenario they are about to play"),
  seats: z
    .array(
      z.object({
        name: z.string().min(1).max(60).describe("The player's or investigator's name"),
        mine: z.boolean().optional().describe("True for the seat of the player who is asking"),
        deck: z.string().optional().describe("An ArkhamDB deck link: the deck as it stands now"),
        target: z.string().optional().describe("An ArkhamDB link to the finished deck this one is building toward"),
        unspentXp: z.number().int().min(0).max(100).optional().describe("Already under way: the seat's unspent XP"),
        physicalTrauma: z.number().int().min(0).max(100).optional(),
        mentalTrauma: z.number().int().min(0).max(100).optional(),
        status: z.enum(STATUSES).optional(),
        direction: z.string().max(MAX_DIRECTION).optional().describe("Where the players want this deck to go, if they said"),
      }),
    )
    .max(8),
});

export type ProposeCampaignInput = z.infer<typeof inputSchema>;

export async function proposeCampaign(input: ProposeCampaignInput): Promise<ProposeCampaignResult> {
  const wanted = input.campaign.trim().toLowerCase();
  const def = CAMPAIGNS.find((c) => c.name.toLowerCase() === wanted || c.code === wanted);
  if (!def) return notFound(`No Chapter 1 campaign "${input.campaign}". They are: ${CAMPAIGNS.map((c) => c.name).join(", ")}.`);
  const scenarios = await scenarioNames(def.code);
  let next: number | undefined;
  if (input.nextScenario) {
    const scenario = input.nextScenario.trim().toLowerCase();
    next = scenarios.findIndex((s) => s.toLowerCase() === scenario);
    if (next < 0) return notFound(`No scenario "${input.nextScenario}" in ${def.name}. Its scenarios: ${scenarios.join(", ")}.`);
  }

  const store = await getCards();
  const seatLines: string[] = [];
  const notes: string[] = [];
  for (const s of input.seats) {
    const parts: string[] = [];
    if (s.deck) {
      const ref = parseRef(s.deck);
      if (!ref) return toolError(`${s.deck} isn't an ArkhamDB deck link.`);
      const read = await fetchDeck(ref);
      if (!read.ok) return toolError(`Couldn't read ${s.name}'s deck: ${read.message}`);
      const { deck } = read.data;
      parts.push(`${store.get(deck.investigator_code)?.name ?? "?"}, ${deck.name || "Unnamed deck"}`);
      if (!s.target)
        for (const v of await startingVersions(deck))
          notes.push(
            `${s.name}'s deck links a version with less XP: ${untrusted("deck name", v.name)}, ${v.xp} XP, ${v.url}. Unless they've settled it, ask which they play from; to start from it, propose again with that as deck and this one as target.`,
          );
    } else parts.push("no deck yet");
    if (s.target) {
      const ref = parseRef(s.target);
      const read = ref ? await fetchDeck(ref) : null;
      if (!read?.ok) return toolError(`Couldn't read ${s.name}'s target deck.`);
      parts.push(`building toward ${read.data.deck.name || "an unnamed deck"}`);
    }
    if (s.unspentXp) parts.push(`${s.unspentXp} unspent XP`);
    if (s.physicalTrauma) parts.push(`${s.physicalTrauma} physical trauma`);
    if (s.mentalTrauma) parts.push(`${s.mentalTrauma} mental trauma`);
    if (s.status && s.status !== "active") parts.push(s.status);
    if (s.direction) parts.push(`heading for ${s.direction}`);
    seatLines.push(`${s.name}: ${parts.join("; ")}`);
  }

  const name = input.name.trim() || def.name;
  const scenario = next ? scenarios[next] : undefined;
  const underWay = !!next || input.seats.some((s) => s.unspentXp);
  return {
    ok: true,
    start: {
      proposalId: crypto.randomUUID(),
      name,
      code: def.code,
      difficulty: input.difficulty,
      taboo: input.taboo,
      ...(next ? { nextScenario: next } : {}),
      seats: input.seats,
    },
    summary: [
      `${name}: ${def.name}, ${input.difficulty}, taboo list ${input.taboo ? "on" : "off"}`,
      scenario
        ? `Starting at ${scenario}, scenario ${(next as number) + 1} of ${scenarios.length}`
        : `Starting at ${scenarios[0]}`,
      ...seatLines,
    ],
    notes,
    ...(underWay ? { ask: `We're about to play ${scenario ?? scenarios[0]}. How should we upgrade our decks for it?` } : {}),
  };
}

export function proposeCampaignText(r: ProposeCampaignResult): string {
  if (!r.ok) return failureText(r);
  return [
    "PROPOSED, NOT CREATED. The players see this as a card with Create campaign and Discard; nothing exists until one of them presses it:",
    ...r.summary.map((l) => `- ${l}`),
    ...r.notes.map((n) => `NOTE: ${n}`),
  ].join("\n");
}

export const offerCampaignSetupTool = tool({
  description:
    "When the players say they are starting a campaign and haven't said much else, show a card offering two ways to do " +
    "it: set it up here in the chat, or by hand on the campaigns page. Takes nothing and writes nothing.",
  inputSchema: z.object({}),
  contextSchema: ToolContextSchema,
  execute: async () => ({ ok: true as const }),
  toModelOutput: () => toolText("The players see a card: set it up here, or by hand. Wait for what they choose."),
});

export const proposeCampaignTool = tool({
  description:
    "Propose creating a campaign, from its first scenario or partway through, once the players have said what it needs: " +
    "which campaign, the difficulty, taboo, and each seat with its deck link, plus for a campaign under way the scenario " +
    "they are about to play and each seat's unspent XP, trauma and status. Reads the decks and checks the names. Writes " +
    "nothing: a player creates it from a card, which opens a chat inside the new campaign.",
  inputSchema,
  contextSchema: ToolContextSchema,
  execute: (input): Promise<ProposeCampaignResult> => safely(() => proposeCampaign(input)),
  toModelOutput: ({ output }) => toolText(proposeCampaignText(output)),
});
