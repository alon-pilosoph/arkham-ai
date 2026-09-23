import fs from "node:fs";
import path from "node:path";
import { expect, vi } from "vitest";
import type { DeckList } from "@/lib/decks";
import { type Failure, failureText } from "@/lib/format";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

export type Route = { status: number; body: string };

export function mockArkhamDB(routes: Record<string, Route> = {}) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (hit) return new Response(hit[1].body, { status: hit[1].status });
    const m = url.match(/\/api\/public\/(decklist|deck)\/(\d+)/);
    if (m) {
      const f = path.join(FIXTURES, `${m[1]}-${m[2]}.json`);
      if (fs.existsSync(f)) return new Response(fs.readFileSync(f, "utf8"), { status: 200 });
      // ArkhamDB answers a missing decklist with 200 and an empty body
      return new Response("", { status: 200 });
    }
    throw new Error(`unexpected network call in a test: ${url}`);
  });
  return calls;
}

// written by `npm run data:index`
export function indexedDecks(): DeckList[] {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, "indexed-decks.json"), "utf8"));
}

type Result = { ok: true; kind?: string } | Failure;

export function expectOk<T extends Result>(r: T): Extract<T, { ok: true }>;
export function expectOk<T extends Result, K extends NonNullable<Extract<T, { ok: true }>["kind"]>>(
  r: T,
  kind: K,
): Extract<T, { ok: true; kind: K }>;
export function expectOk(r: Result, kind?: string) {
  if (!r.ok) throw new Error(failureText(r));
  if (kind !== undefined) expect(r.kind).toBe(kind);
  return r;
}

export function expectFail<T extends Result>(r: T, kind?: Failure["kind"]): Extract<T, { ok: false }> {
  if (r.ok) throw new Error(`expected a failure, got ${JSON.stringify(r).slice(0, 200)}`);
  if (kind !== undefined) expect(r.kind).toBe(kind);
  return r as Extract<T, { ok: false }>;
}
