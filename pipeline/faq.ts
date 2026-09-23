// npm run data:faq: official rulings from ArkhamDB's /faqs pages into data/faq.json, by card code.
// The pager only links the first ten pages, so the walk goes on until a page adds nothing new.

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import { ROOT } from "./cache";
import { getText } from "./http";

const OUT = path.join(ROOT, "data", "faq.json");

export type Ruling = { name: string; updated: string; text: string };

export function rulingText(fragment: string): string {
  const t = fragment
    .replace(/<li>\s*/g, "\n- ")
    .replace(/<\/?(strong|b)>/g, "**")
    .replace(/<\/?(em|i)>/g, "*")
    .replace(/<br\s*\/?>|<\/p>/g, "\n")
    .replace(/<span class="icon-([a-z_]+)"[^>]*><\/span>/g, "[$1]")
    .replace(/<[^>]+>/g, "");
  return cheerio
    .load(`<p>${t}</p>`)("p")
    .text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function parseFaqPage(html: string): Map<string, Ruling> {
  const $ = cheerio.load(html);
  const out = new Map<string, Ruling>();
  $("article.review").each((_, article) => {
    const entry = $(article).parent();
    const link = entry.find(".review-header h4 a[data-code]").first();
    const code = link.attr("data-code");
    const date = entry.find(".review-date time").attr("datetime");
    const body = $(article).find(".review-text2").html();
    if (!code || !date || body == null) throw new Error(`a ruling without a card, date or text: ${entry.text().slice(0, 80)}`);
    out.set(code, { name: link.text(), updated: date.slice(0, 10), text: rulingText(body) });
  });
  return out;
}

// Built by hand: a JS object puts integer-like keys such as "10002" ahead of "01001".
export function faqJson(rulings: Map<string, Ruling>): string {
  const entries = [...rulings]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([code, ruling]) => ` ${JSON.stringify(code)}: ${JSON.stringify(ruling, null, 1).replace(/\n/g, "\n ")}`);
  return `{\n${entries.join(",\n")}\n}\n`;
}

async function main(): Promise<number> {
  const rulings = new Map<string, Ruling>();
  for (let page = 1; ; page++) {
    const res = await getText(page === 1 ? "/faqs" : `/faqs/${page}`);
    if (!res.ok) {
      console.error(res.message);
      return 1;
    }
    let added = 0;
    for (const [code, ruling] of parseFaqPage(res.data)) {
      if (!rulings.has(code)) added++;
      rulings.set(code, ruling);
    }
    console.log(`page ${page}: ${added} new, ${rulings.size} total`);
    if (!added) break;
  }
  fs.writeFileSync(OUT, faqJson(rulings));
  console.log(`${rulings.size} cards with rulings -> ${path.relative(ROOT, OUT)}`);
  return 0;
}

if (process.argv[1] === import.meta.filename) process.exitCode = await main();
