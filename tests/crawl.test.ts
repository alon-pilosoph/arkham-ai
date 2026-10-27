import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getCards } from "@/lib/cards";
import type { RawDeck } from "@/lib/decks";
import { getTaboos } from "@/lib/taboo";
import { BudgetExceeded, configureHttp, getText, httpStats, resetHttp, retryAfterMs } from "@/pipeline/http";
import { crossCheck, investigatorCodes, type WalkState, walkIndex } from "@/pipeline/run";
import type { SearchRow } from "@/pipeline/search";
import { DECKS_PER_INVESTIGATOR, type LoadDeck } from "@/pipeline/selection";
import { InvestigatorWalk, LikesWalk } from "@/pipeline/walk";
import { deckRow, descending, FAKE_BASE, type FakeDeck, fakeArkhamDB, page } from "./fake-arkhamdb";
import { indexedDecks } from "./helpers";

beforeEach(() => {
  resetHttp();
  configureHttp({ base: FAKE_BASE, intervalMs: 0, retryDelaysMs: [1, 1] });
});
afterEach(() => resetHttp());

const ROLAND = "01001";

/** 26 decks with 100 down to 75 likes, then six tied at 50 that fill positions 27 to 32, across
 *  the break between pages 1 and 2, then a few with fewer likes. */
function straddling(investigator?: string): FakeDeck[] {
  const inv = investigator ?? ROLAND;
  return [
    ...descending(inv, 1, 100, 26),
    ...Array.from({ length: 6 }, (_, i) => ({ id: 101 + i, likes: 50, investigator: inv })),
    ...descending(inv, 201, 40, 5),
  ];
}

const TIED = [101, 102, 103, 104, 105, 106];
const ids = (rows: SearchRow[]) => rows.map((r) => r.id).sort((a, b) => a - b);

describe("LikesWalk", () => {
  test("a short walk ends on its short page, with every deck seen", async () => {
    fakeArkhamDB(descending(ROLAND, 1, 9, 3));
    const walk = new LikesWalk(ROLAND);
    await walk.next();
    expect(walk.done).toBe(true);
    expect(walk.frontier()).toBe(0);
    expect(ids(walk.rows())).toEqual([1, 2, 3]);
  });

  test("before the end, only the decks above the last page's lowest like count count as seen", async () => {
    fakeArkhamDB(descending(ROLAND, 1, 100, 45));
    const walk = new LikesWalk(ROLAND);
    await walk.next();
    // the page ends at 71 likes, and more decks with 71 may follow on the next
    expect(walk.frontier()).toBe(72);
    expect(walk.rows()).toHaveLength(29);
    await walk.next();
    expect(walk.frontier()).toBe(0);
    expect(walk.rows()).toHaveLength(45);
  });

  test("a tie group across a page break that came back with a deck twice is fetched again until every deck is seen", async () => {
    // each request rotates the tie by one, so page 2 first repeats a deck page 1 showed
    const { calls } = fakeArkhamDB(straddling(), {
      tieOrder: (tied, { request }) => tied.map((_, i) => tied[(i + request - 1) % tied.length]),
    });
    const walk = new LikesWalk(ROLAND);
    await walk.next();
    await walk.next();
    expect(walk.done).toBe(true);
    expect(ids(walk.rows())).toEqual(expect.arrayContaining(TIED));
    expect(walk.stats.refetched).toBeGreaterThan(0);
    expect(walk.stats.dateWalks).toBe(0);
    expect(calls.every((c) => c.includes("sort=likes"))).toBe(true);
  });

  test("a tie that never settles makes the walk read every deck by date, after one refetch that showed nothing new", async () => {
    // page 1 shows the tie in id order, page 2 in reverse: decks 103 and 104 are never on either
    const decks = straddling().map((d, i) => ({ ...d, date: `2024-01-${String(i + 1).padStart(2, "0")}` }));
    fakeArkhamDB(decks, { tieOrder: (tied, { page }) => (page === 1 ? tied : [...tied].reverse()) });
    const walk = new LikesWalk(ROLAND);
    await walk.next();
    await walk.next();
    expect(walk.stats.refetched).toBe(2);
    expect(walk.stats.dateWalks).toBe(1);
    expect(walk.frontier()).toBe(0);
    expect(ids(walk.rows())).toEqual(ids(decks.map((d) => ({ id: d.id }) as SearchRow)));
  });

  test("a tie inside one page needs no refetch", async () => {
    const { calls } = fakeArkhamDB(
      Array.from({ length: 10 }, (_, i) => ({ id: i + 1, likes: 5, investigator: ROLAND })),
      { tieOrder: (tied, { request }) => (request % 2 ? tied : [...tied].reverse()) },
    );
    const walk = new LikesWalk(ROLAND);
    await walk.next();
    expect(walk.rows()).toHaveLength(10);
    expect(calls).toHaveLength(1);
  });

  test("a page whose likes rise is an error, never a silently wrong walk", async () => {
    fakeArkhamDB([], { override: () => new Response(page(deckRow(1, "a", "", ROLAND, 3), deckRow(2, "b", "", ROLAND, 9))) });
    await expect(new LikesWalk(ROLAND).next()).rejects.toThrow(/likes rise from 3 to 9/);
  });
});

