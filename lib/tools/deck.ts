import { tool } from "ai";
import { z } from "zod";
import {
  type Customization,
  cardHead,
  type InvestigatorStats,
  investigatorStats,
  statsText,
  type TabooChange,
  tabooChangeText,
} from "../card-text";
import { cleanText } from "../cards";
import { type DeckCard, deckMeta, guideText, openDeck, xpInList } from "../decks";
import { type Failure, failureText, safely, toolText, untrusted } from "../format";
import { deckChoices } from "../legality";
import { DEFAULT_SETTINGS, type Settings } from "../settings";
import { tabooChange, tabooEntry } from "../taboo";
import { ToolContextSchema } from "../tool-context";
import { type DeckKind, deckUrl } from "../urls";

const GUIDE_PAGE_CHARS = 24_000;

export type DeckResult =
  | {
      ok: true;
      id: number;
      /** "seat": a campaign seat's deck, kept in the app; its url is the campaign page. */
      kind: DeckKind | "seat";
      url: string;
      name: string;
      updated?: string;
      taboo: { id: number; code: string; date: string } | null;
      builtUnderTaboo?: number;
      tabooError?: string;
      investigator: {
        code: string;
        name: string;
        class: string;
        stats: InvestigatorStats;
        ability: string;
        deckbuilding: string;
        choices: string[];
        parallel: string[];
        taboo?: TabooChange;
      };
      xp: number;
      cards: DeckCard[];
      cardCount: number;
      unowned: string[];
      guide: string;
      guideWords: number;
      guideChars: number;
      guideOffset: number;
      guideNextOffset?: number;
    }
  | Failure;

export async function readDeck(ref: string, guideOffset = 0, settings: Settings = DEFAULT_SETTINGS): Promise<DeckResult> {
  const opened = await openDeck(ref, settings);
  if (!opened.ok) return opened;
  const { store, deck, kind, campaignUrl, taboo, tabooError, cards } = opened;
  const { inv, ability, options, parallelFront, parallelBack } = opened.sides;
  const invTaboo = tabooEntry(store, taboo, inv.code) ?? tabooEntry(store, taboo, options.code);
  const guide = guideText(deck.description_md);
  const offset = Math.max(0, guideOffset);
  const next = offset + GUIDE_PAGE_CHARS;
  return {
    ok: true,
    id: deck.id,
    kind,
    url: kind === "seat" ? (campaignUrl ?? "/campaigns") : deckUrl(deck.id, kind),
    name: deck.name,
    updated: (deck.date_update ?? deck.date_creation)?.slice(0, 10),
    taboo: taboo ? { id: taboo.id, code: taboo.code, date: taboo.date } : null,
    ...(taboo && deck.taboo_id && deck.taboo_id !== taboo.id ? { builtUnderTaboo: deck.taboo_id } : {}),
    ...(tabooError ? { tabooError } : {}),
    investigator: {
      code: inv.code,
      name: inv.name,
      class: inv.faction_code,
      stats: investigatorStats(inv),
      ability: cleanText(ability?.text),
      deckbuilding: cleanText(options.back_text),
      choices: deckChoices(options.deck_options, deckMeta(deck)),
      parallel: [parallelFront ? "front" : "", parallelBack ? "back" : ""].filter(Boolean),
      ...(invTaboo && taboo ? { taboo: tabooChange(taboo, invTaboo) } : {}),
    },
    xp: xpInList(cards),
    cards,
    cardCount: cards.filter((c) => !c.weakness).reduce((n, c) => n + c.qty, 0),
    unowned: cards.filter((c) => !c.owned).map((c) => c.label),
    guide: guide.slice(offset, next),
    guideWords: guide ? guide.split(/\s+/).length : 0,
    guideChars: guide.length,
    guideOffset: offset,
    ...(next < guide.length ? { guideNextOffset: next } : {}),
  };
}

function customizationText(c: Customization): string {
  const marks = [
    c.total ? `${c.boxes} of ${c.total} ${c.total === 1 ? "box" : "boxes"}` : "",
    c.choice
      ? `chose ${c.choiceIsText ? untrusted("customization choice, written by the deck's author", c.choice) : c.choice}`
      : "",
  ].filter(Boolean);
  return `${c.text}${marks.length ? ` [${marks.join(", ")}]` : ""}`;
}

