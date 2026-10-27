import fs from "node:fs";
import path from "node:path";
import type { RawDeck } from "@/lib/decks";
import { getJsonText } from "./http";
import type { WalkState } from "./run";
import type { LoadDeck } from "./selection";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const CACHE_DIR = path.join(ROOT, "data", "cache");
const WALK_FILE = path.join(CACHE_DIR, "walk.json");
const DECK_DIR = path.join(CACHE_DIR, "decklists");

/** A finished walk: what the index build, the label sheets and a --reuse crawl read. */
export type SavedWalk = WalkState & { takenAt: string };

export function writeWalk(walk: SavedWalk): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(WALK_FILE, JSON.stringify(walk));
}

export function readWalk(): SavedWalk {
  if (!fs.existsSync(WALK_FILE)) throw new Error(`${path.relative(ROOT, WALK_FILE)} is missing: run npm run data:crawl first`);
  return JSON.parse(fs.readFileSync(WALK_FILE, "utf8")) as SavedWalk;
}

/** A walk in progress, saved after each investigator, so a crawl that stops (a network outage, a
 *  closed laptop, the request budget) resumes instead of starting over. */
const PARTIAL_FILE = path.join(CACHE_DIR, "walk-partial.json");
const PARTIAL_MAX_AGE_MS = 2 * 24 * 3600_000;

export function readPartialWalk(): WalkState | null {
  if (!fs.existsSync(PARTIAL_FILE)) return null;
  const partial = JSON.parse(fs.readFileSync(PARTIAL_FILE, "utf8")) as WalkState;
  // an old partial walk would mix in a stale picture of the decks
  return Date.now() - Date.parse(partial.startedAt) < PARTIAL_MAX_AGE_MS ? partial : null;
}

export function writePartialWalk(partial: WalkState): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(PARTIAL_FILE, JSON.stringify(partial));
}

export function clearPartialWalk(): void {
  fs.rmSync(PARTIAL_FILE, { force: true });
}

function deckFile(id: number): string {
  return path.join(DECK_DIR, `${id}.json`);
}

export function cachedDeck(id: number): RawDeck | null {
  const file = deckFile(id);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as RawDeck) : null;
}

export function isCached(id: number): boolean {
  return fs.existsSync(deckFile(id));
}

export const loadCachedDeck: LoadDeck = async (id) => {
  const deck = cachedDeck(id);
  return deck ? { ok: true, deck } : { ok: false, message: `decklist ${id} is not cached: run npm run data:crawl` };
};

// A published decklist never changes, so a cached one is never fetched again.
export const crawlDeck: LoadDeck = async (id) => {
  const cached = cachedDeck(id);
  if (cached) return { ok: true, deck: cached };
  const res = await getJsonText<RawDeck>(`/api/public/decklist/${id}`);
  if (!res.ok) return { ok: false, message: res.message };
  fs.mkdirSync(DECK_DIR, { recursive: true });
  fs.writeFileSync(deckFile(id), JSON.stringify(res.data));
  return { ok: true, deck: res.data };
};
