// Shared by the crawl (fetches decklists as needed) and the index build (cache only), so the two
// can never disagree about the selection.

import type { CardStore } from "@/lib/cards";
import { investigatorSides, type RawDeck } from "@/lib/decks";
import { deckViolation } from "@/lib/legality";
import type { TabooList } from "@/lib/taboo";
import type { SearchRow } from "./search";

export const DECKS_PER_INVESTIGATOR = 10;

export const MIN_LIKES = 1;

// Jaccard over distinct cards. On the 2026-09 crawl, pairs at 0.85+ were republished starter
// decks and versions of one guide; pairs below were different builds.
export const SAME_LIST_OVERLAP = 0.85;

export type Selected = { row: SearchRow; deck: RawDeck };

export type Skip =
  | { reason: "not owned"; card: string }
  | { reason: "illegal"; card: string; rule: string }
  | { reason: "same list"; as: number }
  | { reason: "unavailable"; message: string };

export type InvestigatorSelection = {
  code: string;
  name: string;
  decks: Selected[];
  skipped: { id: number; likes: number; skip: Skip }[];
};

export type LoadDeck = (id: number) => Promise<{ ok: true; deck: RawDeck } | { ok: false; message: string }>;

export function byLikes(a: SearchRow, b: SearchRow): number {
  return b.likes - a.likes || b.favorites - a.favorites || a.id - b.id;
}

export function unownedCard(store: CardStore, deck: RawDeck): string | null {
  const { inv, ability, options } = investigatorSides(store, deck);
  const sides = [inv?.code ?? deck.investigator_code, ability?.code, options?.code].filter((c): c is string => !!c);
  return [...sides, ...Object.keys(deck.slots)].find((code) => !store.inCollection(code)) ?? null;
}

export function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const code of a) if (b.has(code)) shared++;
  return shared / (a.size + b.size - shared);
}

function cardPool(store: CardStore, deck: RawDeck): Set<string> {
  return new Set(Object.keys(deck.slots).map((code) => store.canonical(code)));
}

// Hidden investigators are promo reprints or card backs (Lost Homunculus), never a choice.
export function ownedInvestigators(store: CardStore): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of store.byCode.values()) {
    const playable = c.type_code === "investigator" && !c.encounter_code && !c.alternate_of_code && !c.hidden;
    if (playable && !store.isReprint(c.code) && store.inCollection(c.code)) out.set(c.code, c.name);
  }
  return out;
}

export async function selectForInvestigator(
  store: CardStore,
  taboos: Map<number, TabooList>,
  investigator: { code: string; name: string },
  rows: SearchRow[],
  loadDeck: LoadDeck,
): Promise<InvestigatorSelection> {
  const result: InvestigatorSelection = { ...investigator, decks: [], skipped: [] };
  const pools: { id: number; pool: Set<string> }[] = [];
  for (const row of [...rows].sort(byLikes)) {
    if (result.decks.length === DECKS_PER_INVESTIGATOR || row.likes < MIN_LIKES) break;
    const skip = (s: Skip) => result.skipped.push({ id: row.id, likes: row.likes, skip: s });
    const loaded = await loadDeck(row.id);
    if (!loaded.ok) {
      skip({ reason: "unavailable", message: loaded.message });
      continue;
    }
    const { deck } = loaded;
    const unowned = unownedCard(store, deck);
    if (unowned) {
      skip({ reason: "not owned", card: unowned });
      continue;
    }
    const violation = deckViolation(store, deck, deck.taboo_id ? taboos.get(deck.taboo_id) : undefined);
    if (violation) {
      skip({ reason: "illegal", card: violation.card, rule: violation.reason });
      continue;
    }
    const pool = cardPool(store, deck);
    const twin = pools.find((p) => overlap(p.pool, pool) >= SAME_LIST_OVERLAP);
    if (twin) {
      skip({ reason: "same list", as: twin.id });
      continue;
    }
    pools.push({ id: row.id, pool });
    result.decks.push({ row, deck });
  }
  return result;
}

export async function selectIndex(
  store: CardStore,
  taboos: Map<number, TabooList>,
  rows: SearchRow[],
  loadDeck: LoadDeck,
): Promise<InvestigatorSelection[]> {
  const rowsByInvestigator = new Map<string, SearchRow[]>();
  for (const row of rows) {
    const code = store.canonical(row.investigatorCode);
    const rows = rowsByInvestigator.get(code);
    if (rows) rows.push(row);
    else rowsByInvestigator.set(code, [row]);
  }
  const out: InvestigatorSelection[] = [];
  const investigators = [...ownedInvestigators(store)].sort(([a], [b]) => a.localeCompare(b));
  for (const [code, name] of investigators) {
    out.push(await selectForInvestigator(store, taboos, { code, name }, rowsByInvestigator.get(code) ?? [], loadDeck));
  }
  return out;
}
