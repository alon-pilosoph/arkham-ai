// ArkhamDB's deckbuilding semantics: the first matching deck option governs a card. A matching
// `not` forbids it; an option with a `limit` admits it only while there is room, else the search moves on.

import { traitList } from "./card-text";
import { type CardStore, classes, type DeckOption, isDeckCardType, label, norm, type RawCard } from "./cards";
import {
  type DeckList,
  deckMeta,
  ignoredCopies,
  investigatorSides,
  isExceptional,
  isWeakness,
  parseCustomization,
} from "./decks";
import { type TabooList, tabooEntry } from "./taboo";

export type Verdict = { legal: boolean; reason: string };

function traitsOf(c: RawCard): Set<string> {
  return new Set(traitList(c.real_traits ?? c.traits).map((t) => t.toLowerCase()));
}

/** Options that only configure the deck (deck size, requirement counters) and admit nothing. */
function isSelector(o: DeckOption): boolean {
  if (o.ignore_match) return true;
  const filters: (keyof DeckOption)[] = [
    "faction",
    "faction_select",
    "trait",
    "type",
    "text",
    "tag",
    "uses",
    "slot",
    "level",
    "option_select",
    "permanent",
  ];
  return !filters.some((k) => o[k] !== undefined);
}

class DeckRules {
  constructor(
    private readonly store: CardStore,
    private readonly optionsCard: RawCard,
    private readonly investigatorCodes: Set<string>,
    private readonly meta: Record<string, string>,
    private readonly taboo?: TabooList,
    private readonly ignored: Record<string, number> = {},
  ) {}

  cardLimit(c: RawCard): number {
    const t = tabooEntry(this.store, this.taboo, c.code);
    if (t?.deck_limit !== undefined) return t.deck_limit;
    if (isExceptional(c, t)) return 1;
    const raised = this.purchased(c).reduce<number | undefined>((n, o) => o.deck_limit ?? n, undefined);
    return raised ?? c.deck_limit ?? 2;
  }

  /** Across levels and subtitles, as ArkhamDB's validator counts: the two Precious Mementos,
   *  each limited to one, may share a deck. */
  private titleLimit(c: RawCard): number {
    const t = tabooEntry(this.store, this.taboo, c.code);
    if (t?.deck_limit !== undefined || isExceptional(c, t)) return this.cardLimit(c);
    if (c.myriad) return 3;
    if (PRECIOUS_MEMENTOS.has(this.store.canonical(c.code))) return 2;
    return this.cardLimit(c);
  }

  /** Limits count by title; signatures and weaknesses do not count (Rules Reference,
   *  "Signature Cards"), nor do copies the author marked outside the limit. */
  private overLimit(c: RawCard, slots: Record<string, number>, qty: number): Verdict | null {
    const own = this.cardLimit(c);
    if (own === 0) {
      const t = tabooEntry(this.store, this.taboo, c.code);
      return {
        legal: false,
        reason: t?.deck_limit === 0 && this.taboo ? `forbidden by taboo list ${this.taboo.code}` : "deck limit 0",
      };
    }
    const title = norm(c.name);
    const card = this.store.canonical(c.code);
    // `qty` are the card's own copies (a new card has none marked) unless `slots` holds them
    let copies = qty - (slots[c.code] === undefined ? (this.ignored[c.code] ?? 0) : 0);
    let same = copies;
    let limit = this.titleLimit(c);
    let underworld = card === UNDERWORLD_SUPPORT;
    for (const [code, n] of Object.entries(slots)) {
      const o = this.store.get(code);
      if (this.store.canonical(code) === UNDERWORLD_SUPPORT) underworld = true;
      if (!o || norm(o.name) !== title || !countsTowardLimit(o) || this.restricted(o)) continue;
      const counted = n - (this.ignored[code] ?? 0);
      copies += counted;
      if (this.store.canonical(code) === card) same += counted;
      limit = Math.min(limit, this.titleLimit(o));
    }
    if (same > own) return { legal: false, reason: `over the deck limit: ${same} copies of ${label(c)}, at most ${own}` };
    if (underworld) limit = Math.min(limit, 1);
    if (copies > limit)
      return {
        legal: false,
        reason: `over the deck limit: ${copies} copies of ${c.name} by title, at most ${limit}${underworld ? " with Underworld Support" : ""}`,
      };
    return null;
  }

  private purchased(c: RawCard): NonNullable<RawCard["customization_options"]> {
    const parts = parseCustomization(this.meta[`cus_${c.code}`]);
    if (!c.customization_options || !parts.length) return [];
    return parts.flatMap(({ index, boxes }) => {
      const opt = c.customization_options?.[index];
      return opt && boxes >= (opt.xp ?? 1) ? [opt] : [];
    });
  }

  private optionsWith(slots: Record<string, number>): DeckOption[] {
    const opts = [
      ...(tabooEntry(this.store, this.taboo, this.optionsCard.code)?.deck_options ?? this.optionsCard.deck_options ?? []),
    ];
    if (Object.keys(slots).some((c) => this.store.get(c)?.name === "Versatile")) opts.push(VERSATILE);
    return opts;
  }

