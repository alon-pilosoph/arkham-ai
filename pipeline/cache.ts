import fs from "node:fs";
import path from "node:path";
import type { RawDeck } from "@/lib/decks";
import { getJsonText } from "./http";
import type { SearchRow } from "./search";
import type { LoadDeck } from "./selection";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const CACHE_DIR = path.join(ROOT, "data", "cache");
const CENSUS_FILE = path.join(CACHE_DIR, "census.json");
const DECK_DIR = path.join(CACHE_DIR, "decklists");

export type Census = { takenAt: string; rows: SearchRow[] };

export function writeCensus(census: Census): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CENSUS_FILE, JSON.stringify(census));
}

/** The investigators a census has walked so far, saved after each one, so a crawl that stops
 *  (a network outage, a closed laptop) resumes instead of starting over. */
export type PartialCensus = { startedAt: string; done: Record<string, SearchRow[]> };

const PARTIAL_FILE = path.join(CACHE_DIR, "census-partial.json");
const PARTIAL_MAX_AGE_MS = 2 * 24 * 3600_000;

export function readPartialCensus(): PartialCensus | null {
  if (!fs.existsSync(PARTIAL_FILE)) return null;
  const partial = JSON.parse(fs.readFileSync(PARTIAL_FILE, "utf8")) as PartialCensus;
  // an old partial walk would mix in a stale picture of the decks
  return Date.now() - Date.parse(partial.startedAt) < PARTIAL_MAX_AGE_MS ? partial : null;
}

export function writePartialCensus(partial: PartialCensus): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(PARTIAL_FILE, JSON.stringify(partial));
}

export function clearPartialCensus(): void {
  fs.rmSync(PARTIAL_FILE, { force: true });
}

export function readCensus(): Census {
  if (!fs.existsSync(CENSUS_FILE))
    throw new Error(`${path.relative(ROOT, CENSUS_FILE)} is missing: run npm run data:crawl first`);
  return JSON.parse(fs.readFileSync(CENSUS_FILE, "utf8")) as Census;
}

function deckFile(id: number): string {
  return path.join(DECK_DIR, `${id}.json`);
}

export function cachedDeck(id: number): RawDeck | null {
  const file = deckFile(id);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as RawDeck) : null;
}

export const loadCachedDeck: LoadDeck = async (id) => {
  const deck = cachedDeck(id);
  return deck ? { ok: true, deck } : { ok: false, message: `decklist ${id} is not cached: run npm run data:crawl` };
};

export const crawlDeck: LoadDeck = async (id) => {
  const cached = cachedDeck(id);
  if (cached) return { ok: true, deck: cached };
  const res = await getJsonText<RawDeck>(`/api/public/decklist/${id}`);
  if (!res.ok) return { ok: false, message: res.message };
  fs.mkdirSync(DECK_DIR, { recursive: true });
  fs.writeFileSync(deckFile(id), JSON.stringify(res.data));
  return { ok: true, deck: res.data };
};
