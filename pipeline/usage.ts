// Counts decks owned or not: what the community plays is informative even when a deck runs a
// card the collection lacks. replaceCard filters its candidates to owned cards later.

import type { CardStore } from "@/lib/cards";
import { isWeakness } from "@/lib/decks";
import type { CardUsage, UsageCounts } from "@/lib/index/schema";
import type { SearchRow } from "./search";
import type { LoadDeck } from "./selection";

export const USAGE_MIN_LIKES = 10;

function tally(group: Record<string, UsageCounts>, key: string, cards: Iterable<string>): void {
  group[key] ??= { decks: 0, cards: {} };
  const counts = group[key];
  counts.decks++;
  for (const code of cards) counts.cards[code] = (counts.cards[code] ?? 0) + 1;
}

function sorted(counts: UsageCounts): UsageCounts {
  const cards = Object.fromEntries(Object.entries(counts.cards).sort(([a], [b]) => a.localeCompare(b)));
  return { decks: counts.decks, cards };
}

export async function cardUsage(
  store: CardStore,
  census: SearchRow[],
  loadDeck: LoadDeck,
): Promise<{ usage: CardUsage; unavailable: number[] }> {
  const investigators: Record<string, UsageCounts> = {};
  const classes: Record<string, UsageCounts> = {};
  const unavailable: number[] = [];
  for (const row of census.filter((r) => r.likes >= USAGE_MIN_LIKES).sort((a, b) => a.id - b.id)) {
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
    tally(investigators, investigator.code, cards);
    tally(classes, investigator.faction_code, cards);
  }
  const ordered = (group: Record<string, UsageCounts>) =>
    Object.fromEntries(
      Object.entries(group)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sorted(v)]),
    );
  return { usage: { minLikes: USAGE_MIN_LIKES, investigators: ordered(investigators), classes: ordered(classes) }, unavailable };
}
