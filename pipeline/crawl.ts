//   npm run data:crawl                    # census, likes cross-check, fetch (about an hour)
//   npm run data:crawl -- --reuse-census  # fetch only, from the last census
// Writes data/cache/; exits non-zero if the census misses a liked deck or a fetch fails.

import fs from "node:fs";
import path from "node:path";
import { getCards } from "@/lib/cards";
import { getTaboos } from "@/lib/taboo";
import { CACHE_DIR, crawlDeck, readCensus, writeCensus } from "./cache";
import { selectionReport } from "./report";
import { census, likesWalk } from "./search";
import { selectIndex } from "./selection";
import { cardUsage } from "./usage";

// Below this, the likes order is too tie-ridden to walk reliably.
const CROSS_CHECK_LIKES = 10;

const REPORT_FILE = path.join(CACHE_DIR, "crawl-report.json");

async function takeCensus() {
  const rows = await census((page, total) => {
    if (page % 100 === 0) console.log(`census page ${page}: ${total} decks`);
  });
  console.log(`census: ${rows.length} published decklists`);
  const ids = new Set(rows.map((r) => r.id));
  const liked = await likesWalk(CROSS_CHECK_LIKES);
  const missing = liked.filter((r) => !ids.has(r.id));
  console.log(`cross-check: ${liked.length} decks with ${CROSS_CHECK_LIKES}+ likes, ${missing.length} missing from the census`);
  for (const r of missing) console.log(`  MISSING ${r.id} ${r.investigatorName}: ${r.name} (${r.likes} likes)`);
  writeCensus({ takenAt: new Date().toISOString(), rows });
  return { rows, likedChecked: liked.length, missing };
}

async function main(): Promise<number> {
  const reuse = process.argv.includes("--reuse-census");
  const taken = reuse ? { rows: readCensus().rows, likedChecked: 0, missing: [] } : await takeCensus();
  const [store, taboos] = await Promise.all([getCards(), getTaboos()]);
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
