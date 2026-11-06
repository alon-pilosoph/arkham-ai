// Imported by the client: keep it free of server modules.

export const ARKHAMDB = "https://arkhamdb.com";

export type DeckKind = "decklist" | "deck";

export function cardUrl(code: string): string {
  return `${ARKHAMDB}/card/${code}`;
}

export function deckUrl(id: number, kind: DeckKind): string {
  return `${ARKHAMDB}/${kind}/view/${id}`;
}

/** The ArkhamDB page of a deck stored as "decklist:123" or "deck:123". */
export function sourceUrl(source: string | null): string | null {
  const m = source?.match(/^(decklist|deck):(\d+)$/);
  return m ? deckUrl(Number(m[2]), m[1] as DeckKind) : null;
}
