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
export function searchUrl(page: number, order: SearchOrder): string {
  return `/decklists/find/${page}?sort=${order}`;
}

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

export async function fetchSearchPage(page: number, order: SearchOrder): Promise<SearchRow[]> {
  const res = await getText(searchUrl(page, order));
  if (!res.ok) throw new Error(`search page ${page} (${order}): ${res.message}`);
  try {
    return parseSearchPage(res.data);
  } catch (e) {
    if (e instanceof PageError) throw new PageError(`search page ${page} (${order}): ${e.message}`);
    throw e;
  }
}

// Walked by date, not likes: dozens of decks share each low like count and ArkhamDB orders those
// ties differently per request, so likes paging skips and repeats decks. A deck published
// mid-walk only pushes a row onto the next page, where it is de-duplicated.
export async function census(onPage?: (page: number, total: number) => void): Promise<SearchRow[]> {
  const seen = new Map<number, SearchRow>();
  for (let page = 1; ; page++) {
    const rows = await fetchSearchPage(page, "date");
    for (const r of rows) if (!seen.has(r.id)) seen.set(r.id, r);
    onPage?.(page, seen.size);
    if (rows.length === 0) return [...seen.values()];
  }
}

export async function likesWalk(minLikes: number): Promise<SearchRow[]> {
  const out: SearchRow[] = [];
  for (let page = 1; ; page++) {
    const rows = await fetchSearchPage(page, "likes");
    out.push(...rows.filter((r) => r.likes >= minLikes));
    if (rows.length < PAGE_SIZE || rows[rows.length - 1].likes < minLikes) return out;
  }
}
