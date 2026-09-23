import path from "node:path";
import faq from "../data/faq.json";
import type { CardFace, Rulings } from "./card-text";
import collection from "./collection.json";
import { cachedLoader } from "./loader";
import { type TabooList, tabooChange, tabooEntry } from "./taboo";

export type RawCard = {
  code: string;
  name: string;
  subname?: string;
  type_code: string;
  faction_code: string;
  faction2_code?: string;
  faction3_code?: string;
  pack_code: string;
  pack_name?: string;
  xp?: number | null;
  cost?: number | null;
  slot?: string;
  traits?: string;
  real_traits?: string;
  text?: string;
  real_text?: string;
  back_text?: string;
  customization_text?: string;
  customization_options?: { xp?: number; real_traits?: string; real_text?: string; tags?: string; deck_limit?: number }[];
  deck_options?: DeckOption[];
  deck_requirements?: unknown;
  restrictions?: { investigator?: Record<string, string> };
  tags?: string;
  subtype_code?: string;
  duplicate_of_code?: string;
  alternate_of_code?: string;
  encounter_code?: string;
  encounter_name?: string;
  errata_date?: { date: string } | null;
  bonded_to?: string;
  deck_limit?: number;
  permanent?: boolean;
  exceptional?: boolean;
  myriad?: boolean;
  is_unique?: boolean;
  health?: number;
  sanity?: number;
  skill_willpower?: number;
  skill_intellect?: number;
  skill_combat?: number;
  skill_agility?: number;
  skill_wild?: number;
  enemy_fight?: number;
  enemy_evade?: number;
  enemy_damage?: number;
  enemy_horror?: number;
  hidden?: boolean;
  url?: string;
};

export type DeckOption = {
  faction?: string[];
  faction_select?: string[];
  level?: { min: number; max: number };
  trait?: string[];
  type?: string[];
  text?: string[];
  tag?: string[];
  uses?: string[];
  slot?: string[];
  not?: boolean;
  limit?: number;
  atleast?: unknown;
  option_select?: DeckOption[];
  deck_size_select?: unknown;
  permanent?: boolean;
  id?: string;
  name?: string;
  error?: string;
  ignore_match?: boolean;
  base_level?: unknown;
};

const DISK_CACHE = path.join(process.cwd(), "data", "cache", "cards_all.json");
const CHAPTER1 = new Set<string>(collection.packs);
const RULINGS = faq as Record<string, { name: string; updated: string; text: string }>;

/** In the order a deck list shows them. */
export const DECK_CARD_TYPES = ["asset", "event", "skill"] as const;

export function isDeckCardType(type: string): boolean {
  return (DECK_CARD_TYPES as readonly string[]).includes(type);
}

export const PLAYER_TYPES = new Set<string>(["investigator", ...DECK_CARD_TYPES]);

export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseCardQuery(query: string): { name: string; level?: number } {
  const m = query.match(/^(.*?)\s*\((\d)\)\s*$/);
  return { name: norm(m ? m[1] : query), level: m ? Number(m[2]) : undefined };
}

function startsAWord(name: string, w: string): boolean {
  return ` ${name}`.includes(` ${w}`);
}

export class CardStore {
  readonly byCode = new Map<string, RawCard>();
  private readonly byName = new Map<string, RawCard[]>();
  private readonly reprints = new Map<string, string[]>();
  private readonly originalOf = new Map<string, string>();

  constructor(cards: RawCard[]) {
    for (const c of cards) this.byCode.set(c.code, c);
    const visible = new Map<string, string | null>();
    for (const c of cards) {
      if (c.hidden || c.duplicate_of_code || c.alternate_of_code) continue;
      const key = identity(c);
      visible.set(key, visible.has(key) ? null : c.code);
    }
    for (const c of cards) {
      const original = this.originalCode(c, visible);
      if (original) {
        this.originalOf.set(c.code, original);
        this.reprints.set(original, [...(this.reprints.get(original) ?? []), c.code]);
        continue;
      }
      const key = norm(c.name);
      const list = this.byName.get(key) ?? [];
      list.push(c);
      this.byName.set(key, list);
    }
  }

  /** ArkhamDB's duplicate_of, or for a hidden promo printing (novella investigators, 98007
   *  Norman Withers) the one visible card with the same identity. */
  private originalCode(c: RawCard, visible: Map<string, string | null>): string | undefined {
    if (c.duplicate_of_code && this.byCode.has(c.duplicate_of_code)) return c.duplicate_of_code;
    return c.hidden ? (visible.get(identity(c)) ?? undefined) : undefined;
  }