describe("InvestigatorWalk", () => {
  test("walks whichever of an investigator's codes still holds the frontier up, and merges them", async () => {
    const { calls } = fakeArkhamDB([...descending("01001", 1, 100, 40), ...descending("98004", 501, 60, 3)]);
    const walk = new InvestigatorWalk(["01001", "98004"]);
    await walk.next(); // 01001, page 1: down to 71 likes
    await walk.next(); // 98004, page 1: everything
    expect(walk.frontier()).toBe(72);
    expect(walk.rows()).toHaveLength(29);
    await walk.next(); // 01001, page 2
    expect(walk.frontier()).toBe(0);
    expect(ids(walk.rows())).toHaveLength(43);
    expect(calls).toEqual([
      "/decklists/find/1?sort=likes&investigator=01001",
      "/decklists/find/1?sort=likes&investigator=98004",
      "/decklists/find/2?sort=likes&investigator=01001",
    ]);
  });
});

describe("walkIndex", () => {
  const roland = () => indexedDecks().filter((d) => d.investigator_code === ROLAND) as RawDeck[];

  /** Roland's ten indexed lists with 200 down to 191 likes, then 25 lists with 9 likes that neither
   *  the selection nor the usage counts need. */
  function rolandDecks(): FakeDeck[] {
    return [
      ...roland().map((list, i) => ({ id: list.id, likes: 200 - i, investigator: ROLAND, list })),
      ...Array.from({ length: 25 }, (_, i) => ({ id: 800_000 + i, likes: 9, investigator: ROLAND })),
    ];
  }

  function loader(decks: FakeDeck[]) {
    const asked: number[] = [];
    const load: LoadDeck = async (id) => {
      asked.push(id);
      const list = decks.find((d) => d.id === id)?.list;
      return list ? { ok: true, deck: list } : { ok: false, message: "not in the fake" };
    };
    return { asked, load };
  }

  test("walks each investigator only as deep as its ten decks need, and the walks agree", async () => {
    const decks = rolandDecks();
    const { calls } = fakeArkhamDB(decks);
    const { asked, load } = loader(decks);
    const store = await getCards();
    const state: WalkState = { startedAt: new Date().toISOString(), investigators: {} };
    const result = await walkIndex(store, await getTaboos(), load, { state, save: () => {} });

    const sel = result.selection.find((s) => s.code === ROLAND);
    expect(sel?.decks.map((d) => d.row.id)).toEqual(roland().map((d) => d.id));
    expect(calls.filter((c) => c.includes(`investigator=${ROLAND}`))).toEqual([
      `/decklists/find/1?sort=likes&investigator=${ROLAND}`,
    ]);
    expect(asked.some((id) => id >= 800_000)).toBe(false);
    // one page for each code of every other owned investigator, all empty
    const codes = [...investigatorCodes(store).values()].flat();
    expect(calls.filter((c) => c.includes("investigator="))).toHaveLength(codes.length);
    expect(result.usageRows.map((r) => r.id).sort()).toEqual(
      roland()
        .map((d) => d.id)
        .sort(),
    );
    expect(result.crossChecked).toBe(10);
    expect(result.mismatches).toEqual([]);
    expect(state.investigators[ROLAND].frontier).toBe(10);
  });

  test("an investigator with fewer liked decks than ten is walked to its end", async () => {
    const decks = roland()
      .slice(0, 3)
      .map((list, i) => ({ id: list.id, likes: 5 - i, investigator: ROLAND, list }));
    fakeArkhamDB(decks);
    const state: WalkState = { startedAt: new Date().toISOString(), investigators: {} };
    const result = await walkIndex(await getCards(), await getTaboos(), loader(decks).load, { state, save: () => {} });
    expect(result.selection.find((s) => s.code === ROLAND)?.decks).toHaveLength(3);
    expect(state.investigators[ROLAND].frontier).toBe(0);
  });

  test("stops at the request budget with the walk so far saved, and a rerun resumes without walking it again", async () => {
    const decks = rolandDecks();
    const { calls } = fakeArkhamDB(decks);
    const { load } = loader(decks);
    const store = await getCards();
    const taboos = await getTaboos();
    let saved: WalkState = { startedAt: new Date().toISOString(), investigators: {} };
    const save = (s: WalkState) => {
      saved = structuredClone(s);
    };
    configureHttp({ budget: 20 });
    await expect(walkIndex(store, taboos, load, { state: structuredClone(saved), save })).rejects.toThrow(BudgetExceeded);
    expect(httpStats().requests).toBe(20);
    const walkedBefore = Object.keys(saved.investigators);
    expect(walkedBefore.length).toBeGreaterThan(0);

    calls.length = 0;
    configureHttp({ budget: Number.POSITIVE_INFINITY });
    const result = await walkIndex(store, taboos, load, { state: saved, save });
    for (const code of walkedBefore) expect(calls.some((c) => c.includes(`investigator=${code}`))).toBe(false);
    expect(result.selection.find((s) => s.code === ROLAND)?.decks).toHaveLength(DECKS_PER_INVESTIGATOR);
    expect(result.mismatches).toEqual([]);
  });
});

