import { tool } from "ai";
import { z } from "zod";
import { CAMPAIGNS, type Campaign, encounterCards, findCampaign, type Profile, profile, scenarios } from "../campaigns";
import { getCards } from "../cards";
import { type Failure, failureText, notFound, safely, toolText } from "../format";
import { SettingsSchema } from "../settings";

export type CampaignPrepResult =
  | {
      ok: true;
      campaign: Pick<Campaign, "code" | "name" | "kind" | "note">;
      profile: Profile;
      /** Each scenario's own encounter set, in printed order; empty for a single scenario. */
      scenarios: { name: string; profile: Profile }[];
      /** The sets several scenarios draw on, counted apart; null when there are none. */
      shared: Profile | null;
    }
  | Failure;

export async function campaignPrep(name: string): Promise<CampaignPrepResult> {
  const hits = findCampaign(name);
  if (!hits.length)
    return notFound(
      `No Chapter 1 campaign or standalone scenario matches "${name}". They are: ${CAMPAIGNS.filter((c) => c.kind !== "return")
        .map((c) => c.name)
        .join(", ")}.`,
    );
  if (hits.length > 1) return notFound(`"${name}" could be ${hits.map((c) => c.name).join(" or ")}. Ask which.`);
  const c = hits[0];
  const store = await getCards();
  const cards = encounterCards(store, c.packs);
  const list = scenarios(store, c);
  const own = new Set(list.map((s) => s.set));
  const shared = cards.filter((x) => !own.has(x.encounter_code ?? ""));
  return {
    ok: true,
    campaign: { code: c.code, name: c.name, kind: c.kind, note: c.note },
    profile: profile(cards),
    scenarios:
      list.length > 1
        ? list.map((s) => ({ name: s.name, profile: profile(cards.filter((x) => x.encounter_code === s.set)) }))
        : [],
    shared: list.length > 1 && shared.length ? profile(shared) : null,
  };
}

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "0%");

function profileText(p: Profile): string {
  const t = p.treacheries;
  const e = p.enemies;
  const tests = (Object.entries(t.tests) as [string, number][])
    .filter(([, n]) => n)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s} ${pct(n, t.copies)}`)
    .join(", ");
  const keywords = (Object.entries(e.keywords) as [string, number][])
    .filter(([, n]) => n)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
  const tokens = (Object.entries(p.tokens) as [string, number][]).filter(([, n]) => n).map(([k, n]) => `[${k}] on ${n} cards`);
  return [
    `  treacheries: ${t.copies} copies; tests ${tests || "none"}; ${pct(t.horror, t.copies)} mention horror, ${pct(t.damage, t.copies)} damage, ${pct(t.doom, t.copies)} doom`,
    `  enemies: ${e.copies} copies; average fight ${e.fight ?? "-"}, evade ${e.evade ?? "-"}, health ${e.health ?? "-"} (for two players); their attacks deal ${e.attackDamage} damage and ${e.attackHorror} horror in total; keywords ${keywords || "none"}`,
    `  locations: ${p.locations.count}, average shroud ${p.locations.shroud ?? "-"}`,
    ...(tokens.length ? [`  chaos tokens named: ${tokens.join(", ")}`] : []),
  ].join("\n");
}

export function campaignPrepText(r: CampaignPrepResult): string {
  if (!r.ok) return failureText(r);
  const out = [
    `${r.campaign.name} (${r.campaign.kind === "standalone" ? "standalone scenario" : r.campaign.kind === "return" ? "Return to box: only the cards it adds" : "campaign"}).`,
    ...(r.campaign.note ? [`What it asks of your deck: ${r.campaign.note}`] : []),
    `\nIts encounter cards, as counts only (no card is named, so nothing here is a spoiler):`,
    profileText(r.profile),
  ];
  if (r.scenarios.length) {
    out.push(
      `\nBy scenario, in printed order: each counts only the encounter set made for it. Scenarios also shuffle in sets they share, counted apart at the end.`,
    );
    for (const s of r.scenarios) out.push(`${s.name}:\n${profileText(s.profile)}`);
    if (r.shared) out.push(`Sets shared by several scenarios:\n${profileText(r.shared)}`);
  }
  out.push(
    "\nTurn this into advice on preparing (skills, healing, movement, fighting or evading, what to buy), and keep it spoiler-light: describe tendencies, never encounter cards, enemies, story or how a scenario ends.",
  );
  return out.join("\n");
}

const inputSchema = z.object({
  campaign: z
    .string()
    .describe(
      'The campaign or standalone scenario, e.g. "The Path to Carcosa", "Edge of the Earth", "Return to the Dunwich Legacy".',
    ),
});

export type CampaignPrepInput = z.infer<typeof inputSchema>;

export const campaignPrepTool = tool({
  description:
    "Spoiler-light preparation for a Chapter 1 campaign or standalone scenario: what its encounter cards ask of the " +
    "investigators, as counts and averages (which skills its treacheries test, horror against damage, how tough and how " +
    "many its enemies are, keywords, frost and other tokens), overall and by scenario, plus a note on what it asks of a deck. " +
    "Names no encounter card. Use it only when the players ask how to prepare for a campaign or scenario.",
  inputSchema,
  contextSchema: SettingsSchema,
  execute: ({ campaign }): Promise<CampaignPrepResult> => safely(() => campaignPrep(campaign)),
  toModelOutput: ({ output }) => toolText(campaignPrepText(output)),
});
