// The likes order, walked so that a skipped deck cannot go unnoticed.
//
// ArkhamDB orders decks with the same like count differently from one request to the next, so
// when such a tie group runs across a page break, paging can show one of its decks twice and
// another never. What does not move is where the group sits: the decks with more likes come
// before it in every ordering, those with fewer after. So the number of positions the group fills
// on the pages, as first fetched, is its true size. A group is settled once that many distinct
// decks have been seen with its like count. An unsettled group's pages are fetched again, up to
// SETTLE_ROUNDS times, and each fetch adds what it shows. Should ArkhamDB give the same page the
// same order every time, refetching cannot help: a round that shows no new deck ends the attempts.
// A group that will not settle is replaced by a walk of the investigator in date order, which is
// stable but reads every deck the investigator has.

import { fetchSearchPage, MAX_PAGES, PAGE_SIZE, PageError, type SearchRow } from "./search";

export const SETTLE_ROUNDS = 3;

export type WalkStats = { pages: number; refetched: number; settledGroups: number; dateWalks: number };

export class LikesWalk {
  /** Each page as first fetched: the positions every tie group is counted by. */
  private readonly pages: SearchRow[][] = [];
  /** Every deck seen in any fetch, by id, with the like count it last showed. */
  private readonly seen = new Map<number, SearchRow>();
  private readonly seenWithLikes = new Map<number, Set<number>>();
  private ended = false;
  readonly stats: WalkStats = { pages: 0, refetched: 0, settledGroups: 0, dateWalks: 0 };

  constructor(readonly investigator: string) {}

  get done(): boolean {
    return this.ended;
  }

  /** Every deck with this many likes or more has been seen; 0 once the walk has reached its end. */
  frontier(): number {
    if (this.ended) return 0;
    const last = this.pages.at(-1)?.at(-1);
    return last ? last.likes + 1 : Number.POSITIVE_INFINITY;
  }

  /** The decks at or above the frontier: complete, whatever order the requests came back in. */
  rows(): SearchRow[] {
    const frontier = this.frontier();
    return [...this.seen.values()].filter((r) => r.likes >= frontier);
  }

  /** Fetches the next page, then settles every tie group it closed. */
  async next(): Promise<void> {
    if (this.ended) return;
    const page = this.pages.length + 1;
    if (page > MAX_PAGES) throw new PageError(`the likes walk for ${this.investigator} runs past the last page ArkhamDB serves`);
    const rows = await this.fetch(page);
    for (let i = 1; i < rows.length; i++)
      if (rows[i].likes > rows[i - 1].likes)
        throw new PageError(
          `the likes walk for ${this.investigator}, page ${page}: likes rise from ${rows[i - 1].likes} to ${rows[i].likes}`,
        );
    this.pages.push(rows);
    if (rows.length < PAGE_SIZE) this.ended = true;
    await this.settle();
  }

  private async fetch(page: number): Promise<SearchRow[]> {
    const rows = await fetchSearchPage(page, "likes", this.investigator);
    this.stats.pages++;
    this.remember(rows);
    return rows;
  }

  private remember(rows: SearchRow[]): void {
    for (const r of rows) {
      this.seen.set(r.id, r);
      const ids = this.seenWithLikes.get(r.likes) ?? new Set<number>();
      this.seenWithLikes.set(r.likes, ids.add(r.id));
    }
  }

  /** Tie groups whose every position has been fetched, with the pages they fill and their size. */
  private closedGroups(): { likes: number; pages: number[]; size: number }[] {
    const frontier = this.frontier();
    const groups = new Map<number, { likes: number; pages: Set<number>; size: number }>();
    for (const [i, rows] of this.pages.entries())
      for (const r of rows) {
        if (r.likes < frontier) continue;
        const g = groups.get(r.likes) ?? { likes: r.likes, pages: new Set<number>(), size: 0 };
        g.pages.add(i + 1);
        g.size++;
        groups.set(r.likes, g);
      }
    return [...groups.values()].map((g) => ({ ...g, pages: [...g.pages] }));
  }

  private unsettled() {
    return this.closedGroups().filter((g) => g.pages.length > 1 && (this.seenWithLikes.get(g.likes)?.size ?? 0) < g.size);
  }

  private async settle(): Promise<void> {
    for (let round = 0; round < SETTLE_ROUNDS; round++) {
      const open = this.unsettled();
      if (!open.length) return this.countSettled();
      const before = this.seen.size;
      for (const page of new Set(open.flatMap((g) => g.pages))) {
        this.remember(await fetchSearchPage(page, "likes", this.investigator));
        this.stats.refetched++;
      }
      // the same pages in the same order: this investigator's ties will not move, so stop asking
      if (this.seen.size === before) break;
    }
    if (!this.unsettled().length) return this.countSettled();
    await this.walkByDate();
  }

  private countSettled(): void {
    this.stats.settledGroups = this.closedGroups().filter((g) => g.pages.length > 1).length;
  }

  private async walkByDate(): Promise<void> {
    this.stats.dateWalks++;
    const all: SearchRow[] = [];
    for (let page = 1; ; page++) {
      if (page > MAX_PAGES) throw new PageError(`the date walk for ${this.investigator} runs past the last page ArkhamDB serves`);
      const rows = await fetchSearchPage(page, "date", this.investigator);
      this.stats.pages++;
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
    this.seen.clear();
    this.seenWithLikes.clear();
    this.remember(all);
    this.ended = true;
  }
}

/** One investigator's decks, filed under any of its codes (a promo reprint has its own), walked
 *  in likes order only as deep as the caller needs. */
export class InvestigatorWalk {
  readonly walks: LikesWalk[];

  constructor(codes: string[]) {
    this.walks = codes.map((code) => new LikesWalk(code));
  }

  /** Every deck with this many likes or more, under any code, has been seen. */
  frontier(): number {
    return Math.max(...this.walks.map((w) => w.frontier()));
  }

  rows(): SearchRow[] {
    const frontier = this.frontier();
    const out = new Map<number, SearchRow>();
    for (const w of this.walks) for (const r of w.rows()) if (r.likes >= frontier && !out.has(r.id)) out.set(r.id, r);
    return [...out.values()];
  }

  /** Walks one more page of the code holding the frontier up. */
  async next(): Promise<void> {
    const frontier = this.frontier();
    await this.walks.find((w) => !w.done && w.frontier() === frontier)?.next();
  }

  stats(): WalkStats {
    const total: WalkStats = { pages: 0, refetched: 0, settledGroups: 0, dateWalks: 0 };
    for (const w of this.walks) for (const k of Object.keys(total) as (keyof WalkStats)[]) total[k] += w.stats[k];
    return total;
  }
}
