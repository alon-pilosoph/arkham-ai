// Imported by the client: keep it free of server modules.

export const ARKHAMDB = "https://arkhamdb.com";

export type DeckKind = "decklist" | "deck";

export function cardUrl(code: string): string {
  return `${ARKHAMDB}/card/${code}`;
}

export function deckUrl(id: number, kind: DeckKind): string {
  return `${ARKHAMDB}/${kind}/view/${id}`;
}
