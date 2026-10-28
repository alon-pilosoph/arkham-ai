// A seat's deck as a text file ArkhamDB imports (My decks → Import Deck → File): the
// investigator's name on the first line, then a line per card, "2x Name: Subtitle [level]". ArkhamDB
// finds each card by its name, subtitle and level, so the level is always given.

import type { CardStore } from "../cards";
import type { DeckListJson } from "./store";

export function arkhamDbText(store: CardStore, deck: { list: DeckListJson; campaignCards: Record<string, number> }): string {
  const slots: Record<string, number> = { ...deck.list.slots };
  for (const [code, qty] of Object.entries(deck.campaignCards)) slots[code] = (slots[code] ?? 0) + qty;
  const named = (code: string) => {
    const c = store.get(code);
    return c ? `${c.name}${c.subname ? `: ${c.subname}` : ""}` : code;
  };
  const lines = Object.entries(slots)
    .filter(([, qty]) => qty > 0)
    .map(([code, qty]) => ({ name: named(code), line: `${qty}x ${named(code)} [${store.get(code)?.xp ?? 0}]` }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.line.localeCompare(b.line))
    .map((x) => x.line);
  // the investigator's line is read as a bare name: a subtitle there would keep it from matching
  const investigator = store.get(deck.list.investigator_code)?.name ?? deck.list.investigator_code;
  return [investigator, ...lines, ""].join("\n");
}

/** A file name for the download: the deck's name, without characters file systems refuse. */
export function exportFileName(name: string): string {
  return `${name.replace(/[^\p{L}\p{N} ._-]+/gu, "").trim() || "deck"}.txt`;
}
