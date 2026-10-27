import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { getText } from "./http";

export const PAGE_SIZE = 30;

export type SearchRow = {
  id: number;
  name: string;
  likes: number;
  favorites: number;
  comments: number;
  authorId: number;
  authorReputation: number;
  date: string;
  investigatorCode: string;
  investigatorName: string;
  tags: string[];
};

export type SearchOrder = "date" | "likes";

export class PageError extends Error {
  override name = "PageError";
}

// No packs[] filter: ArkhamDB's pack filter drops some buildable decks (33170).
export function searchUrl(page: number, order: SearchOrder, investigator?: string): string {
  return `/decklists/find/${page}?sort=${order}${investigator ? `&investigator=${investigator}` : ""}`;
}

// Since October 2026 ArkhamDB answers 503 for any search page past 99, filtered or not.
export const MAX_PAGES = 99;

function required(value: string | undefined, field: string, row: string): string {
  if (!value) throw new PageError(`row without ${field}: ${row.slice(0, 200)}`);
  return value;
}

function integer(text: string | undefined, field: string, row: string): number {
  const n = Number(required(text?.trim(), field, row));
  if (!Number.isInteger(n)) throw new PageError(`row with a non-integer ${field} "${text}": ${row.slice(0, 200)}`);
  return n;
}

function idFromPath(href: string | undefined, prefix: string, field: string, row: string): number {
  const path = required(href, field, row);
  const id = path.startsWith(prefix) ? path.slice(prefix.length).split("/")[0] : undefined;
  return integer(id, field, row);
}

function tagsFrom(text: string): string[] {
  if (!text.startsWith("[") || !text.endsWith("]")) return [];
  return text
    .slice(1, -1)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseRow($: cheerio.CheerioAPI, tr: Element): SearchRow {
  const row = $(tr);
  const markup = row.html() ?? "";
  const count = (icon: string, field: string) => integer(row.find(`.fa-${icon}`).next(".num").first().text(), field, markup);
  const link = row.find("a.decklist-name").first();
  const author = row.find(".username a").first();
  const investigator = row.find("a.card[data-code]").first();
  return {
    id: idFromPath(link.attr("href"), "/decklist/view/", "deck link", markup),
    name: link.text().trim(),
    likes: count("heart", "likes"),
    favorites: count("star", "favorites"),
    comments: count("comment", "comments"),
    authorId: idFromPath(author.attr("href"), "/user/profile/", "author", markup),
    authorReputation: integer(row.find(".username .reputation").first().text(), "reputation", markup),
    date: required(row.find("time[datetime]").first().attr("datetime"), "date", markup),
    investigatorCode: required(investigator.attr("data-code"), "investigator", markup),
    investigatorName: required(investigator.text().replace(/\s+/g, " ").trim(), "investigator name", markup),
    tags: tagsFrom(investigator.nextAll("span").first().text().trim()),
  };
}

export function parseSearchPage(html: string): SearchRow[] {
  const $ = cheerio.load(html);
  const rows = $("tr")
    .filter((_, tr) => $(tr).find("a.decklist-name").length > 0)
    .toArray()
    .map((tr) => parseRow($, tr));
  const linked = new Set(
    $("a.decklist-name")
      .toArray()
      .map((a) => $(a).attr("href")),
  );
  if (rows.length !== linked.size) throw new PageError(`parsed ${rows.length} rows but the page links ${linked.size} decks`);
  return rows;
}

export async function fetchSearchPage(page: number, order: SearchOrder, investigator?: string): Promise<SearchRow[]> {
  const what = `search page ${page} (${order}${investigator ? `, investigator ${investigator}` : ""})`;
  const res = await getText(searchUrl(page, order, investigator));
  if (!res.ok) throw new Error(`${what}: ${res.message}`);
  try {
    return parseSearchPage(res.data);
  } catch (e) {
    if (e instanceof PageError) throw new PageError(`${what}: ${e.message}`);
    throw e;
  }
}

// Walked by date, not likes: dozens of decks share each low like count and ArkhamDB orders those
// ties differently per request, so likes paging skips and repeats decks. A deck published
// mid-walk only pushes a row onto the next page, where it is de-duplicated. One walk per
// investigator, since a single walk of every deck runs far past the last page ArkhamDB serves;
// the busiest investigator (Roland) fills under 80 pages.
export async function census(
  investigators: string[],
  opts: {
    /** Investigators already walked, with their rows: a resumed census skips them. */
    done?: Record<string, SearchRow[]>;
    onInvestigator?: (code: string, rows: SearchRow[], index: number, total: number) => void;
  } = {},
): Promise<SearchRow[]> {
  const seen = new Map<number, SearchRow>();
  for (const [i, code] of investigators.entries()) {
    let rows = opts.done?.[code];
    if (!rows) {
      rows = [];
      for (let page = 1; ; page++) {
        if (page > MAX_PAGES)
          throw new PageError(`investigator ${code} has more than ${MAX_PAGES} pages of decks, past what ArkhamDB serves`);
        const found = await fetchSearchPage(page, "date", code);
        rows.push(...found);
        if (found.length < PAGE_SIZE) break;
      }
      opts.onInvestigator?.(code, rows, i, investigators.length);
    }
    for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r);
  }
  return [...seen.values()];
}

/** The newest decks across every investigator, to catch an investigator code the census missed. */
export async function newest(pages: number): Promise<SearchRow[]> {
  const out: SearchRow[] = [];
  for (let page = 1; page <= pages; page++) out.push(...(await fetchSearchPage(page, "date")));
  return out;
}

/** Decks with minLikes or more, as far as ArkhamDB serves; `capped` when it stopped first. */
export async function likesWalk(minLikes: number): Promise<{ rows: SearchRow[]; capped: boolean }> {
  const rows: SearchRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const found = await fetchSearchPage(page, "likes");
    rows.push(...found.filter((r) => r.likes >= minLikes));
    if (found.length < PAGE_SIZE || found[found.length - 1].likes < minLikes) return { rows, capped: false };
  }
  return { rows, capped: true };
}
