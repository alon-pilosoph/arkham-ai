//   npm run data:crawl                   # walk, check, fetch decklists (about ten minutes on a warm cache)
//   npm run data:crawl -- --dry-run      # estimate the run from the last one; one request
//   npm run data:crawl -- --reuse        # no search pages: the last walk, fetching only missing decklists
//   npm run data:crawl -- --fresh        # ignore a stopped walk instead of resuming it
//   npm run data:crawl -- --budget 500   # stop after this many requests (default 4,000); rerun to resume
// Writes data/cache/, and data/crawl-manifest.json when every check passes; exits non-zero otherwise.

import fs from "node:fs";
import path from "node:path";
import { getCards } from "@/lib/cards";
import { getTaboos } from "@/lib/taboo";
import {
  CACHE_DIR,
  clearPartialWalk,
  crawlDeck,
  isCached,
  ROOT,
  readPartialWalk,
  readWalk,
  writePartialWalk,
  writeWalk,
} from "./cache";
import { BudgetExceeded, configureHttp, httpStats } from "./http";
import { selectionReport } from "./report";
import { type Progress, type WalkState, walkIndex } from "./run";
import { fetchSearchPage } from "./search";
import type { LoadDeck } from "./selection";
import { cardUsage } from "./usage";

const DEFAULT_BUDGET = 4_000;
const REPORT_FILE = path.join(CACHE_DIR, "crawl-report.json");
const MANIFEST_FILE = path.join(ROOT, "data", "crawl-manifest.json");