describe("crossCheck", () => {
  test("names a liked deck that no investigator walk found, and stops below the usage threshold", async () => {
    fakeArkhamDB([
      { id: 1, likes: 50, investigator: ROLAND },
      { id: 2, likes: 35, investigator: ROLAND },
      { id: 3, likes: 9, investigator: ROLAND },
    ]);
    const store = await getCards();
    const walked = { frontier: 0, rows: [{ id: 1, likes: 50, investigatorCode: ROLAND } as SearchRow] };
    const check = await crossCheck(store, { startedAt: "", investigators: { [ROLAND]: walked } });
    expect(check).toEqual({ checked: 2, pages: 1, mismatches: [{ id: 2, investigator: ROLAND, likes: 35 }] });
  });
});

describe("politeness", () => {
  test("a slow answer pushes the next request back", async () => {
    configureHttp({ slowMs: 20, slowFactor: 4, maxBackoffMs: 1_000 });
    const { times } = fakeArkhamDB(descending(ROLAND, 1, 9, 3), { delayMs: 40 });
    await getText("/decklists/find/1?sort=likes");
    await getText("/decklists/find/1?sort=likes");
    // the first answer took about 40 ms, so the second waits about 160 ms after it
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(190);
    expect(httpStats().slowAnswers).toBe(2);
  });

  test("a Retry-After is honored, and one too long gives up instead of waiting", async () => {
    const { times } = fakeArkhamDB([], {
      override: (n) => (n === 1 ? new Response("", { status: 503, headers: { "Retry-After": "0.2" } }) : undefined),
    });
    expect((await getText("/api/public/decklist/1")).ok).toBe(true);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(200);
    expect(httpStats().retryAfterWaits).toBe(1);

    configureHttp({ maxRetryAfterMs: 1_000 });
    fakeArkhamDB([], { override: () => new Response("", { status: 429, headers: { "Retry-After": "3600" } }) });
    const res = await getText("/api/public/decklist/1");
    expect(res).toEqual({ ok: false, status: "error", message: expect.stringMatching(/429 and asked to wait 3600 s/) });
  });

  test("reads Retry-After as seconds or as a date", () => {
    const now = Date.parse("2026-10-27T12:00:00Z");
    expect(retryAfterMs("120", now)).toBe(120_000);
    expect(retryAfterMs("Tue, 27 Oct 2026 12:01:00 GMT", now)).toBe(60_000);
    expect(retryAfterMs(null, now)).toBeNull();
    expect(retryAfterMs("soon", now)).toBeNull();
  });

  test("no request is made past the budget, retries included", async () => {
    configureHttp({ budget: 2 });
    const { calls } = fakeArkhamDB([], { override: () => new Response("", { status: 503 }) });
    await expect(getText("/api/public/decklist/1")).rejects.toThrow(BudgetExceeded);
    expect(calls).toHaveLength(2);
  });
});
