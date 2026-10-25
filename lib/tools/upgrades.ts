import { tool } from "ai";
import { z } from "zod";
import { type CardFace, cardHead, tabooChangeText } from "../card-text";
import { type CardStore, cardFace, cleanText, isDeckCardType, norm, type RawCard } from "../cards";
import { type DeckCard, ignoredCopies, isExceptional, isWeakness, openDeck, parseCustomization } from "../decks";
import { type Failure, failureText, safely, toolError, toolText } from "../format";
import { playRate, type Share, shareText } from "../index/usage";
import { rulesFor } from "../legality";
import { DEFAULT_SETTINGS, type Settings, SettingsSchema } from "../settings";
import { type TabooList, tabooEntry } from "../taboo";

const DEFAULT_NEW = 12;
const MAX_NEW = 25;
const LEVEL_ZERO = 5;
// Rules Reference, Customizable: at most 10 boxes per upgrade sheet
const MAX_BOXES = 10;

type Played = { investigator: Share; class: Share };

/** A higher level of a card the deck runs: pay the difference, and the lower version leaves. */
export type Upgrade = CardFace & {
  from: { code: string; label: string; qty: number };
  xpEach: number;
  xpAll: number;
  played: Played;
};

/** Checkboxes of a customizable card the deck runs, not yet marked: 1 XP each. */
export type OpenOption = { card: string; code: string; text: string; boxesLeft: number; marked: number };

/** A card the deck doesn't run that it could buy, in place of one it does. */
export type Purchase = CardFace & { xpEach: number; legalBecause: string; played: Played };

export type UpgradesResult =
  | {
      ok: true;
      deck: { id: number; name: string; investigator: string; xpInList: number };
      xp: number;
      upgrades: Upgrade[];
      options: OpenOption[];
      /** Level 1 and up, then the few level 0 cards this investigator's decks play most. */
      purchases: Purchase[];
      levelZero: Purchase[];
      /** Cards in the deck whose text is about experience (Arcane Research, Adaptable...). */
      xpCards: string[];
    }
  | Failure;

/** What one copy costs to buy: its level (doubled if exceptional) plus any taboo surcharge. */
function price(store: CardStore, c: RawCard, taboo?: TabooList): number {
  const t = tabooEntry(store, taboo, c.code);
  return (c.xp ?? 0) * (isExceptional(c, t) ? 2 : 1) + (t?.xp ?? 0);
}

function buyable(store: CardStore, c: RawCard): boolean {
  if (c.encounter_code || store.isReprint(c.code) || !isDeckCardType(c.type_code)) return false;
  // signatures, advanced or not, and bonded cards are never bought
  if (isWeakness(c) || c.bonded_to || c.hidden || c.restrictions?.investigator) return false;
  // In the Thick of It, Underworld Support: only when the deck is built
  if (/purchase at deck creation/i.test(c.real_text ?? c.text ?? "")) return false;
  return store.inCollection(c.code);
}

function score(p: Played): number {
  return 4 * p.investigator.share + 2 * p.class.share;
}

export async function upgrades(
  input: { deck: string; xp: number; limit?: number },
  settings: Settings = DEFAULT_SETTINGS,
): Promise<UpgradesResult> {
  const opened = await openDeck(input.deck, settings);
  if (!opened.ok) return opened;
  const { store, deck, meta, taboo, tabooError, cards } = opened;
  const { inv, options } = opened.sides;
  if (tabooError)
    return toolError(`The taboo list is on but could not be loaded (${tabooError}), so prices and legality cannot be checked.`);
  const xp = input.xp;
  const rules = rulesFor(store, inv.code, options, meta, taboo, ignoredCopies(deck));
  const invCode = store.canonical(inv.code);
  const played = (c: RawCard) => playRate(invCode, inv.faction_code, c.code, c.xp ?? 0);
  const owned = (c: DeckCard) => (c.weakness ? undefined : store.get(c.code));

  const upgradesFound: Upgrade[] = [];
  for (const c of cards) {
    const from = owned(c);
    if (!from || from.customization_options) continue;
    const rest = { ...deck.slots };
    delete rest[c.code];
    for (const v of store.versions(c.code)) {
      if ((v.xp ?? 0) <= c.level || !buyable(store, v) || v.subname !== from.subname) continue;
      const each = Math.max(1, price(store, v, taboo) - price(store, from, taboo));
      const all = v.myriad ? each : each * c.qty;
      if (each > xp || !rules.check(v, rest, c.qty).legal) continue;
      upgradesFound.push({
        ...cardFace(store, v, taboo),
        from: { code: c.code, label: c.label, qty: c.qty },
        xpEach: each,
        xpAll: all,
        played: played(v),
      });
    }
  }
  upgradesFound.sort((a, b) => score(b.played) - score(a.played) || a.xpEach - b.xpEach);

  const open: OpenOption[] = [];
  for (const c of cards) {
    const raw = owned(c);
    if (!raw?.customization_text) continue;
    const marks = parseCustomization(meta[`cus_${c.code}`]);
    const marked = marks.reduce((n, m) => n + m.boxes, 0);
    const room = MAX_BOXES - marked;
    raw.customization_text
      .split("\n")
      .filter((o: string) => o.trim())
      .forEach((line, index) => {
        // each option line opens with one box glyph per checkbox: "□□ <b>Durable.</b> ..."
        const total = line.match(/^[□☐]+/)?.[0].length ?? 0;
        const left = total - (marks.find((m) => m.index === index)?.boxes ?? 0);
        if (left > 0 && left <= Math.min(xp, room))
          open.push({ card: c.label, code: c.code, text: cleanText(line.replace(/^[□☐]+\s*/, "")), boxesLeft: left, marked });
      });
  }

  // a name the deck runs at any level is an upgrade, not a purchase
  const names = new Set(cards.map((c) => norm(c.name)));
  const bought: { c: RawCard; each: number; why: string; p: Played }[] = [];
  for (const c of store.byCode.values()) {
    if (!buyable(store, c) || names.has(norm(c.name))) continue;
    const each = Math.max(1, price(store, c, taboo));
    if (each > xp) continue;
    const v = rules.check(c, deck.slots, 1);
    if (!v.legal) continue;
    bought.push({ c, each, why: v.reason, p: played(c) });
  }
  bought.sort((a, b) => score(b.p) - score(a.p) || b.each - a.each);
  const limit = Math.min(MAX_NEW, Math.max(1, input.limit ?? DEFAULT_NEW));
  const purchase = ({ c, each, why, p }: (typeof bought)[number]): Purchase => ({
    ...cardFace(store, c, taboo),
    xpEach: each,
    legalBecause: why,
    played: p,
  });

  return {
    ok: true,
    deck: { id: deck.id, name: deck.name, investigator: inv.name, xpInList: cards.reduce((n, c) => n + c.xpCost, 0) },
    xp,
    upgrades: upgradesFound,
    options: open,
    purchases: bought
      .filter(({ c }) => (c.xp ?? 0) > 0)
      .slice(0, limit)
      .map(purchase),
    levelZero: bought
      .filter(({ c }) => !c.xp)
      .slice(0, LEVEL_ZERO)
      .map(purchase),
    xpCards: cards.filter((c) => !c.weakness && /\bexperience\b/i.test(c.text)).map((c) => c.label),
  };
}

