// What experience costs, from the Rules Reference: a card costs its level, at least 1, doubled if
// exceptional, plus any taboo surcharge; upgrading a card to a higher level of the same card
// costs the difference, at least 1; a myriad card's copies of one level are paid for once.
// Removing a card is free. The XP advisor and campaign deck changes both price with this.

import type { CardStore, RawCard } from "./cards";
import { isExceptional } from "./decks";
import { type TabooList, tabooEntry } from "./taboo";

/** What one copy costs to buy outright, before the minimum of 1. */
export function cardPrice(store: CardStore, c: RawCard, taboo?: TabooList): number {
  const t = tabooEntry(store, taboo, c.code);
  return (c.xp ?? 0) * (isExceptional(c, t) ? 2 : 1) + (t?.xp ?? 0);
}

/** A higher level of the same card: same name and subtitle. */
export function isUpgradeOf(from: RawCard, to: RawCard): boolean {
  return from.name === to.name && (from.subname ?? "") === (to.subname ?? "") && (to.xp ?? 0) > (from.xp ?? 0);
}

export type CostLine = { code: string; qty: number; xp: number; upgradedFrom?: string };

/** What adding `add` and removing `remove` costs. Each added copy upgrades a removed copy of the
 *  same card when one is lower, the highest such first; otherwise it is bought. */
export function swapCost(
  store: CardStore,
  add: Record<string, number>,
  remove: Record<string, number>,
  taboo?: TabooList,
): { total: number; lines: CostLine[] } {
  const removed: { card: RawCard; left: number }[] = Object.entries(remove)
    .map(([code, qty]) => ({ card: store.get(code) as RawCard, left: qty }))
    .filter((r) => r.card)
    .sort((a, b) => (b.card.xp ?? 0) - (a.card.xp ?? 0));
  const lines: CostLine[] = [];
  for (const [code, qty] of Object.entries(add)) {
    const card = store.get(code);
    if (!card || qty <= 0) continue;
    const bought = new Map<string | undefined, { qty: number; each: number }>();
    for (let i = 0; i < qty; i++) {
      const from = removed.find((r) => r.left > 0 && isUpgradeOf(r.card, card));
      if (from) from.left--;
      const each = Math.max(1, cardPrice(store, card, taboo) - (from ? cardPrice(store, from.card, taboo) : 0));
      const key = from?.card.code;
      const line = bought.get(key) ?? { qty: 0, each };
      line.qty++;
      bought.set(key, line);
    }
    for (const [upgradedFrom, { qty: n, each }] of bought)
      lines.push({ code, qty: n, xp: card.myriad ? each : each * n, ...(upgradedFrom ? { upgradedFrom } : {}) });
  }
  return { total: lines.reduce((n, l) => n + l.xp, 0), lines };
}
