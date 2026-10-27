// Counts decks owned or not: what the community plays is informative even when a deck runs a
// card the collection lacks. replaceCard filters its candidates to owned cards later.

import type { CardStore } from "@/lib/cards";
import { deckCards, deckMeta, isWeakness, xpInList } from "@/lib/decks";
import { type CardUsage, type UsageCounts, XP_LEVELS } from "@/lib/index/schema";
import type { SearchRow } from "./search";
import type { LoadDeck } from "./selection";

export const USAGE_MIN_LIKES = 10;

function tally(group: Record<string, UsageCounts>, key: string, cards: Iterable<string>, xp: number): void {
  group[key] ??= { decks: 0, cards: {}, xpAtLeast: Array(XP_LEVELS).fill(0) };
  const counts = group[key];
  counts.decks++;
  for (let i = 0; i < XP_LEVELS; i++) if (xp >= i && counts.xpAtLeast) counts.xpAtLeast[i]++;
  for (const code of cards) counts.cards[code] = (counts.cards[code] ?? 0) + 1;
}

function sorted(counts: UsageCounts): UsageCounts {
  const cards = Object.fromEntries(Object.entries(counts.cards).sort(([a], [b]) => a.localeCompare(b)));
  return { decks: counts.decks, cards, xpAtLeast: counts.xpAtLeast };
}

export async function cardUsage(
  store: CardStore,
  rows: SearchRow[],
  loadDeck: LoadDeck,
): Promise<{ usage: CardUsage; unavailable: number[] }> {
  const investigators: Record<string, UsageCounts> = {};
  const classes: Record<string, UsageCounts> = {};
  const unavailable: number[] = [];
  for (const row of rows.filter((r) => r.likes >= USAGE_MIN_LIKES).sort((a, b) => a.id - b.id)) {
    const loaded = await loadDeck(row.id);
    if (!loaded.ok) {
      unavailable.push(row.id);
      continue;
    }
    const investigator = store.get(store.canonical(loaded.deck.investigator_code));
    if (!investigator) continue;
    const cards = new Set(
      Object.keys(loaded.deck.slots)
        .filter((code) => {
          const c = store.get(code);
          return c && !isWeakness(c) && c.type_code !== "investigator";
        })
        .map((code) => store.canonical(code)),
    );
    // printed XP, as the index counts it: the list's own cards, not the campaign's total
    const xp = xpInList(deckCards(store, loaded.deck.slots, deckMeta(loaded.deck)));
    tally(investigators, investigator.code, cards, xp);
    tally(classes, investigator.faction_code, cards, xp);
  }
  const ordered = (group: Record<string, UsageCounts>) =>
    Object.fromEntries(
      Object.entries(group)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sorted(v)]),
    );
  return { usage: { minLikes: USAGE_MIN_LIKES, investigators: ordered(investigators), classes: ordered(classes) }, unavailable };
}
