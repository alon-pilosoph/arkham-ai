import { describe, expect, test } from "vitest";
import { getCards } from "@/lib/cards";
import type { RawDeck } from "@/lib/decks";
import { getTaboos } from "@/lib/taboo";
import type { SearchRow } from "@/pipeline/search";
import {
  byLikes,
  DECKS_PER_INVESTIGATOR,
  type LoadDeck,
  overlap,
  ownedInvestigators,
  selectForInvestigator,
} from "@/pipeline/selection";
import { indexedDecks } from "./helpers";

const ROLAND = { code: "01001", name: "Roland Banks" };

function row(id: number, likes: number): SearchRow {
  return {
    id,
    name: `deck ${id}`,
    likes,
    favorites: 0,
    comments: 0,
    authorId: 1,
    authorReputation: 1,
    date: "2024-01-01",
    investigatorCode: ROLAND.code,
    investigatorName: ROLAND.name,
    tags: [],
  };
}

function rolandDecks(): RawDeck[] {
  return indexedDecks()
    .filter((d) => d.investigator_code === ROLAND.code)
    .map((d) => ({ ...d, name: `deck ${d.id}` }));
}

/** Runs the selection over `decks` with the likes given, plus `extra` rows of 500 likes each that load
 *  as the deck mapped to them, or fail to load when it is null. */
async function select(decks: RawDeck[], likes: (d: RawDeck, i: number) => number, extra: Record<number, RawDeck | null> = {}) {
  const byId = new Map<number, RawDeck | null>([
    ...decks.map((d) => [d.id, d] as const),
    ...Object.entries(extra).map(([k, v]) => [Number(k), v] as const),
  ]);
  const load: LoadDeck = async (id) => {
    const deck = byId.get(id);
    return deck ? { ok: true, deck } : { ok: false, message: "404" };
  };
  const rows = [...decks.map((d, i) => row(d.id, likes(d, i))), ...Object.keys(extra).map((id) => row(Number(id), 500))];
  return selectForInvestigator(await getCards(), await getTaboos(), ROLAND, rows, load);
}

describe("selectForInvestigator", () => {
  test("keeps every liked, legal list, most liked first", async () => {
    const decks = rolandDecks();
    expect(decks.length).toBe(DECKS_PER_INVESTIGATOR);
    const r = await select(decks, (_, i) => i + 1);
    expect(r.decks.map((d) => d.row.id)).toEqual(decks.map((d) => d.id).reverse());
  });

  test("keeps a republished list once, under its most liked copy", async () => {
    const [first, ...rest] = rolandDecks();
    const copy = { ...first, id: 900001 };
    const r = await select([first, ...rest.slice(0, 3)], (_, i) => 100 - i, { 900001: copy });
    // the copy's row has 500 likes, so it is read first and the original is the duplicate
    expect(r.decks[0].row.id).toBe(900001);
    expect(r.skipped).toContainEqual({ id: first.id, likes: 100, skip: { reason: "same list", as: 900001 } });
  });

  test("passes over a list the collection cannot build, the rules forbid, or ArkhamDB cannot serve, saying why", async () => {
    const [base] = rolandDecks();
    const unowned = { ...base, id: 900002, slots: { ...base.slots, "12017": 1 } }; // Endurance, 2026 Core Set only
    const illegal = { ...base, id: 900003, slots: { ...base.slots, "01061": 2 } }; // Scrying, Mystic
    const r = await select([], () => 0, { 900002: unowned, 900003: illegal, 900004: null });
    const why = Object.fromEntries(r.skipped.map((s) => [s.id, s.skip]));
    expect(why[900002]).toEqual({ reason: "not owned", card: "12017" });
    expect(why[900003]).toMatchObject({ reason: "illegal", card: expect.stringMatching(/Scrying/) });
    expect(why[900004]).toEqual({ reason: "unavailable", message: "404" });
    expect(r.decks).toEqual([]);
  });

  test("never reads a list nobody liked", async () => {
    const decks = rolandDecks().slice(0, 2);
    const r = await select(decks, (_, i) => 1 - i);
    expect(r.decks.map((d) => d.row.likes)).toEqual([1]);
  });
});

describe("overlap", () => {
  test("is Jaccard similarity over distinct cards", () => {
    expect(overlap(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]))).toBe(0.5);
    expect(overlap(new Set(["a"]), new Set(["a"]))).toBe(1);
  });
});

describe("byLikes", () => {
  test("breaks a tie in likes by favorites, then by the older deck", () => {
    const a = { ...row(2, 5), favorites: 1 };
    const b = { ...row(1, 5), favorites: 1 };
    const c = { ...row(3, 5), favorites: 2 };
    expect([a, b, c].sort(byLikes).map((r) => r.id)).toEqual([3, 1, 2]);
  });
});

describe("ownedInvestigators", () => {
  test("folds promo reprints and skips card backs and parallels", async () => {
    const store = await getCards();
    const owned = ownedInvestigators(store);
    expect(owned.size).toBe(66);
    expect(store.canonical("98007")).toBe("08004"); // the novella Norman Withers
    expect(owned.has("98007")).toBe(false);
    expect([...owned.keys()].some((c) => c.startsWith("90"))).toBe(false);
    expect([...owned.values()]).not.toContain("Lost Homunculus");
  });
});
