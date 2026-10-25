import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getCards } from "@/lib/cards";
import { isExceptional } from "@/lib/decks";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { getTaboos, latest, tabooEntry } from "@/lib/taboo";
import { upgrades, upgradesText } from "@/lib/tools/upgrades";
import { DECK, expectOk, mockArkhamDB } from "./helpers";

beforeEach(() => mockArkhamDB());
afterEach(() => vi.unstubAllGlobals());

const store = await getCards();
const plan = async (deck: string, xp: number, taboo = false) =>
  expectOk(await upgrades({ deck, xp, limit: 25 }, { ...DEFAULT_SETTINGS, taboo }));

describe("spending XP on a deck", () => {
  test("upgrading pays the difference in level, for every copy the deck runs", async () => {
    const r = await plan(DECK.lilyChen, 5);
    const safeguard = r.upgrades.find((u) => u.code === "06196"); // Safeguard (2), from Safeguard (0)
    expect(safeguard).toMatchObject({ xpEach: 2, xpAll: 2, from: { label: "Safeguard", qty: 1 } });
    const overpower = r.upgrades.find((u) => u.code === "60126"); // Overpower (2), the deck runs two
    expect(overpower).toMatchObject({ xpEach: 2, xpAll: 4 });
  });

  test("never offers more than the XP there is, or a card the collection lacks", async () => {
    const r = await plan(DECK.lilyChen, 3);
    for (const u of r.upgrades) expect(u.xpEach).toBeLessThanOrEqual(3);
    for (const p of [...r.purchases, ...r.levelZero]) {
      expect(p.xpEach).toBeLessThanOrEqual(3);
      expect(store.inCollection(p.code)).toBe(true);
    }
  });

  test("prices a new card at its level, at least 1, doubled if exceptional, with the taboo surcharge only when on", async () => {
    const taboo = latest(await getTaboos());
    for (const on of [false, true]) {
      const r = await plan(DECK.luciusGalloway, 5, on);
      for (const p of [...r.purchases, ...r.levelZero]) {
        const c = store.get(p.code);
        if (!c) throw new Error(p.code);
        const t = on ? tabooEntry(store, taboo, c.code) : undefined;
        expect(p.xpEach).toBe(Math.max(1, (c.xp ?? 0) * (isExceptional(c, t) ? 2 : 1) + (t?.xp ?? 0)));
        if (!on) expect(p.taboo).toBeUndefined();
      }
    }
  });

  test("lists level 0 cards apart from the leveled ones", async () => {
    const r = await plan(DECK.lilyChen, 5);
    expect(r.purchases.every((p) => p.level > 0)).toBe(true);
    expect(r.levelZero.every((p) => p.level === 0)).toBe(true);
    expect(r.levelZero.length).toBeGreaterThan(0);
  });

  test("never offers a card bought only at deck creation (In the Thick of It, 08125)", async () => {
    for (const deck of [DECK.lilyChen, DECK.luciusGalloway]) {
      const r = await plan(deck, 5);
      expect([...r.purchases, ...r.levelZero].map((p) => p.code)).not.toContain("08125");
    }
  });

  test("offers unmarked customization boxes, within the sheet's 10", async () => {
    const r = await plan(DECK.luciusGalloway, 5);
    // Empirical Hypothesis has none marked; The Raven Quill has 9 of 10, and its one-box options are bought
    expect(r.options.some((o) => o.code === "09041" && o.marked === 0)).toBe(true);
    expect(r.options.filter((o) => o.code === "09042")).toEqual([]);
  });

  test("a name the deck already runs is an upgrade, never a new purchase", async () => {
    const r = await plan(DECK.lilyChen, 5);
    expect([...r.purchases, ...r.levelZero].map((p) => p.name)).not.toContain("Safeguard");
  });

  test("tells the model to name what each new card replaces", async () => {
    expect(upgradesText(await plan(DECK.lilyChen, 5))).toMatch(/name what it replaces/);
  });
});