  private level(c: RawCard): number {
    const parts = parseCustomization(this.meta[`cus_${c.code}`]);
    if (!c.customization_text || !parts.length) return c.xp ?? 0;
    return Math.ceil(parts.reduce((n, p) => n + p.boxes, 0) / 2);
  }

  /** Deckbuilding sees the upgraded card: purchased options can add traits, tags and text
   *  (Runic Axe gains Relic). */
  private effective(c: RawCard): RawCard {
    const bought = this.purchased(c);
    if (!bought.length) return c;
    let traits = c.real_traits ?? c.traits;
    let text = c.real_text ?? c.text ?? "";
    let tags = c.tags ?? "";
    for (const opt of bought) {
      if (opt.real_traits) traits = opt.real_traits;
      if (opt.real_text) text += `\n${opt.real_text}`;
      if (opt.tags) tags += opt.tags;
    }
    return { ...c, real_traits: traits, real_text: text, tags };
  }

  private matches(o: DeckOption, card: RawCard): boolean {
    const c = this.effective(card);
    if (o.option_select) {
      const chosen = this.meta.option_selected;
      const subs = chosen ? o.option_select.filter((s) => s.id === chosen) : o.option_select;
      return subs.some((s) => this.matches(s, c));
    }
    const factions = new Set<string>(o.faction ?? []);
    if (o.faction_select) {
      const chosen = this.meta[o.id ?? "faction_selected"];
      for (const f of chosen ? [chosen] : o.faction_select) factions.add(f);
    }
    if (factions.size && !classes(c).some((f) => factions.has(f))) return false;
    if (o.level) {
      const lvl = this.level(c);
      if (lvl < o.level.min || lvl > o.level.max) return false;
    }
    if (o.trait) {
      const t = traitsOf(c);
      if (!o.trait.some((x) => t.has(x.toLowerCase()))) return false;
    }
    if (o.type && !o.type.includes(c.type_code)) return false;
    if (o.slot && !o.slot.some((s) => (c.slot ?? "").toLowerCase().includes(s.toLowerCase()))) return false;
    if (o.permanent !== undefined && !!c.permanent !== o.permanent) return false;
    if (o.uses) {
      const text = c.real_text ?? c.text ?? "";
      if (!o.uses.some((u) => new RegExp(`uses \\(\\S+ ${u}`, "i").test(text))) return false;
    }
    // Text patterns and tags describe the same thing (e.g. "heals horror"); either admits.
    if (o.text || o.tag) {
      const text = c.real_text ?? c.text ?? "";
      const byText = (o.text ?? []).some((p) => {
        try {
          return new RegExp(p).test(text);
        } catch {
          return false;
        }
      });
      const tags = (c.tags ?? "").split(".").filter(Boolean);
      const byTag = (o.tag ?? []).some((t) => tags.includes(t));
      if (!byText && !byTag) return false;
    }
    return true;
  }

  private restricted(c: RawCard): "mine" | "other" | null {
    const inv = c.restrictions?.investigator;
    if (!inv) return null;
    return Object.keys(inv).some((k) => this.investigatorCodes.has(k)) ? "mine" : "other";
  }

  private usage(slots: Record<string, number>): Map<number, number> {
    const used = new Map<number, number>();
    for (const [code, qty] of Object.entries(slots)) {
      const c = this.store.get(code);
      if (!c || isWeakness(c) || this.restricted(c) === "mine") continue;
      this.place(c, qty, used, true, this.optionsWith(slots));
    }
    return used;
  }

  /** Copies are counted one by one: two copies may split across two limited options. */
  private place(c: RawCard, qty: number, used: Map<number, number>, commit: boolean, opts: DeckOption[]): Verdict {
    let left = qty;
    let fullLimit: DeckOption | undefined;
    const took: string[] = [];
    for (let i = 0; i < opts.length && left > 0; i++) {
      const o = opts[i];
      if (isSelector(o) || !this.matches(o, c)) continue;
      if (o.not) return { legal: false, reason: `forbidden: ${describeOption(o)}` };
      if (o.limit === undefined) return { legal: true, reason: [...took, describeOption(o)].join(" and ") };
      const n = used.get(i) ?? 0;
      const take = Math.min(left, o.limit - n);
      if (take <= 0) {
        fullLimit ??= o;
        continue;
      }
      if (commit) used.set(i, n + take);
      left -= take;
      took.push(`${describeOption(o)}, ${n + take} of ${o.limit} with this card`);
      if (!left) return { legal: true, reason: took.join(" and ") };
      fullLimit ??= o;
    }
    if (fullLimit) return { legal: false, reason: `over the limit: ${describeOption(fullLimit)} (${fullLimit.limit})` };
    return { legal: false, reason: "no deckbuilding option admits it" };
  }

