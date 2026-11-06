// A deck read from ArkhamDB, as a campaign keeps it. Shared by the campaign page's lock-in and by
// starting a campaign from chat.

import type { CardStore } from "../cards";
import { deckXp } from "../deck-links";
import type { RawDeck } from "../decks";
import type { DeckKind } from "../urls";
import type { DeckListJson, SeatTarget } from "./store";

export function lockable(store: CardStore, deck: RawDeck, kind: DeckKind) {
  const map = (x: unknown) => (x && !Array.isArray(x) ? (x as Record<string, number>) : undefined);
  const list: DeckListJson = {
    investigator_code: deck.investigator_code,
    slots: deck.slots,
    sideSlots: map(deck.sideSlots),
    ignoreDeckLimitSlots: map(deck.ignoreDeckLimitSlots),
    meta: typeof deck.meta === "string" ? deck.meta : deck.meta ? JSON.stringify(deck.meta) : undefined,
    taboo_id: deck.taboo_id ?? null,
    description_md: deck.description_md,
  };
  return {
    name: deck.name || "Unnamed deck",
    list,
    investigatorCode: store.canonical(deck.investigator_code),
    source: `${kind}:${deck.id}`,
  };
}

export function targetOf(store: CardStore, deck: RawDeck, kind: DeckKind): SeatTarget {
  return { name: deck.name || "Unnamed deck", source: `${kind}:${deck.id}`, xp: deckXp(store, deck) };
}