function cardRow(c: DeckCard): string {
  const cus = c.customizations.map((x) => `\n    + ${customizationText(x)}`).join("");
  const taboo = c.taboo ? `\n    TABOO: ${tabooChangeText(c.taboo)}` : "";
  return `${c.qty}x ${c.label} [${c.code}] (${cardHead(c)})${c.hasRulings ? " [FAQ]" : ""} ${c.text}${cus}${taboo}`;
}

export function deckText(r: DeckResult): string {
  if (!r.ok) return failureText(r);
  const i = r.investigator;
  const out = [
    r.kind === "seat" ? `# This campaign's deck, kept in the app (${r.url})` : `# Deck ${r.id} (${r.kind}) ${r.url}`,
    untrusted("deck name, written by its author", r.name),
    `updated ${r.updated ?? "?"}; XP in the list ${r.xp}; ${r.cardCount} cards plus weaknesses`,
    r.taboo
      ? `Taboo list ${r.taboo.code} (${r.taboo.date}) is on: cards marked TABOO below play as changed there.${r.builtUnderTaboo ? ` The author built the deck under list ${String(r.builtUnderTaboo).padStart(3, "0")}.` : ""}`
      : r.tabooError
        ? `ERROR loading the taboo list, which is on: ${r.tabooError}. Card text below is untabooed.`
        : "Taboo list: off.",
    `\n# Investigator: ${i.name} [${i.code}] (${i.class})${i.parallel.length ? `, parallel ${i.parallel.join(" and ")}` : ""}`,
    statsText(i.stats),
    `ability: ${i.ability}`,
    ...(i.taboo ? [`TABOO: ${tabooChangeText(i.taboo)}`] : []),
    `deckbuilding: ${i.deckbuilding}`,
    ...(i.choices.length ? [`deckbuilding choices in this deck: ${i.choices.join("; ")}`] : []),
    `\n# The list (this is what the deck runs). Cards marked [FAQ] have official rulings that can change how they work: read one with the cards tool before explaining it.`,
    ...r.cards.map(cardRow),
    r.unowned.length ? `\nNot in the collection: ${r.unowned.join(", ")}` : `\nEvery card is in the collection.`,
  ];
  if (r.guideOffset === 0) {
    out.push(
      `\n# Author's guide (${r.guideWords} words). It often covers the whole campaign; a card it names is in the deck only if the list above has it.`,
    );
    out.push(r.guide ? untrusted("deck guide, written by its author", r.guide) : "(no guide)");
  } else if (!r.guide) {
    out.push(`\n# Author's guide: guideOffset ${r.guideOffset} is past the end (${r.guideChars} characters total).`);
  } else {
    out.push(`\n# Author's guide, continued from character ${r.guideOffset}`);
    out.push(untrusted("deck guide, written by its author", r.guide));
  }
  if (r.guideNextOffset !== undefined) out.push(`\nThe guide continues: call deck again with guideOffset ${r.guideNextOffset}.`);
  return out.join("\n");
}

const inputSchema = z.object({
  ref: z.string().describe('A deck id ("33170"), an arkhamdb.com deck link, or in a campaign chat a seat\'s deck ("seat:Alon").'),
  guideOffset: z.number().int().min(0).optional().describe("Continue a long guide, from the guideNextOffset of a previous call."),
});

export type DeckInput = z.infer<typeof inputSchema>;

export const deckTool = tool({
  description:
    "Read any ArkhamDB deck live: a published decklist, a public personal deck, or one made minutes ago. " +
    "Returns the investigator (with parallel sides resolved), the decoded list with every card's text and " +
    "customizations, and the author's own guide. Use it to explain how a deck plays, and read it before " +
    "suggesting a swap or a partner for it.",
  inputSchema,
  contextSchema: ToolContextSchema,
  execute: ({ ref, guideOffset }, { context }): Promise<DeckResult> => safely(() => readDeck(ref, guideOffset, context)),
  toModelOutput: ({ output }) => toolText(deckText(output)),
});