  get(code: string): RawCard | undefined {
    return this.byCode.get(code);
  }

  canonical(code: string): string {
    return this.originalOf.get(code) ?? code;
  }

  isReprint(code: string): boolean {
    return this.originalOf.has(code);
  }

  printings(code: string): string[] {
    const orig = this.canonical(code);
    return [orig, ...(this.reprints.get(orig) ?? [])];
  }

  versions(code: string): RawCard[] {
    const c = this.byCode.get(this.canonical(code));
    if (!c) return [];
    return sortVersions(this.byName.get(norm(c.name)) ?? [c]);
  }

  namesMatching(q: string): RawCard[][] {
    return [...this.byName.values()].filter((group) => norm(group[0].name) === q);
  }

  allNames(): IterableIterator<[string, RawCard[]]> {
    return this.byName.entries();
  }

  find(query: string): { name: string; level?: number; groups: RawCard[][] } {
    const { name, level } = parseCardQuery(query);
    const words = name.split(" ").filter(Boolean);
    // words.every() is vacuously true, so a wordless query like "(3)" would match every name.
    if (!words.length) return { name, level, groups: [] };
    let groups = this.namesMatching(name);
    if (!groups.length)
      groups = [...this.byName.entries()].filter(([n]) => words.every((w) => startsAWord(n, w))).map(([, g]) => g);
    return { name, level, groups };
  }

  ownedPrintings(code: string): string[] {
    return this.printings(code).filter((p) => {
      const c = this.byCode.get(p);
      return c ? CHAPTER1.has(c.pack_code) : false;
    });
  }

  inCollection(code: string): boolean {
    return this.ownedPrintings(code).length > 0;
  }

  /** data/faq.json holds a card's rulings as one Markdown list, one Q&A per "- " item. */
  rulings(code: string): Rulings | undefined {
    for (const p of this.printings(code)) {
      const r = RULINGS[p];
      if (r) return { updated: r.updated, items: r.text.replace(/^- /, "").split(/\n- /) };
    }
    return undefined;
  }
}

function identity(c: RawCard): string {
  return [c.name, c.subname ?? "", c.faction_code, c.type_code, c.xp ?? 0].join("|");
}

export function sortVersions(cards: RawCard[]): RawCard[] {
  return [...cards].sort(
    (a, b) =>
      Number(!!a.encounter_code) - Number(!!b.encounter_code) ||
      (a.xp ?? 0) - (b.xp ?? 0) ||
      (a.subname ?? "").localeCompare(b.subname ?? "") ||
      a.code.localeCompare(b.code),
  );
}

export const getCards = cachedLoader<RawCard[], CardStore>({
  what: "the card set",
  envVar: "ARKHAM_CARDS_FILE",
  file: DISK_CACHE,
  path: "/api/public/cards/?encounter=1",
  timeoutMs: 90_000,
  parse: (cards) => new CardStore(cards),
});

export function cleanText(t?: string): string {
  return (t ?? "")
    .replace(/<\/?(b|i|em|strong|u)>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\s*\n\s*/g, " | ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function icons(c: RawCard): string[] {
  const out: string[] = [];
  for (const k of ["willpower", "intellect", "combat", "agility", "wild"] as const) {
    for (let i = 0; i < (c[`skill_${k}`] ?? 0); i++) out.push(k);
  }
  return out;
}

export function classes(c: RawCard): string[] {
  return [c.faction_code, c.faction2_code, c.faction3_code].filter((f): f is string => !!f);
}

export function label(c: RawCard): string {
  const sub = c.subname ? `: ${c.subname}` : "";
  return `${c.name}${sub}${c.xp ? ` (${c.xp})` : ""}`;
}

export function cardFace(store: CardStore, c: RawCard, taboo?: TabooList): CardFace {
  const t = tabooEntry(store, taboo, c.code);
  return {
    code: c.code,
    name: c.name,
    label: label(c),
    level: c.xp ?? 0,
    type: c.type_code,
    classes: classes(c),
    cost: c.cost,
    slot: c.slot,
    icons: icons(c),
    text: cleanText(c.text),
    ...(t && taboo ? { taboo: tabooChange(taboo, t) } : {}),
  };
}
