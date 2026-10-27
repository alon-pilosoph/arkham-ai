// A stand-in for ArkhamDB's decklist search and decklist API, served through a fetch stub, for the
// crawl's tests. Decks with the same like count come back in whatever order `tieOrder` gives,
// which is how the real site behaves at its worst.

import { vi } from "vitest";
import type { RawDeck } from "@/lib/decks";
import { PAGE_SIZE } from "@/pipeline/search";

export const FAKE_BASE = "https://fake.arkhamdb.test";

export const deckRow = (
  id: number,
  name: string,
  tags = "",
  investigator = "06002",
  likes = 42,
  date = "2024-01-02T10:00:00+00:00",
) => `<tr>
  <td class="decklist-hero-image"><div class="card-thumbnail-wide"></div></td>
  <td><div class="decklist-header">
    <h4><a href="/decklist/view/${id}/slug" class="decklist-name">${name}</a></h4>
    <div class="social">
      <span class="social-icon-like"><span class="fa fa-heart"></span> <span class="num">${likes}</span></span>
      <span class="social-icon-favorite"><span class="fa fa-star"></span> <span class="num">7</span></span>
      <span class="social-icon-comment"><span class="fa fa-comment"></span> <span class="num">3</span></span>
    </div>
    <div class="username"><a href="/user/profile/1234/someone" class="fg-seeker">someone</a> <small class="reputation">567</small></div>
    <time datetime="${date}">2 Jan 2024</time>
  </div>
  <div><a class="card card-tip" data-code="${investigator}" href="/card/${investigator}">Lily
    Chen</a> ${tags ? `<span>${tags}</span>` : ""}</div></td>
</tr>`;

export const page = (...rows: string[]) =>
  `<table class="table"><thead><tr><th>Deck</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;

export type FakeDeck = { id: number; likes: number; investigator: string; date?: string; list?: RawDeck };

export type FakeOptions = {
  /** The order of one request's decks with equal likes; by id when absent. */
  tieOrder?: (tied: FakeDeck[], req: { page: number; request: number }) => FakeDeck[];
  /** How long each answer takes. */
  delayMs?: number;
  /** An answer of its own for a request, by its number (1-based); the fake's otherwise. */
  override?: (request: number, url: string) => Response | undefined;
};

function ordered(decks: FakeDeck[], sort: string, req: { page: number; request: number }, opts: FakeOptions): FakeDeck[] {
  if (sort === "date") return [...decks].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.id - a.id);
  const byLikes = new Map<number, FakeDeck[]>();
  for (const d of decks) byLikes.set(d.likes, [...(byLikes.get(d.likes) ?? []), d]);
  return [...byLikes.keys()]
    .sort((a, b) => b - a)
    .flatMap((likes) => {
      const tied = (byLikes.get(likes) ?? []).sort((a, b) => a.id - b.id);
      return opts.tieOrder ? opts.tieOrder(tied, req) : tied;
    });
}

/** Stubs fetch with the fake; `calls` records every URL asked for, `times` when each was asked. */
export function fakeArkhamDB(decks: FakeDeck[], opts: FakeOptions = {}) {
  const calls: string[] = [];
  const times: number[] = [];
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    times.push(Date.now());
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    const own = opts.override?.(calls.length, url.pathname + url.search);
    if (own) return own;
    const search = url.pathname.match(/^\/decklists\/find\/(\d+)$/);
    if (search) {
      const n = Number(search[1]);
      if (n > 99) return new Response("Service Unavailable", { status: 503 });
      const investigator = url.searchParams.get("investigator");
      const pool = decks.filter((d) => !investigator || d.investigator === investigator);
      const rows = ordered(pool, url.searchParams.get("sort") ?? "date", { page: n, request: calls.length }, opts);
      const shown = rows.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE);
      return new Response(page(...shown.map((d) => deckRow(d.id, `deck ${d.id}`, "", d.investigator, d.likes, d.date))));
    }
    const list = url.pathname.match(/^\/api\/public\/decklist\/(\d+)$/);
    if (list) {
      const deck = decks.find((d) => d.id === Number(list[1]))?.list;
      return new Response(deck ? JSON.stringify(deck) : "", { status: 200 });
    }
    throw new Error(`the fake ArkhamDB has no ${url.pathname}`);
  });
  return { calls, times };
}

/** `count` decks for one investigator, the first with `top` likes and one fewer each after. */
export function descending(investigator: string, firstId: number, top: number, count: number): FakeDeck[] {
  return Array.from({ length: count }, (_, i) => ({ id: firstId + i, likes: top - i, investigator }));
}