function rate(p: Played): string {
  return `played in ${shareText(p.investigator)} liked decks for this investigator, ${shareText(p.class)} for this class`;
}

export function upgradesText(r: UpgradesResult): string {
  if (!r.ok) return failureText(r);
  const out = [
    `Spending ${r.xp} XP on ${r.deck.investigator}'s deck (its list already holds ${r.deck.xpInList} XP of cards). Every card below is owned and legal for this deck, and costs at most ${r.xp} XP. A purchase must replace a card in the list, since the deck size is fixed: name what it replaces. Plan a set whose total is at most ${r.xp}.`,
  ];
  if (r.xpCards.length)
    out.push(`The list runs ${r.xpCards.join(", ")}, whose text is about experience: read them, they can change what XP buys.`);
  out.push(`\n# Upgrades of cards the deck runs (pay the difference; the lower version leaves the deck)`);
  if (!r.upgrades.length) out.push("(none within budget)");
  for (const u of r.upgrades)
    out.push(
      `- ${u.from.qty}x ${u.from.label} -> ${u.label} [${u.code}]: ${u.xpEach} XP a copy, ${u.xpAll} for all ${u.from.qty} (${cardHead(u)}) ${u.text}${u.taboo ? `\n    TABOO: ${tabooChangeText(u.taboo)}` : ""}\n    ${rate(u.played)}`,
    );
  if (r.options.length) {
    out.push(
      `\n# Customization checkboxes not yet marked (1 XP each; an option applies once all its boxes are marked; the card's level is half its marked boxes, rounded up, and must stay legal for the deck)`,
    );
    let card = "";
    for (const o of r.options) {
      if (o.code !== card) out.push(`- ${o.card} [${o.code}], ${o.marked} of ${MAX_BOXES} boxes marked:`);
      card = o.code;
      out.push(`  - ${o.boxesLeft} box${o.boxesLeft === 1 ? "" : "es"} left: ${o.text}`);
    }
  }
  const line = (p: Purchase) =>
    `- ${p.label} [${p.code}]: ${p.xpEach} XP a copy (${cardHead(p)}) ${p.text}${p.taboo ? `\n    TABOO: ${tabooChangeText(p.taboo)}` : ""}\n    legal: ${p.legalBecause}; ${rate(p.played)}`;
  out.push(`\n# New cards of level 1 and up, most played by this investigator's liked decks first (each costs its level)`);
  if (!r.purchases.length) out.push("(none within budget)");
  out.push(...r.purchases.map(line));
  if (r.levelZero.length) {
    out.push(`\n# Level 0 cards this investigator's liked decks play most that this deck lacks (1 XP each)`);
    out.push(...r.levelZero.map(line));
  }
  return out.join("\n");
}

const inputSchema = z.object({
  deck: z.string().describe("A deck id or arkhamdb.com deck link."),
  xp: z.number().int().min(1).max(60).describe("The experience the player has to spend now."),
  limit: z.number().int().min(1).max(MAX_NEW).optional().describe(`How many new cards to list, default ${DEFAULT_NEW}.`),
});

export type UpgradesInput = z.infer<typeof inputSchema>;

export const upgradesTool = tool({
  description:
    "Plan how to spend experience on an ArkhamDB deck between scenarios. Lists what the XP can buy that is owned and " +
    "legal for the deck: higher levels of cards it runs (paying the difference), unmarked customization checkboxes, " +
    "and new cards ranked by how often this investigator's liked decks play them, each with its exact XP price " +
    "under the taboo setting. Choose the purchases yourself, and say what each new card replaces.",
  inputSchema,
  contextSchema: SettingsSchema,
  execute: (input, { context }): Promise<UpgradesResult> => safely(() => upgrades(input, context)),
  toModelOutput: ({ output }) => toolText(upgradesText(output)),
});
