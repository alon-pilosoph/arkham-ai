import { tool } from "ai";
import { z } from "zod";
import {
  type CardFace,
  cardHead,
  cardStats,
  type Rulings,
  rulingsMarkdown,
  type Stats,
  statsText,
  tabooChangeText,
} from "../card-text";
import { type CardStore, cardFace, cleanText, getCards, norm, PLAYER_TYPES, type RawCard, sortVersions } from "../cards";
import { type Failure, failureText, notFound, safely, toolError, toolText } from "../format";
import { SettingsSchema } from "../settings";
import { type TabooList, tabooInForce } from "../taboo";
import { cardUrl } from "../urls";

export type CardView = CardFace & {
  printings: string[];
  subname?: string;
  traits?: string;
  stats?: Stats;
  back?: string;
  customization?: string;
  errata?: string;
  rulings?: Rulings;
  pack: string;
  encounter?: string;
  owned: boolean;
  url: string;
};

type CardGroup = { name: string; versions: CardView[] };

export type CardsResult =
  | {
      ok: true;
      mode: "code" | "name" | "text";
      query: string;
      total: number;
      offset: number;
      groups: CardGroup[];
      nextOffset?: number;
      others?: { name: string; codes: string[]; levels: number[] }[];
      tabooError?: string;
    }
  | Failure;

const FULL_GROUPS = 3;
const LISTED_GROUPS = 15;

export function cardView(store: CardStore, c: RawCard, taboo?: TabooList): CardView {
  const stats = cardStats(c);
  const rulings = store.rulings(c.code);
  return {
    ...cardFace(store, c, taboo),
    printings: store.ownedPrintings(c.code),
    subname: c.subname,
    traits: c.traits,
    ...(stats ? { stats } : {}),
    back: c.back_text ? cleanText(c.back_text) : undefined,
    customization: c.customization_text ? cleanText(c.customization_text) : undefined,
    errata: c.errata_date?.date ? c.errata_date.date.slice(0, 10) : undefined,
    ...(rulings ? { rulings } : {}),
    pack: c.pack_name ?? c.pack_code,
    encounter: c.encounter_name,
    owned: store.inCollection(c.code),
    url: cardUrl(c.code),
  };
}

function group(store: CardStore, cards: RawCard[], taboo?: TabooList): CardGroup {
  return { name: cards[0].name, versions: cards.map((c) => cardView(store, c, taboo)) };
}

function rank(g: RawCard[]): number {
  return (PLAYER_TYPES.has(g[0].type_code) ? 0 : 1000) + g[0].name.length;
}

export function findCards(
  store: CardStore,
  input: { query?: string; code?: string; offset?: number },
  taboo?: TabooList,
): CardsResult {
  const offset = Math.max(0, input.offset ?? 0);
  if (input.code) {
    const c = store.get(input.code.trim());
    if (!c) return notFound(`No card has code ${input.code}.`);
    return {
      ok: true,
      mode: "code",
      query: input.code,
      total: 1,
      offset: 0,
      groups: [group(store, store.versions(c.code), taboo)],
    };
  }
  const raw = (input.query ?? "").trim();
  if (!raw) return toolError("Give a query or a code.");
  const { name, level, groups: byName } = store.find(raw);
  const words = name.split(" ").filter(Boolean);
  if (!words.length) return toolError("Give a card name.");

  let mode: "name" | "text" = "name";
  let groups = byName;
  if (!groups.length) {
    mode = "text";
    groups = [...store.allNames()]
      .map(([, g]) => g)
      .filter((g) =>
        g.some((c) => {
          const hay = norm(`${c.name} ${c.traits ?? ""} ${c.text ?? ""}`);
          return words.every((w) => hay.includes(w));
        }),
      );
  }
  groups = groups.map(sortVersions).sort((a, b) => rank(a) - rank(b) || a[0].name.localeCompare(b[0].name));
  if (level !== undefined) {
    groups = groups.map((g) => [...g].sort((a, b) => Number((b.xp ?? 0) === level) - Number((a.xp ?? 0) === level)));
  }

  if (groups.length && offset >= groups.length) return toolError(`Offset ${offset} is past the end (${groups.length} total).`);
  const page = groups.slice(offset, offset + FULL_GROUPS + LISTED_GROUPS);
  const full = page.slice(0, FULL_GROUPS).map((g) => group(store, g, taboo));
  const others = page.slice(FULL_GROUPS).map((g) => ({
    name: g[0].name,
    codes: g.map((c) => c.code),
    levels: g.map((c) => c.xp ?? 0),
  }));
  const next = offset + page.length;
  return {
    ok: true,
    mode,
    query: raw,
    total: groups.length,
    offset,
    groups: full,
    ...(others.length ? { others } : {}),
    ...(next < groups.length ? { nextOffset: next } : {}),
  };
}

