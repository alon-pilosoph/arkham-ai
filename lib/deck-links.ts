// Other versions of a deck that its guide links to. A published deck is often the finished one,
// and its description links the version to start from.

import { type CardStore, getCards } from "./cards";
import { deckCards, deckMeta, fetchDeck, type RawDeck, xpInList } from "./decks";
import type { DeckKind } from "./urls";
import { deckUrl } from "./urls";

const LINK = /arkhamdb\.com\/(decklist|deck)\/(?:view\/|edit\/)?(\d+)/g;
/** A guide can link dozens of decks; the version links come early, and each one is a fetch. */
const MAX_LINKS = 6;

export type LinkedDeck = { url: string; source: string; name: string; xp: number };

export const deckXp = (store: CardStore, deck: RawDeck) => xpInList(deckCards(store, deck.slots, deckMeta(deck)));

/** The decks a guide links that are for the same investigator, lowest XP first. */
export async function linkedVersions(deck: RawDeck): Promise<LinkedDeck[]> {
  const found = new Map<string, { id: number; kind: DeckKind }>();
  for (const [, kind, id] of (deck.description_md ?? "").matchAll(LINK))
    if (Number(id) !== deck.id) found.set(`${kind}:${id}`, { id: Number(id), kind: kind as DeckKind });
  if (!found.size) return [];
  const store = await getCards();
  const fetched = await Promise.all([...found.values()].slice(0, MAX_LINKS).map(fetchDeck));
  return fetched
    .flatMap((r) => {
      if (!r.ok) return [];
      const { deck: d, kind } = r.data;
      if (store.canonical(d.investigator_code) !== store.canonical(deck.investigator_code)) return [];
      return [{ url: deckUrl(d.id, kind), source: `${kind}:${d.id}`, name: d.name || "Unnamed deck", xp: deckXp(store, d) }];
    })
    .sort((a, b) => a.xp - b.xp);
}

/** The linked versions a player could start from: those with less XP than this deck. */
export async function startingVersions(deck: RawDeck): Promise<LinkedDeck[]> {
  const store = await getCards();
  const own = deckXp(store, deck);
  return (await linkedVersions(deck)).filter((v) => v.xp < own);
}
