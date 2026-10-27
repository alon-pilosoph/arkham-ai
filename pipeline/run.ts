// The crawl, without its command line: which search pages to walk, how deep, and what checks the
// result. Each investigator's likes order is walked down to the usage threshold, and an owned
// investigator's further if its ten decks need it. Then the most liked decks across every
// investigator are read as a check that no investigator code was left out.

import type { CardStore } from "@/lib/cards";
import type { TabooList } from "@/lib/taboo";
import { fetchSearchPage, type SearchRow } from "./search";
import {
  DECKS_PER_INVESTIGATOR,
  type InvestigatorSelection,
  type LoadDeck,
  MIN_LIKES,
  ownedInvestigators,
  selectForInvestigator,
} from "./selection";
import { USAGE_MIN_LIKES } from "./usage";
import { InvestigatorWalk, type WalkStats } from "./walk";

export const CROSS_CHECK_PAGES = 10;

/** What a run has walked so far, saved after each investigator so a stopped run resumes. */
export type WalkState = {
  startedAt: string;
  /** By investigator: every deck with `frontier` likes or more. */
  investigators: Record<string, { frontier: number; rows: SearchRow[] }>;
};

export type Progress = { done: number; total: number };

export type Mismatch = { id: number; investigator: string; likes: number };

export type WalkResult = {
  selection: InvestigatorSelection[];
  /** Every deck with USAGE_MIN_LIKES likes or more, for the usage counts. */
  usageRows: SearchRow[];
  /** Decks among the most liked that no investigator walk found. */
  mismatches: Mismatch[];
  crossChecked: number;
  stats: WalkStats;
};

/** Every investigator code, grouped under its original printing's: a deck is filed under the code
 *  its author picked, reprints, parallels and Chapter 2 included, and a code with no decks costs
 *  one empty page. */
export function investigatorCodes(store: CardStore): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of store.byCode.values()) {
    if (c.type_code !== "investigator") continue;
    const canonical = store.canonical(c.code);
    out.set(canonical, [...(out.get(canonical) ?? []), c.code].sort());
  }
  return new Map([...out].sort(([a], [b]) => a.localeCompare(b)));
}

async function walkInvestigator(
  store: CardStore,
  taboos: Map<number, TabooList>,
  codes: string[],
  owned: { code: string; name: string } | undefined,
  loadDeck: LoadDeck,
) {
  const walk = new InvestigatorWalk(codes);
  for (;;) {
    await walk.next();
    const frontier = walk.frontier();
    if (frontier > USAGE_MIN_LIKES) continue;
    const selection = owned && (await selectForInvestigator(store, taboos, owned, walk.rows(), loadDeck));
    if (!selection || selection.decks.length === DECKS_PER_INVESTIGATOR || frontier <= MIN_LIKES)
      return { selection, frontier, rows: walk.rows(), stats: walk.stats() };
  }
}

/** Every deck among the most liked must be in its investigator's walk; the pages need not be
 *  complete for that, only the walks. */
export async function crossCheck(store: CardStore, state: WalkState, pages = CROSS_CHECK_PAGES) {
  const mismatches: Mismatch[] = [];
  let checked = 0;
  for (let page = 1; page <= pages; page++) {
    const rows = await fetchSearchPage(page, "likes");
    for (const r of rows) {
      if (r.likes < USAGE_MIN_LIKES) return { checked, mismatches, pages: page };
      checked++;
      const walked = state.investigators[store.canonical(r.investigatorCode)];
      if (!walked?.rows.some((o) => o.id === r.id))
        mismatches.push({ id: r.id, investigator: r.investigatorCode, likes: r.likes });
    }
  }
  return { checked, mismatches, pages };
}

function addStats(total: WalkStats, more: WalkStats): void {
  for (const k of Object.keys(total) as (keyof WalkStats)[]) total[k] += more[k];
}

export async function walkIndex(
  store: CardStore,
  taboos: Map<number, TabooList>,
  loadDeck: LoadDeck,
  opts: { state: WalkState; save: (state: WalkState) => void; onProgress?: (p: Progress) => void; crossCheck?: boolean },
): Promise<WalkResult> {
  const { state } = opts;
  const owned = ownedInvestigators(store);
  const groups = investigatorCodes(store);
  const stats: WalkStats = { pages: 0, refetched: 0, settledGroups: 0, dateWalks: 0 };
  const selection: InvestigatorSelection[] = [];
  for (const [i, [code, codes]] of [...groups].entries()) {
    const name = owned.get(code);
    const investigator = name ? { code, name } : undefined;
    const saved = state.investigators[code];
    if (saved) {
      if (investigator) selection.push(await selectForInvestigator(store, taboos, investigator, saved.rows, loadDeck));
    } else {
      const walked = await walkInvestigator(store, taboos, codes, investigator, loadDeck);
      if (walked.selection) selection.push(walked.selection);
      addStats(stats, walked.stats);
      state.investigators[code] = { frontier: walked.frontier, rows: walked.rows };
      opts.save(state);
    }
    opts.onProgress?.({ done: i + 1, total: groups.size });
  }
  const check = opts.crossCheck === false ? { checked: 0, mismatches: [], pages: 0 } : await crossCheck(store, state);
  stats.pages += check.pages;
  return {
    selection,
    usageRows: walkedRows(state).filter((r) => r.likes >= USAGE_MIN_LIKES),
    mismatches: check.mismatches,
    crossChecked: check.checked,
    stats,
  };
}

/** Every deck the walks saw, as the index build reads them. */
export function walkedRows(state: WalkState): SearchRow[] {
  const out = new Map<number, SearchRow>();
  for (const inv of Object.values(state.investigators)) for (const r of inv.rows) out.set(r.id, r);
  return [...out.values()].sort((a, b) => a.id - b.id);
}
