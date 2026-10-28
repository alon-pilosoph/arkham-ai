import { describe, expect, test } from "vitest";
import { getCards } from "@/lib/cards";
import { swapCost } from "@/lib/xp";

const store = await getCards();

describe("swapCost", () => {
  test("buying a card costs its level, at least 1, doubled if exceptional", () => {
    expect(swapCost(store, { "02301": 1 }, {}).total).toBe(5); // Lightning Gun (5)
    expect(swapCost(store, { "01088": 1 }, {}).total).toBe(1); // Emergency Cache, level 0: still 1
    expect(swapCost(store, { "07303": 1 }, {}).total).toBe(6); // Ancestral Knowledge (3), exceptional
  });

  test("upgrading pays the difference for each copy, and removing is free", () => {
    // Shrivelling (0) to Shrivelling (3), both copies
    const up = swapCost(store, { "02154": 2 }, { "01060": 2 });
    expect(up.total).toBe(6);
    expect(up.lines).toEqual([{ code: "02154", qty: 2, xp: 6, upgradedFrom: "01060" }]);
    expect(swapCost(store, { "02306": 1 }, { "02154": 1 }).total).toBe(2); // (3) to (5)
    expect(swapCost(store, {}, { "01020": 1 }).total).toBe(0);
  });

  test("a different card is bought, not upgraded into", () => {
    // Machete out, Lightning Gun in: no discount
    expect(swapCost(store, { "02301": 1 }, { "01020": 1 })).toEqual({ total: 5, lines: [{ code: "02301", qty: 1, xp: 5 }] });
  });

  test("only as many copies as were removed are upgrades; the rest are bought", () => {
    const r = swapCost(store, { "02154": 2 }, { "01060": 1 });
    expect(r.total).toBe(6); // one upgrade (3) and one bought outright (3)
  });

  test("a myriad card's copies are paid for once", () => {
    expect(swapCost(store, { "06199": 3 }, {}).total).toBe(1); // Three Aces (1), three copies
  });
});
