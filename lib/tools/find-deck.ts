import { tool } from "ai";
import { z } from "zod";
import { norm } from "../cards";
import { type Failure, failureText, safely, toolError, toolText, untrusted } from "../format";
import { DECK_INDEX } from "../index/decks";
import { type IndexRow, roleText } from "../index/schema";
import { ToolContextSchema } from "../tool-context";
import { deckUrl } from "../urls";

const LIMIT = 5;

// Words that say nothing about which deck: "my Lily deck", "the one with Shrivelling".
const STOP = new Set(
  "a an and deck decks list build for her his i is it me my of one our partner partners play plays playing s that the their them they this with".split(
    " ",
  ),
);

export type FoundDeck = Pick<
  IndexRow,
  "deckId" | "name" | "investigator" | "class" | "role" | "secondaryRole" | "archetypes" | "summary" | "likes"
> & { url: string; matched: string[] };

export type FindDeckResult = { ok: true; query: string; indexSize: number; decks: FoundDeck[]; allMatched: boolean } | Failure;

function words(s: string): string[] {
  return norm(s)
    .split(" ")
    .filter((w) => w && !STOP.has(w));
}

// "lil" is not Lily, but "arcan" finds arcane: a prefix counts from four letters.
function hit(w: string, field: Set<string>): boolean {
  if (field.has(w)) return true;
  return w.length >= 4 && [...field].some((f) => f.startsWith(w));
}

type Scored = { row: IndexRow; score: number; matched: string[] };

/** Ranks indexed decks by how a player names one: its title and investigator count most, then
 *  its role and archetypes, then its summary. The model judges the shortlist; this only orders it. */
export function findDecks(query: string, index: IndexRow[] = DECK_INDEX): FindDeckResult {
  const q = [...new Set(words(query))];
  if (!q.length) return toolError("Give the deck's name, its investigator, or what it does.");
  const scored: Scored[] = index.map((row) => {
    const fields: [Set<string>, number][] = [
      [new Set(words(row.name)), 3],
      [new Set(words(row.investigator)), 3],
      [new Set([row.role, row.secondaryRole ?? "", row.class, ...row.archetypes.flatMap(words)].filter(Boolean)), 2],
      [new Set(words(row.summary)), 1],
    ];
    let score = 0;
    const matched: string[] = [];
    for (const w of q) {
      const weight = Math.max(0, ...fields.filter(([f]) => hit(w, f)).map(([, n]) => n));
      if (weight) matched.push(w);
      score += weight;
    }
    return { row, score, matched };
  });
  const best = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.row.likes - a.row.likes)
    .slice(0, LIMIT);
  return {
    ok: true,
    query,
    indexSize: index.length,
    decks: best.map(({ row, matched }) => ({
      deckId: row.deckId,
      name: row.name,
      investigator: row.investigator,
      class: row.class,
      role: row.role,
      secondaryRole: row.secondaryRole,
      archetypes: row.archetypes,
      summary: row.summary,
      likes: row.likes,
      url: deckUrl(row.deckId, "decklist"),
      matched,
    })),
    allMatched: best.length > 0 && best[0].matched.length === q.length,
  };
}

export function findDeckText(r: FindDeckResult): string {
  if (!r.ok) return failureText(r);
  if (!r.decks.length)
    return `No deck in the index (${r.indexSize} decks) matches "${r.query}". Ask the player to paste the deck's ArkhamDB link; don't guess.`;
  const out = [
    `The indexed decks closest to "${r.query}" (of ${r.indexSize}; a deck outside the index can only be read from its link), best first${r.allMatched ? "" : ". None matches every word"}:`,
  ];
  for (const d of r.decks)
    out.push(
      `- ${d.deckId}: ${untrusted("deck name", d.name || "(untitled)")} | ${d.investigator} (${d.class}) | ${roleText(d)}${d.archetypes.length ? ` | archetypes ${d.archetypes.join(", ")}` : ""} | ${d.summary} | ${d.likes} likes | matched ${d.matched.join(", ")} | ${d.url}`,
    );
  out.push(
    "If one of these is clearly the deck the player means, read it with the deck tool. If two or more could be, ask which, naming each by investigator and deck name. If none fits, ask for the deck's ArkhamDB link.",
  );
  return out.join("\n");
}

const inputSchema = z.object({
  name: z.string().describe('How the player named the deck: its title, its investigator, what it does ("the bless Mary deck").'),
});

export type FindDeckInput = z.infer<typeof inputSchema>;

export const findDeckTool = tool({
  description:
    "Find a deck in the deck index by the way a player names it instead of linking it: its title, its investigator, " +
    "its role or what it is built around. Returns the closest indexed decks for you to judge. A deck outside the index " +
    "can't be found by name: ask for its ArkhamDB link.",
  inputSchema,
  contextSchema: ToolContextSchema,
  execute: async ({ name }): Promise<FindDeckResult> => safely(async () => findDecks(name)),
  toModelOutput: ({ output }) => toolText(findDeckText(output)),
});
