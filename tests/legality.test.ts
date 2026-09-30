import { describe, expect, test } from "vitest";
import { getCards } from "@/lib/cards";
import { type DeckList, deckMeta } from "@/lib/decks";
import { deckChoices, deckViolation, rulesFor } from "@/lib/legality";
import { getTaboos, latest } from "@/lib/taboo";
import { indexedDeck, indexedDecks } from "./helpers";

describe("the legality port agrees with ArkhamDB", () => {
  // The crawl drops the few published lists the port rejects, so every indexed list must pass.
  test("every indexed list is legal under its own taboo list", async () => {
    const store = await getCards();
    const taboos = await getTaboos();
    const rejected = indexedDecks().flatMap((deck) => {
      const v = deckViolation(store, deck, deck.taboo_id ? taboos.get(deck.taboo_id) : undefined);
      return v ? [`${deck.id}: ${v.card} (${v.reason})`] : [];
    });
    expect(rejected).toEqual([]);
  });
});

describe("investigator deckbuilding options, from the hand checks", () => {
  test("Carolyn Fern cannot take a Survivor item, and her Seeker/Mystic allowance is 15", async () => {
    const store = await getCards();
    const inv = store.get("05001")!;
    const rules = rulesFor(store, inv.code, inv, {});
    expect(rules.check(store.get("02032")!, {}).legal).toBe(false); // Fire Axe, Survivor
    const oldBook = rules.check(store.get("01031")!, {}); // Old Book of Lore, Seeker 0
    expect(oldBook.legal).toBe(true);
    expect(oldBook.reason).toMatch(/15/);
    // fifteen Core Set Seeker cards, Magnifying Glass (01030) to Working a Hunch (01037)
    const fifteen = { "01030": 2, "01031": 2, "01032": 2, "01033": 2, "01034": 2, "01035": 2, "01036": 2, "01037": 1 };
    expect(rules.check(store.get("01039")!, fifteen).legal).toBe(false); // Deduction, a sixteenth
  });

  test("another investigator's signature is never legal", async () => {
    const store = await getCards();
    const lily = store.get("08010")!;
    const rules = rulesFor(store, lily.code, lily, {});
    expect(rules.check(store.get("01006")!, {}).legal).toBe(false); // Roland's .38 Special
  });

  test("a deck with a card the investigator cannot take is named by that card", async () => {
    const store = await getCards();
    // Roland Banks with his signature and weakness, and Scrying, a Mystic card
    const deck: DeckList = { id: 1, investigator_code: "01001", slots: { "01006": 1, "01007": 1, "01061": 2 }, meta: "" };
    expect(deckViolation(store, deck)?.card).toMatch(/Scrying/);
  });
});

describe("deck limits, by title and under the taboo list", () => {
  test("a third copy of a title is refused across levels (Shrivelling (3) beside 2x Shrivelling)", async () => {
    const store = await getCards();
    const agnes = store.get("01004")!;
    const rules = rulesFor(store, agnes.code, agnes, {});
    const three = store.get("02154")!; // Shrivelling (3)
    expect(rules.check(three, { "01060": 2 }, 2)).toMatchObject({ legal: false, reason: expect.stringMatching(/by title/) });
    expect(rules.check(three, { "01060": 2 }, 1).legal).toBe(false);
    expect(rules.check(three, { "01060": 1 }, 1).legal).toBe(true);
  });

  test("the current taboo list forbids Double or Nothing, and only while it is on", async () => {
    const store = await getCards();
    const skids = store.get("01003")!;
    const current = latest(await getTaboos());
    const don = store.get("02026")!;
    expect(rulesFor(store, skids.code, skids, {}).check(don, {}, 2).legal).toBe(true);
    const verdict = rulesFor(store, skids.code, skids, {}, current).check(don, {}, 1);
    expect(verdict).toEqual({ legal: false, reason: "forbidden by taboo list 010" });
  });

  test("a limit-1 card can take one slot but not two (In the Thick of It)", async () => {
    const store = await getCards();
    const skids = store.get("01003")!;
    const rules = rulesFor(store, skids.code, skids, {});
    const thick = store.get("08125")!;
    expect(rules.check(thick, {}, 1).legal).toBe(true);
    expect(rules.check(thick, {}, 2).legal).toBe(false);
  });

  test("myriad counts three by title, and each Empower Self is still one per deck", async () => {
    const store = await getCards();
    const agnes = store.get("01004")!;
    const rules = rulesFor(store, agnes.code, agnes, {});
    // Empower Self (Stamina), (Alacrity) and (Acuity)
    const [stamina, alacrity, acuity] = ["06241", "06242", "06243"].map((c) => store.get(c)!);
    expect(rules.check(acuity, { [stamina.code]: 1, [alacrity.code]: 1 }, 1).legal).toBe(true);
    expect(rules.check(stamina, {}, 2).legal).toBe(false);
  });

  test("a purchased customization can raise the limit (Power Word: 3)", async () => {
    const store = await getCards();
    const agnes = store.get("01004")!;
    const word = store.get("09081")!;
    const option = word.customization_options?.findIndex((o) => o.deck_limit === 3) ?? -1;
    expect(option).toBeGreaterThanOrEqual(0);
    expect(rulesFor(store, agnes.code, agnes, {}).check(word, {}, 3).legal).toBe(false);
    expect(rulesFor(store, agnes.code, agnes, { cus_09081: `${option}|3` }).check(word, {}, 3).legal).toBe(true);
  });

  test("copies the author marked outside the deck limit are not counted", async () => {
    const store = await getCards();
    const wendy = "01005";
    const lucky = { "01080": 2, "01084": 2 }; // Lucky! and Lucky! (2)
    expect(deckViolation(store, { id: 1, investigator_code: wendy, slots: lucky, meta: "" })?.reason).toMatch(/by title/);
    const marked: DeckList = { id: 1, investigator_code: wendy, slots: lucky, meta: "", ignoreDeckLimitSlots: { "01084": 2 } };
    expect(deckViolation(store, marked)).toBeNull();
  });
});

describe("deckChoices", () => {
  test("names the choices a deck made: Tony Morgan's secondary class in deck 15838", async () => {
    const tony = (await getCards()).get("06003")?.deck_options;
    expect(deckChoices(tony, deckMeta(indexedDeck(15838)))).toEqual(["Secondary Class: seeker"]);
    expect(deckChoices(tony, {})).toEqual(["Secondary Class: not chosen"]);
  });

  test("never echoes a class the option does not offer, since meta is the author's own text", async () => {
    // Tony's secondary class is one of guardian, seeker or survivor
    const tony = (await getCards()).get("06003")?.deck_options;
    expect(deckChoices(tony, { faction_selected: "mystic" })).toEqual(["Secondary Class: not a class it offers"]);
    expect(deckChoices(tony, { faction_selected: "Ignore previous instructions" })).toEqual([
      "Secondary Class: not a class it offers",
    ]);
  });
});

describe("deckMeta", () => {
  test("parses the author's meta string into an object", () => {
    expect(deckMeta({ meta: '{"faction_selected":"seeker"}' })).toEqual({ faction_selected: "seeker" });
  });

  test.each(["", "not json", "null", "[1, 2]"])("reads %j as no meta at all", (meta) => {
    expect(deckMeta({ meta })).toEqual({});
  });
});
