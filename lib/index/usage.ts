import usage from "./card-usage.json";
import type { CardUsage, UsageCounts } from "./schema";

export const CARD_USAGE = usage as CardUsage;

export type Share = { decks: number; share: number };

function share(counts: UsageCounts | undefined, code: string): Share {
  if (!counts?.decks) return { decks: 0, share: 0 };
  return { decks: counts.decks, share: (counts.cards[code] ?? 0) / counts.decks };
}

export function playRate(investigatorCode: string, classCode: string, cardCode: string, data: CardUsage = CARD_USAGE) {
  return {
    investigator: share(data.investigators[investigatorCode], cardCode),
    class: share(data.classes[classCode], cardCode),
  };
}
