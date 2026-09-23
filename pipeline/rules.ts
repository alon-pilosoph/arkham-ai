// npm run data:rules [-- saved.html]: ArkhamDB's Rules Reference (#rules column) as Markdown in
// data/rules.md, which the app inlines into its system prompt.

import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { ROOT } from "./cache";
import { getText } from "./http";

const OUT = path.join(ROOT, "data", "rules.md");
const RULES_URL = "https://arkhamdb.com/rules";

const BLOCK = new Set(["p", "h1", "h2", "h3", "li", "blockquote", "tr", "dd", "div", "ul", "ol", "table"]);
const SKIP = new Set(["script", "button", "footer"]);
const EMPHASIS: Record<string, string> = { b: "**", strong: "**", i: "*", em: "*", cite: "*" };

function textOf(node: AnyNode): string {
  if (node.type === "text") return node.data;
  return node.type === "tag" ? (node as Element).children.map(textOf).join("") : "";
}

function emit(node: AnyNode, out: string[], lists: number): void {
  if (node.type === "text") {
    out.push(node.data.replace(/\s+/g, " "));
    return;
  }
  if (node.type !== "tag") return;
  const el = node as Element;
  const tag = el.name;
  if (SKIP.has(tag)) return;
  // an empty <i></i> would print as "**", which reads as bold
  const marker = EMPHASIS[tag];
  if (marker && !textOf(el).trim()) {
    for (const child of el.children) emit(child, out, lists);
    return;
  }
  const nested = tag === "ul" || tag === "ol" ? lists + 1 : lists;
  if (BLOCK.has(tag)) out.push("\n");
  if (tag === "h1" || tag === "h2" || tag === "h3") out.push(`${"#".repeat(Number(tag[1]))} `);
  else if (tag === "li") out.push(`${"  ".repeat(Math.max(lists - 1, 0))}- `);
  else if (tag === "blockquote") out.push("> ");
  else if (marker) out.push(marker);
  else if (tag === "td" || tag === "th") out.push("| ");
  else if (tag === "br") out.push("\n");
  else if (tag === "span" && (el.attribs.class ?? "").includes("icon"))
    out.push(`[${(el.attribs.class ?? "").split("icon-").at(-1)}]`);
  for (const child of el.children) emit(child, out, nested);
  if (marker) out.push(marker);
  else if (tag === "td" || tag === "th") out.push(" ");
  else if (tag === "tr") out.push("|");
  if (BLOCK.has(tag)) out.push("\n");
}

export function rulesMarkdown(html: string): string {
  // htmlparser2 keeps the markup as written; a spec parser would "repair" the page's stray tags
  // (an <i> spanning two paragraphs) by merging what the author kept apart
  const $ = cheerio.load(html, { xml: { xmlMode: false, decodeEntities: true } });
  const root = $("div#rules").get(0);
  if (!root) throw new Error("the page has no #rules column");
  const out: string[] = [];
  for (const child of root.children) emit(child, out, 0);
  const tightList = /(\n\s*- [^\n]*)\n\n(?=\s*- )/g;
  const text = out
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+(?=[^-\s])/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^(\s*)-\s+/gm, "$1- ")
    .replace(tightList, "$1\n")
    .replace(tightList, "$1\n");
  return `${text.trim()}\n`;
}

async function main(): Promise<number> {
  const saved = process.argv[2];
  let page: string;
  if (saved) page = fs.readFileSync(saved, "utf8");
  else {
    const res = await getText(RULES_URL);
    if (!res.ok) {
      console.error(res.message);
      return 1;
    }
    page = res.data;
  }
  const md = `# Arkham Horror: The Card Game, Rules Reference\n\nSource: ${RULES_URL}\n\n${rulesMarkdown(page)}`;
  fs.writeFileSync(OUT, md);
  const headings = md.match(/^#{1,3} /gm)?.length ?? 0;
  console.log(`${path.relative(ROOT, OUT)}: ${md.split(/\s+/).length} words, ${headings} headings, ${md.length} chars`);
  return 0;
}

if (process.argv[1] === import.meta.filename) process.exitCode = await main();