function cardLine(v: CardView): string {
  const reprints = v.printings.filter((p) => p !== v.code);
  const lines = [`${v.label} [${v.code}${reprints.length ? `; also printed as ${reprints.join(" ")}` : ""}] (${cardHead(v)})`];
  if (v.traits) lines.push(`  traits: ${v.traits}`);
  if (v.stats) lines.push(`  ${statsText(v.stats)}`);
  lines.push(`  text: ${v.text || "(none)"}`);
  if (v.back) lines.push(`  back: ${v.back}`);
  if (v.customization) lines.push(`  customization: ${v.customization}`);
  if (v.errata) lines.push(`  errata: this text includes an erratum (${v.errata})`);
  lines.push(
    `  rulings: ${v.rulings ? `${rulingsMarkdown(v.rulings)} (updated ${v.rulings.updated})` : "none in the official FAQ"}`,
  );
  if (v.taboo) lines.push(`  taboo: taboo list ${v.taboo.list} (${v.taboo.date}): ${tabooChangeText(v.taboo)}`);
  lines.push(
    `  pack: ${v.pack}${v.encounter ? `, encounter set ${v.encounter}` : ""}; ${v.owned ? "in the collection" : "NOT in the collection"}`,
  );
  return lines.join("\n");
}

export function cardsText(r: CardsResult): string {
  if (!r.ok) return failureText(r);
  if (!r.total) return `No card matches "${r.query}" by name, trait or text.`;
  const out = [
    ...(r.tabooError ? [`ERROR loading the taboo list, which is on: ${r.tabooError}. Card text below is untabooed.`] : []),
    `${r.total} card name${r.total === 1 ? "" : "s"} match "${r.query}" (by ${r.mode})${r.offset ? `, from #${r.offset + 1}` : ""}. Every version of each name is listed; check the level before quoting one.`,
  ];
  for (const g of r.groups) {
    out.push(`\n## ${g.name}: ${g.versions.length} version${g.versions.length === 1 ? "" : "s"}`);
    for (const v of g.versions) out.push(cardLine(v));
  }
  if (r.others?.length) {
    out.push("\nAlso matching (read one with its code):");
    for (const o of r.others)
      out.push(`- ${o.name}: ${o.codes.map((c, i) => `${c}${o.levels[i] ? ` (${o.levels[i]})` : ""}`).join(", ")}`);
  }
  if (r.nextOffset !== undefined) out.push(`\nMore: call cards again with offset ${r.nextOffset}.`);
  return out.join("\n");
}

const inputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe('A card name ("Ward of Protection", "Shrivelling (3)") or words from its text or traits.'),
  code: z.string().optional().describe('An ArkhamDB card code, e.g. "01060". Wins over query.'),
  offset: z.number().int().min(0).optional().describe("Page into a long result, from the nextOffset of a previous call."),
});

export type CardsInput = z.infer<typeof inputSchema>;

export const cardsTool = tool({
  description:
    "Look up Arkham Horror LCG cards on ArkhamDB, player and encounter cards alike. " +
    "With `code`, read that card exactly. With `query`, match by name first, then by trait or text. " +
    "Every level and version of a name comes back together, with current errata folded into the text, " +
    "official FAQ rulings and, when the players have the taboo list on, its changes attached, so check the level before you quote a card. " +
    "Use it before explaining what any card does.",
  inputSchema,
  contextSchema: SettingsSchema,
  execute: (input, { context }): Promise<CardsResult> =>
    safely(async () => {
      const [store, taboo] = await Promise.all([getCards(), tabooInForce(context)]);
      const result = findCards(store, input, taboo.list);
      return result.ok && taboo.error ? { ...result, tabooError: taboo.error } : result;
    }),
  toModelOutput: ({ output }) => toolText(cardsText(output)),
});
