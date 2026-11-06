// A deck read from ArkhamDB, as a campaign keeps it. Shared by the campaign page's lock-in and by
// starting a campaign from chat.

import { type CardStore, getCards } from "../cards";
import { deckXp } from "../deck-links";
import { fetchDeck, parseRef, type RawDeck } from "../decks";
import type { DeckKind } from "../urls";
import type { DeckListJson, Result, SeatTarget } from "./store";

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

/** Reads a deck link, and the target link if there is one, into what a lock-in takes. */
export async function readLock(
  deckLink: string,
  targetLink?: string,
): Promise<Result<ReturnType<typeof lockable> & { target?: SeatTarget }>> {
  const store = await getCards();
  const ref = parseRef(deckLink);
  if (!ref) return { ok: false, error: `${deckLink} isn't an ArkhamDB deck link.` };
  const deck = await fetchDeck(ref);
  if (!deck.ok) return { ok: false, error: `Couldn't read that deck: ${deck.message}` };
  const lock = lockable(store, deck.data.deck, deck.data.kind);
  if (!targetLink) return { ok: true, value: lock };
  const targetRef = parseRef(targetLink);
  const target = targetRef ? await fetchDeck(targetRef) : null;
  if (!target?.ok) return { ok: false, error: "Couldn't read the target deck." };
  return { ok: true, value: { ...lock, target: targetOf(store, target.data.deck, target.data.kind) } };
}
