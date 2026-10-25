import usage from "./card-usage.json";
import { type CardUsage, type UsageCounts, XP_LEVELS } from "./schema";

export const CARD_USAGE = usage as CardUsage;

/** `decks` is the denominator: the liked decks that could run the card, those whose list holds at
 *  least `minXp`, its level. A published list is one moment in a campaign, and a starting deck
 *  can't hold a level 5 card. */
export type Share = { decks: number; share: number; minXp: number };

function share(counts: UsageCounts | undefined, code: string, level: number): Share {
  const minXp = Math.min(Math.max(0, level), XP_LEVELS - 1);
  // data built before xpAtLeast existed counts every deck
  const decks = counts?.xpAtLeast?.[minXp] ?? counts?.decks ?? 0;
  if (!decks) return { decks: 0, share: 0, minXp };
  return { decks, share: Math.min(1, (counts?.cards[code] ?? 0) / decks), minXp };
}

export function playRate(investigatorCode: string, classCode: string, cardCode: string, level = 0, data: CardUsage = CARD_USAGE) {
  return {
    investigator: share(data.investigators[investigatorCode], cardCode, level),
    class: share(data.classes[classCode], cardCode, level),
  };
}

/** "40% of 5 with 3+ XP": the share and the decks it is of, for tool text. */
export function shareText(s: Share): string {
  const of = `${s.decks}${s.minXp ? ` with ${s.minXp}+ XP` : ""}`;
  return s.decks ? `${Math.round(100 * s.share)}% of ${of}` : `none of ${of}`;
}