  check(c: RawCard, slots: Record<string, number>, qty = 1): Verdict {
    if (!isDeckCardType(c.type_code)) return { legal: false, reason: `a ${c.type_code} is not a deck card` };
    if (isWeakness(c)) return { legal: false, reason: "a weakness" };
    if (c.bonded_to) return { legal: false, reason: `bonded to ${c.bonded_to}, never deckbuilt` };
    const r = this.restricted(c);
    if (r === "other") return { legal: false, reason: "another investigator's signature card" };
    if (r === "mine") return { legal: true, reason: "this investigator's own card" };
    const over = this.overLimit(c, slots, qty);
    if (over) return over;
    const opts = this.optionsWith(slots);
    if (!opts.length) return { legal: false, reason: "this investigator has no deckbuilding options on ArkhamDB" };
    return this.place(c, qty, this.usage(slots), false, opts);
  }
}

const UNDERWORLD_SUPPORT = "08046";
const PRECIOUS_MEMENTOS = new Set(["08114", "08115"]);

function countsTowardLimit(c: RawCard): boolean {
  return isDeckCardType(c.type_code) && !isWeakness(c) && !c.bonded_to;
}

// Versatile's text says one other level 0 card, but ArkhamDB's validator accepts up to five
// (Skids 30714, Mateo 42430, Pete 33102), and this follows the validator.
const VERSATILE: DeckOption = {
  level: { min: 0, max: 0 },
  limit: 5,
  error: "Versatile: up to 5 other level 0 cards from any class",
};

function describeOption(o: DeckOption): string {
  if (o.error) return o.error.replace(/^You cannot have more than /, "at most ");
  const parts: string[] = [];
  if (o.not) parts.push("not");
  if (o.faction) parts.push(o.faction.join("/"));
  if (o.faction_select) parts.push(`chosen class (${o.faction_select.join("/")})`);
  if (o.trait) parts.push(o.trait.join("/"));
  if (o.uses) parts.push(`uses ${o.uses.join("/")}`);
  if (o.tag || o.text)
    parts.push(o.tag?.includes("hh") ? "heals horror" : o.tag?.includes("hd") ? "heals damage" : "matching text");
  if (o.type) parts.push(o.type.join("/"));
  if (o.level) parts.push(o.level.min === o.level.max ? `level ${o.level.min}` : `level ${o.level.min}-${o.level.max}`);
  if (o.option_select) parts.push(`chosen option (${o.option_select.map((s) => s.name ?? s.id).join(" / ")})`);
  return parts.join(" ") || "a deckbuilding option";
}

export function rulesFor(
  store: CardStore,
  investigatorCode: string,
  optionsCard: RawCard,
  meta: Record<string, string>,
  taboo?: TabooList,
  ignored: Record<string, number> = {},
): DeckRules {
  const inv = store.get(investigatorCode);
  const codes = new Set<string>([investigatorCode, optionsCard.code]);
  if (inv?.alternate_of_code) codes.add(inv.alternate_of_code);
  for (const p of store.printings(investigatorCode)) codes.add(p);
  for (const c of store.byCode.values()) if (c.alternate_of_code === investigatorCode) codes.add(c.code);
  return new DeckRules(store, optionsCard, codes, meta, taboo, ignored);
}

type Violation = { card: string; reason: string };

export function deckViolation(store: CardStore, deck: DeckList, taboo?: TabooList): Violation | null {
  const meta = deckMeta(deck);
  const { inv, options } = investigatorSides(store, deck);
  if (!inv || !options) return { card: deck.investigator_code, reason: "investigator not in the card set" };
  const rules = rulesFor(store, inv.code, options, meta, taboo, ignoredCopies(deck));
  for (const [code, qty] of Object.entries(deck.slots)) {
    const c = store.get(code);
    if (!c || isWeakness(c) || c.type_code === "investigator") continue;
    const rest = { ...deck.slots };
    delete rest[code];
    const verdict = rules.check(c, rest, qty);
    if (!verdict.legal) return { card: `${qty}x ${label(c)} [${code}]`, reason: verdict.reason };
  }
  return null;
}

/** The choices an investigator's deckbuilding asks for and what this deck picked, in words:
 *  "Secondary Class: guardian". A choice the author never made reads "not chosen". Only a
 *  class the option offers is named: meta is the author's own text. */
export function deckChoices(options: DeckOption[] | undefined, meta: Record<string, string>): string[] {
  const out: string[] = [];
  for (const o of options ?? []) {
    if (o.faction_select) {
      const chosen = meta[o.id ?? "faction_selected"];
      const shown = chosen === undefined ? "not chosen" : o.faction_select.includes(chosen) ? chosen : "not a class it offers";
      out.push(`${o.name ?? "Chosen class"}: ${shown}`);
    }
    if (o.option_select) {
      const chosen = o.option_select.find((s) => s.id === meta.option_selected);
      out.push(`${o.name ?? "Chosen option"}: ${chosen ? (chosen.name ?? chosen.id) : "not chosen"}`);
    }
  }
  return out;
}
