// npm run data:index: offline, from data/cache/ and data/deck-labels/, writes lib/index/decks.json,
// lib/index/card-usage.json and the test fixtures. Fails, naming them, if a selected deck lacks a
// label filed under its own investigator.

import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { type CardStore, getCards } from "@/lib/cards";
import { type DeckList, deckCards, deckMeta, xpInList } from "@/lib/decks";
import { CLASSES, type IndexRow, IndexRowSchema } from "@/lib/index/schema";
import { deckViolation } from "@/lib/legality";
import { getTaboos, latest, type TabooList } from "@/lib/taboo";
import { loadCachedDeck, ROOT, readWalk } from "./cache";
import { type DeckLabel, readLabels } from "./labels";
import { selectionReport } from "./report";
import { walkedRows } from "./run";
import { type Selected, selectIndex } from "./selection";
import { cardUsage } from "./usage";

const INDEX_FILE = path.join(ROOT, "lib", "index", "decks.json");
const USAGE_FILE = path.join(ROOT, "lib", "index", "card-usage.json");
const FIXTURE_FILE = path.join(ROOT, "tests", "fixtures", "indexed-decks.json");
const CARDS_SNAPSHOT = path.join(ROOT, "tests", "fixtures", "cards.json.gz");
const TABOOS_SNAPSHOT = path.join(ROOT, "tests", "fixtures", "taboos.json");

function indexRow(store: CardStore, current: TabooList, { row, deck }: Selected, label: DeckLabel): IndexRow {
  const investigator = store.get(store.canonical(deck.investigator_code));
  if (!investigator) throw new Error(`deck ${deck.id}: investigator ${deck.investigator_code} is not in the card set`);
  const meta = deckMeta(deck);
  return IndexRowSchema.parse({
    deckId: deck.id,
    name: deck.name || row.name,
    investigator: investigator.name,
    investigatorCode: investigator.code,
    class: CLASSES.find((c) => c === investigator.faction_code),
    published: row.date.slice(0, 10),
    xp: xpInList(deckCards(store, deck.slots, meta)),
    xpTaboo: xpInList(deckCards(store, deck.slots, meta, current)),
    tabooLegal: deckViolation(store, deck, current) === null,
    tabooList: current.code,
    role: label.role,
    secondaryRole: label.secondaryRole,
    archetypes: label.archetypes,
    summary: label.summary,
    tags: row.tags,
    likes: row.likes,
    cards: [...new Set(Object.keys(deck.slots).map((c) => store.canonical(c)))].sort(),
  });
}

function oneRowPerLine(rows: unknown[]): string {
  return `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`;
}

function writeSnapshot(store: CardStore, taboos: Map<number, TabooList>): void {
  const cards = JSON.stringify([...store.byCode.values()]);
  fs.writeFileSync(CARDS_SNAPSHOT, gzipSync(cards, { level: 9 }));
  const raw = [...taboos.values()].map((t) => ({
    id: t.id,
    code: t.code,
    date_start: t.date,
    cards: JSON.stringify([...t.cards.values()]),
  }));
  fs.writeFileSync(TABOOS_SNAPSHOT, `${JSON.stringify(raw)}\n`);
}

async function main(): Promise<number> {
  const [store, taboos] = await Promise.all([getCards(), getTaboos()]);
  const walked = walkedRows(readWalk());
  const selection = await selectIndex(store, taboos, walked, loadCachedDeck);
  const { usage, unavailable: usageUnavailable } = await cardUsage(store, walked, loadCachedDeck);
  const labels = readLabels();
  const current = latest(taboos);
  if (!current) throw new Error("ArkhamDB lists no taboo list");

  const rows: IndexRow[] = [];
  const fixtures: DeckList[] = [];
  const unlabeled: string[] = [];
  const selectedIds = new Set<number>();
  for (const inv of selection) {
    for (const selected of inv.decks) {
      selectedIds.add(selected.deck.id);
      const label = labels.get(selected.deck.id);
      if (!label || label.filedUnder !== inv.code) {
        unlabeled.push(`${inv.code} ${inv.name}: ${selected.deck.id}${label ? ` (filed under ${label.filedUnder})` : ""}`);
        continue;
      }
      rows.push(indexRow(store, current, selected, label));
      const { id, investigator_code, slots, meta, taboo_id, ignoreDeckLimitSlots } = selected.deck;
      fixtures.push({ id, investigator_code, slots, meta, taboo_id, ...(ignoreDeckLimitSlots ? { ignoreDeckLimitSlots } : {}) });
    }
  }
  const stale = [...labels.keys()].filter((id) => !selectedIds.has(id));

  const report = selectionReport(selection);
  console.log(report.summary);
  if (stale.length) console.log(`${stale.length} labels are for decks no longer selected: ${stale.join(", ")}`);
  const uncached = report.skipped.unavailable + usageUnavailable.length;
  if (uncached) console.log(`${uncached} decklists are not cached: run npm run data:crawl -- --reuse`);
  if (unlabeled.length) {
    console.log(`${unlabeled.length} selected decks have no label:\n  ${unlabeled.join("\n  ")}`);
    return 1;
  }

  rows.sort((a, b) => a.investigatorCode.localeCompare(b.investigatorCode) || b.likes - a.likes);
  fs.writeFileSync(INDEX_FILE, oneRowPerLine(rows));
  fs.writeFileSync(USAGE_FILE, `${JSON.stringify(usage)}\n`);
  fs.mkdirSync(path.dirname(FIXTURE_FILE), { recursive: true });
  fs.writeFileSync(FIXTURE_FILE, oneRowPerLine(fixtures.sort((a, b) => a.id - b.id)));
  writeSnapshot(store, taboos);
  console.log(`${rows.length} decks -> ${path.relative(ROOT, INDEX_FILE)}`);
  return uncached ? 1 : 0;
}

process.exitCode = await main();