type Manifest = {
  startedAt: string;
  finishedAt: string;
  minutes: number;
  resumed: boolean;
  requests: { total: number; searchPages: number; refetchedPages: number; decklists: number; retries: number };
  ArkhamDB: { slowAnswers: number; retryAfterWaits: number };
  walks: { investigators: number; tieGroupsSettled: number; dateWalks: number; usageDecks: number; crossChecked: number };
  index: { decks: number; skipped: Record<string, number>; short: { investigator: string; decks: number }[] };
  checks: { missingFromWalks: number; decklistsUnavailable: number };
};

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readManifest(): Manifest | null {
  return fs.existsSync(MANIFEST_FILE) ? (JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8")) as Manifest) : null;
}

const minutes = (ms: number) => Math.round(ms / 60_000);

async function dryRun(): Promise<number> {
  const last = readManifest();
  if (last) {
    const { searchPages, decklists, total } = last.requests;
    console.log(
      `dry run: the last full run (${last.finishedAt.slice(0, 10)}) made ${total} requests, ${searchPages} of them search pages and ${decklists} decklists, in ${last.minutes} minutes`,
    );
    console.log(
      `expect about ${searchPages} search pages (${minutes(searchPages * 2_000)} minutes at one every two seconds), plus a decklist for each deck new to the index or the usage counts`,
    );
  }
  // replaying the October 2026 census through the walk took 170 to 210 search pages; 580 if ArkhamDB
  // ever stops reshuffling ties, which forces date walks
  else
    console.log(
      "dry run: no earlier run to estimate from. Expect about 200 search pages (7 minutes at one every two seconds), plus a decklist for each deck not yet cached: about 2,700 on an empty cache",
    );
  // one request: ArkhamDB answers, its markup still parses, and the likes order still descends
  const top = await fetchSearchPage(1, "likes");
  const descends = top.every((r, i) => i === 0 || r.likes <= top[i - 1].likes);
  const uncached = top.filter((r) => !isCached(r.id)).length;
  console.log(
    `probe: the most liked page has ${top.length} decks (${top[0]?.likes ?? 0} to ${top.at(-1)?.likes ?? 0} likes), ${descends ? "in order" : "OUT OF ORDER"}, ${uncached} not cached`,
  );
  return descends && top.length > 0 ? 0 : 1;
}

async function main(): Promise<number> {
  if (flag("--dry-run")) return dryRun();
  const budget = Number(option("--budget") ?? DEFAULT_BUDGET);
  if (!Number.isInteger(budget) || budget < 1)
    throw new Error(`--budget takes a whole number of requests, not ${option("--budget")}`);
  configureHttp({ budget });

  const started = Date.now();
  const [store, taboos] = await Promise.all([getCards(), getTaboos()]);
  const reuse = flag("--reuse");
  const partial = reuse ? null : flag("--fresh") ? null : readPartialWalk();
  const state: WalkState = reuse ? readWalk() : (partial ?? { startedAt: new Date().toISOString(), investigators: {} });
  const resumed = !!partial && Object.keys(partial.investigators).length > 0;
  if (resumed)
    console.log(`resuming the walk started ${state.startedAt}: ${Object.keys(state.investigators).length} investigators done`);

  let fetched = 0;
  const loadDeck: LoadDeck = (id) => {
    if (!isCached(id)) fetched++;
    return crawlDeck(id);
  };
  let progress: Progress | "decklists" = { done: 0, total: 0 };
  const ticker = setInterval(() => {
    const where = progress === "decklists" ? "usage decklists" : `investigators ${progress.done}/${progress.total}`;
    const http = httpStats();
    console.log(`[${minutes(Date.now() - started)} min] ${where}: ${http.requests} requests, ${fetched} decklists fetched`);
  }, 60_000);

  try {
    const walked = await walkIndex(store, taboos, loadDeck, {
      state,
      save: (s) => (reuse ? undefined : writePartialWalk(s)),
      crossCheck: !reuse,
      onProgress: (p) => {
        progress = p;
      },
    });
    progress = "decklists";
    const report = selectionReport(walked.selection);
    const { unavailable } = await cardUsage(store, walked.usageRows, loadDeck);
    const decklistsUnavailable = report.skipped.unavailable + unavailable.length;

    console.log(report.summary);
    console.log(
      `walks: ${Object.keys(state.investigators).length} investigators, ${walked.usageRows.length} decks with 10+ likes for the usage counts, ${walked.stats.settledGroups} tie groups across page breaks settled, ${walked.stats.dateWalks} date walks`,
    );
    console.log(
      `cross-check: ${walked.crossChecked} of the most liked decks, ${walked.mismatches.length} missing from the walks`,
    );
    for (const m of walked.mismatches) console.log(`  MISSING deck ${m.id} (${m.investigator}, ${m.likes} likes)`);
    if (unavailable.length)
      console.log(`card usage: ${unavailable.length} decklists could not be fetched: ${unavailable.join(", ")}`);

    const http = httpStats();
    const manifest: Manifest = {
      startedAt: state.startedAt,
      finishedAt: new Date().toISOString(),
      minutes: minutes(Date.now() - started),
      resumed,
      requests: {
        total: http.requests,
        searchPages: walked.stats.pages + walked.stats.refetched,
        refetchedPages: walked.stats.refetched,
        decklists: fetched,
        retries: http.retries,
      },
      ArkhamDB: { slowAnswers: http.slowAnswers, retryAfterWaits: http.retryAfterWaits },
      walks: {
        investigators: Object.keys(state.investigators).length,
        tieGroupsSettled: walked.stats.settledGroups,
        dateWalks: walked.stats.dateWalks,
        usageDecks: walked.usageRows.length,
        crossChecked: walked.crossChecked,
      },
      index: { decks: report.decks, skipped: report.skipped, short: report.short },
      checks: { missingFromWalks: walked.mismatches.length, decklistsUnavailable },
    };
    fs.writeFileSync(REPORT_FILE, JSON.stringify({ ...manifest, mismatches: walked.mismatches, unavailable }, null, 1));
    console.log(
      `done in ${manifest.minutes} minutes: ${http.requests} requests (${manifest.requests.searchPages} search pages, ${fetched} decklists, ${http.retries} retries); ArkhamDB was slow ${http.slowAnswers} times`,
    );

    if (walked.mismatches.length) {
      console.log("a liked deck is missing from the walks: an investigator code is not walked, or likes changed during the run");
      return 1;
    }
    // a --reuse run walked nothing: the walk and the manifest stay those of the run that did
    if (reuse) return decklistsUnavailable ? 1 : 0;
    writeWalk({ ...state, takenAt: manifest.finishedAt });
    clearPartialWalk();
    if (decklistsUnavailable) return 1;
    fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`all checks passed: ${path.relative(ROOT, MANIFEST_FILE)} written; next, npm run data:sheet -- status`);
    return 0;
  } catch (e) {
    if (!(e instanceof BudgetExceeded)) throw e;
    console.log(`stopped: ${e.message} (${fetched} decklists fetched). The walk so far is saved: run again to resume.`);
    return 1;
  } finally {
    clearInterval(ticker);
  }
}

process.exitCode = await main();
