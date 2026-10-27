"use client";

import { createContext, type MouseEvent, useContext } from "react";

const CARD_URL = /^https?:\/\/(?:www\.)?arkhamdb\.com\/card\/([0-9a-z]+)\/?$/i;

/** The card code an ArkhamDB card link points to. */
export function cardCode(href: string | undefined): string | undefined {
  return href?.match(CARD_URL)?.[1];
}

export const OpenCardContext = createContext<((code: string) => void) | null>(null);

/** onClick for a link: a card link opens the card dialog instead of ArkhamDB. A modified click
 *  (new tab, new window) still follows the link, and so does any link outside the provider. */
export function useCardClick(href: string | undefined): ((e: MouseEvent<HTMLAnchorElement>) => void) | undefined {
  const open = useContext(OpenCardContext);
  const code = cardCode(href);
  if (!open || !code) return undefined;
  return (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(code);
  };
}
