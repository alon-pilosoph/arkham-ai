import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ARCHETYPES } from "@/lib/archetypes";
import { getCards, norm } from "@/lib/cards";
import { deckCards, deckMeta, xpInList } from "@/lib/decks";
import { DECK_INDEX } from "@/lib/index/decks";
import { CARD_USAGE, playRate } from "@/lib/index/usage";
import { getTaboos, latest } from "@/lib/taboo";
import { DECKS_PER_INVESTIGATOR, ownedInvestigators } from "@/pipeline/selection";
import { indexedDecks } from "./helpers";

const DECKS = new Map(indexedDecks().map((d) => [d.id, d]));

describe("deck index rows", () => {
  test("hold one row per deck, and the fixture holds every indexed list", () => {
    const ids = DECK_INDEX.map((r) => r.deckId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(DECKS.keys()));
  });

  test("count printed and current-taboo XP as the deck tool does", async () => {
    const store = await getCards();
    const taboo = latest(await getTaboos());
    const wrong: string[] = [];
    for (const row of DECK_INDEX) {
      const deck = DECKS.get(row.deckId)!;
      const printed = xpInList(deckCards(store, deck.slots, deckMeta(deck)));
      const tabooed = xpInList(deckCards(store, deck.slots, deckMeta(deck), taboo));
      if (printed !== row.xp || tabooed !== row.xpTaboo)
        wrong.push(`${row.deckId}: ${printed}/${tabooed} vs ${row.xp}/${row.xpTaboo}`);
    }
    expect(wrong).toEqual([]);
  });

  // Summaries are shown with the taboo list off too, where it must never come up.
  test("have summaries that never mention the taboo list", () => {
    expect(DECK_INDEX.filter((r) => /taboo/i.test(r.summary)).map((r) => r.deckId)).toEqual([]);
  });

  test("list the deck's own cards, folded to their original printing", async () => {
    const store = await getCards();
    for (const row of DECK_INDEX) {
      const own = new Set(Object.keys(DECKS.get(row.deckId)!.slots).map((c) => store.canonical(c)));
      expect(row.cards).toEqual([...own].sort());
    }
  });

  test("every owned investigator has decks, and none has more than DECKS_PER_INVESTIGATOR", async () => {
    const counts = new Map<string, number>();
    for (const r of DECK_INDEX) counts.set(r.investigatorCode, (counts.get(r.investigatorCode) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(DECKS_PER_INVESTIGATOR);
    expect(new Set(counts.keys())).toEqual(new Set(ownedInvestigators(await getCards()).keys()));
  });
});

describe("archetypes", () => {
  test("every example names a card the collection holds", async () => {
    const store = await getCards();
    const missing = Object.values(ARCHETYPES)
      .flatMap((a) => a.examples)
      .filter((name) => !store.namesMatching(norm(name)).some((group) => group.some((c) => store.inCollection(c.code))));
    expect(missing).toEqual([]);
  });

  test("docs/archetypes.md mirrors the definitions", () => {
    const doc = fs.readFileSync(path.join(import.meta.dirname, "..", "docs", "archetypes.md"), "utf8");
    for (const [name, a] of Object.entries(ARCHETYPES)) {
      expect(doc).toContain(`| ${name} | ${a.what} | ${a.examples.join(", ")} |`);
    }
  });

  test("every archetype is used by at least one indexed deck", () => {
    const used = new Set(DECK_INDEX.flatMap((r) => r.archetypes));
    expect(Object.keys(ARCHETYPES).filter((a) => !used.has(a as never))).toEqual([]);
  });
});

describe("card play rates", () => {
  test("counts only real decks, and never more of a card than there are decks", () => {
    for (const scope of [CARD_USAGE.investigators, CARD_USAGE.classes]) {
      for (const counts of Object.values(scope)) {
        expect(counts.decks).toBeGreaterThan(0);
        for (const n of Object.values(counts.cards)) expect(n).toBeLessThanOrEqual(counts.decks);
      }
    }
  });

  test("counts the decks that could hold each XP level, fewer at each level up", () => {
    for (const scope of [CARD_USAGE.investigators, CARD_USAGE.classes]) {
      for (const counts of Object.values(scope)) {
        if (!counts.xpAtLeast) continue; // data built before XP was recorded
        expect(counts.xpAtLeast[0]).toBe(counts.decks);
        for (let i = 1; i < counts.xpAtLeast.length; i++)
          expect(counts.xpAtLeast[i]).toBeLessThanOrEqual(counts.xpAtLeast[i - 1]);
      }
    }
  });

  test("rates a leveled card against the decks with enough XP to hold it, not the starting decks", () => {
    // 10 liked decks, 4 of them holding 3 or more XP; 2 of those run a level 3 card
    const data = {
      minLikes: 10,
      investigators: { "01001": { decks: 10, cards: { "02154": 2, "01060": 5 }, xpAtLeast: [10, 8, 6, 4, 3, 2] } },
      classes: {},
    };
    expect(playRate("01001", "guardian", "02154", 3, data).investigator).toEqual({ decks: 4, share: 0.5, minXp: 3 });
    expect(playRate("01001", "guardian", "01060", 0, data).investigator).toEqual({ decks: 10, share: 0.5, minXp: 0 });
    // data without XP counts falls back to every deck
    const old = { ...data, investigators: { "01001": { decks: 10, cards: { "02154": 2 } } } };
    expect(playRate("01001", "guardian", "02154", 3, old).investigator).toEqual({ decks: 10, share: 0.2, minXp: 3 });
  });
});
