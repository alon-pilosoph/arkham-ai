import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ARCHETYPES } from "@/lib/archetypes";
import { getCards, norm } from "@/lib/cards";
import { deckCards, deckMeta, xpInList } from "@/lib/decks";
import { DECK_INDEX } from "@/lib/index/decks";
import { CARD_USAGE } from "@/lib/index/usage";
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
});
