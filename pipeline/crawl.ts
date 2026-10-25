//   npm run data:crawl                    # census, cross-checks, fetch (two to three hours)
//   npm run data:crawl -- --reuse-census  # fetch only, from the last census
//   npm run data:crawl -- --fresh         # ignore a stopped census instead of resuming it
// Writes data/cache/; exits non-zero if the census misses a deck a cross-check found, or a fetch fails.

import fs from "node:fs";
import path from "node:path";
import { type CardStore, getCards } from "@/lib/cards";
import { getTaboos } from "@/lib/taboo";
import {
  CACHE_DIR,
  clearPartialCensus,
  crawlDeck,
  readCensus,
  readPartialCensus,
  writeCensus,
  writePartialCensus,
} from "./cache";
import { selectionReport } from "./report";
import { census, likesWalk, newest } from "./search";
import { selectIndex } from "./selection";
import { cardUsage } from "./usage";

// Below this, the likes order is too tie-ridden to walk reliably.
const CROSS_CHECK_LIKES = 10;
const CROSS_CHECK_NEWEST_PAGES = 10;

const REPORT_FILE = path.join(CACHE_DIR, "crawl-report.json");

// Every investigator code, reprints, parallels and Chapter 2 included: a deck is filed under the
// code its author picked, and a code with no decks costs one empty page.
function investigatorCodes(store: CardStore): string[] {
  return [...store.byCode.values()]
    .filter((c) => c.type_code === "investigator")
    .map((c) => c.code)
    .sort();
}

async function takeCensus(store: CardStore) {
  const codes = investigatorCodes(store);
  const partial = (!process.argv.includes("--fresh") && readPartialCensus()) || { startedAt: new Date().toISOString(), done: {} };
  const resumed = Object.keys(partial.done).length;
  if (resumed) console.log(`census: resuming the one started ${partial.startedAt}, ${resumed} investigators already walked`);
  const rows = await census(codes, {
    done: partial.done,
    onInvestigator: (code, found, i, total) => {
      partial.done[code] = found;
      writePartialCensus(partial);
      if ((i + 1) % 10 === 0 || i + 1 === total) console.log(`census: ${i + 1}/${total} investigators (last ${code})`);
    },
  });
  console.log(`census: ${rows.length} published decklists`);
  const ids = new Set(rows.map((r) => r.id));
  const liked = await likesWalk(CROSS_CHECK_LIKES);
  const recent = await newest(CROSS_CHECK_NEWEST_PAGES);
  const missing = [...liked.rows, ...recent].filter((r, i, all) => !ids.has(r.id) && all.findIndex((o) => o.id === r.id) === i);
  console.log(
    `cross-check: ${liked.rows.length} decks with ${CROSS_CHECK_LIKES}+ likes${liked.capped ? " (as far as ArkhamDB serves)" : ""} and the ${recent.length} newest, ${missing.length} missing from the census`,
  );
  for (const r of missing)
    console.log(`  MISSING ${r.id} ${r.investigatorName} (${r.investigatorCode}): ${r.name} (${r.likes} likes)`);
  writeCensus({ takenAt: new Date().toISOString(), rows });
  clearPartialCensus();
  return { rows, likedChecked: liked.rows.length + recent.length, missing };
}

async function main(): Promise<number> {
  const reuse = process.argv.includes("--reuse-census");
  const [store, taboos] = await Promise.all([getCards(), getTaboos()]);
  const taken = reuse ? { rows: readCensus().rows, likedChecked: 0, missing: [] } : await takeCensus(store);
  const selection = await selectIndex(store, taboos, taken.rows, crawlDeck);
  const report = selectionReport(selection);
  console.log(report.summary);
  const { unavailable: usageUnavailable } = await cardUsage(store, taken.rows, crawlDeck);
  if (usageUnavailable.length)
    console.log(`card usage: ${usageUnavailable.length} decklists could not be fetched: ${usageUnavailable.join(", ")}`);
  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify(
      { census: taken.rows.length, likedChecked: taken.likedChecked, missing: taken.missing, usageUnavailable, ...report },
      null,
      1,
    ),
  );
  return taken.missing.length || report.skipped.unavailable || usageUnavailable.length ? 1 : 0;
}

process.exitCode = await main();
