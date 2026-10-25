"use client";

import { useSettings } from "@/hooks/use-settings";

/** How a tool row names the deck a call was given, without its number: a saved deck by whose it
 *  is, any other as `fallback` until the result names it. */
export function useDeckLabel(ref: string | undefined, fallback = "the deck"): string {
  const { settings } = useSettings();
  const id = Number(ref?.match(/(\d+)\/?\s*$/)?.[1] ?? ref);
  if (id && settings.myDeck?.id === id) return "your deck";
  if (id && settings.partnerDeck?.id === id) return "your partner's deck";
  return fallback;
}
