// npm run data:sheet -- next | status | <investigator code> [--all] [--page N]
// Prints what a labeler needs for an investigator's selected decks (five a page), offline from data/cache/.

import { investigatorStats, statsText } from "@/lib/card-text";
import { type CardStore, cleanText, getCards, label, type RawCard } from "@/lib/cards";
import { deckCards, deckMeta, guideText, investigatorSides, type RawDeck, xpInList } from "@/lib/decks";
import { getTaboos } from "@/lib/taboo";
import { loadCachedDeck, readCensus } from "./cache";
import { labelFileName, readLabels } from "./labels";
import { type InvestigatorSelection, type Selected, selectIndex } from "./selection";

const GUIDE_WORDS = 150;
const PAGE_SIZE = 5;

const SIGNALS: [string, (c: RawCard) => boolean][] = [
  ["bless", (c) => /\[bless\]/.test(text(c))],
  ["curse", (c) => /\[curse\]/.test(text(c))],
  ["seal", (c) => /\bSeal \(|\bseal/i.test(text(c))],
  ["doom", (c) => /\bdoom\b/i.test(text(c)) && c.faction_code !== "neutral"],
  ["succeed by", (c) => /succe\w* .{0,30}by (\d|X|exactly)/i.test(text(c))],
  ["fail", (c) => /\bfail/i.test(text(c))],
  ["secrets", (c) => /secret/i.test(text(c))],
  ["charges", (c) => /charge/i.test(text(c))],
  ["parley", (c) => /Parley/.test(text(c))],
  ["evade", (c) => /\bEvade\b|evade/.test(text(c))],
  ["heal", (c) => /\bheal/i.test(text(c))],
  ["soak", (c) => /may be assigned/i.test(text(c))],
  ["resources+", (c) => /gain \d+ resources|Uses \(\d+ resources/i.test(text(c))],
  ["draw", (c) => /draw \d+ cards?|draws? \d/i.test(text(c))],
  ["recursion", (c) => /discard pile/i.test(text(c))],
  ["remote", (c) => /(any|connecting|another) (revealed )?location/i.test(text(c))],
  ["move", (c) => /\bmove\b/i.test(text(c))],
  ["firearm", (c) => trait(c, "firearm")],
  ["tool", (c) => trait(c, "tool")],
  ["relic", (c) => trait(c, "relic")],
  ["ally", (c) => c.slot?.includes("Ally") ?? false],
  ["spell event", (c) => c.type_code === "event" && trait(c, "spell")],
  ["tactic", (c) => trait(c, "tactic")],
];

function text(c: RawCard): string {
  return c.real_text ?? c.text ?? "";
}

function trait(c: RawCard, t: string): boolean {
  return (c.real_traits ?? c.traits ?? "").toLowerCase().includes(t);
}

function sheet(store: CardStore, { row, deck }: Selected): string {
  const { inv, ability, options, parallelFront, parallelBack } = investigatorSides(store, deck);
  if (!inv || !ability) throw new Error(`deck ${deck.id}: investigator ${deck.investigator_code} is not in the card set`);
  const parallel = [parallelFront && "parallel front", parallelBack && "parallel back"].filter(Boolean).join(", ");
  const cards = deckCards(store, deck.slots, deckMeta(deck)).filter((c) => !c.weakness && c.type !== "investigator");
  const lines = [
    `### ${deck.id} | ${deck.name || row.name}`,
    `${inv.name}${parallel ? ` (${parallel})` : ""} | ${statsText(investigatorStats(ability))} | ${row.likes} likes | ${xpInList(cards)} XP | ${row.date.slice(0, 10)} | tags ${row.tags.join(", ") || "none"}`,
  ];
  if (options && options.code !== inv.code) lines.push(`deckbuilding from ${label(options)}`);
  for (const type of ["asset", "event", "skill"]) {
    const ofType = cards.filter((c) => c.type === type);
    if (ofType.length)
      lines.push(
        `${type}s: ${ofType.map((c) => `${c.qty} ${c.label}${c.customizations.length ? ` [${c.customizations.length} upgrades]` : ""}`).join(", ")}`,
      );
  }
  const tally = SIGNALS.map(
    ([name, test]) =>
      [
        name,
        cards.reduce((n, c) => {
          const card = store.get(c.code);
          return n + (card && test(card) ? c.qty : 0);
        }, 0),
      ] as const,
  )
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  lines.push(`signals: ${tally.map(([name, n]) => `${name} ${n}`).join(", ") || "none"}`);
  const guide = guideText(deck.description_md).split(/\s+/).filter(Boolean);
  lines.push(
    guide.length
      ? `guide (${guide.length} words): ${guide.slice(0, GUIDE_WORDS).join(" ")}${guide.length > GUIDE_WORDS ? " ..." : ""}`
      : "guide: none",
  );
  return lines.join("\n");
}

function abilityText(store: CardStore, deck: RawDeck): string {
  const { ability } = investigatorSides(store, deck);
  return ability ? cleanText(ability.text) : "";
}

async function main(): Promise<number> {
  const [mode, ...flags] = process.argv.slice(2);
  const pageAt = flags.indexOf("--page");
  const page = pageAt >= 0 ? Number(flags[pageAt + 1]) : undefined;
  const [store, taboos] = await Promise.all([getCards(), getTaboos()]);
  const selection = await selectIndex(store, taboos, readCensus().rows, loadCachedDeck);
  const labels = readLabels();
  const unlabeled = (inv: InvestigatorSelection) => inv.decks.filter((s) => labels.get(s.deck.id)?.filedUnder !== inv.code);

  if (mode === "status") {
    const done = selection.reduce((n, inv) => n + inv.decks.length - unlabeled(inv).length, 0);
    const total = selection.reduce((n, inv) => n + inv.decks.length, 0);
    console.log(`${done} of ${total} selected decks labeled`);
    for (const inv of selection.filter((i) => unlabeled(i).length))
      console.log(`  ${inv.code} ${inv.name}: ${unlabeled(inv).length} to label`);
    return 0;
  }
  const inv = mode === "next" ? selection.find((i) => unlabeled(i).length) : selection.find((i) => i.code === mode);
  if (!inv) {
    if (mode === "next") {
      console.log("Every selected deck is labeled.");
      return 0;
    }
    console.error(`No owned investigator has code ${mode}.`);
    return 1;
  }
  const pool = flags.includes("--all") ? inv.decks : unlabeled(inv);
  const decks = page ? pool.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : pool;
  console.log(
    `## ${inv.code} ${inv.name}: ${decks.length} of ${pool.length} decks -> data/deck-labels/${labelFileName(inv.code, inv.name)}`,
  );
  if (decks[0]) console.log(`ability: ${abilityText(store, decks[0].deck)}\n`);
  for (const s of decks) {
    console.log(sheet(store, s));
    const existing = labels.get(s.deck.id);
    if (existing)
      console.log(
        `LABEL: ${existing.role}/${existing.secondaryRole ?? "-"} | ${existing.archetypes.join(", ") || "no archetype"} | ${existing.summary}${existing.filedUnder === inv.code ? "" : ` (filed under ${existing.filedUnder})`}`,
      );
    console.log();
  }
  return 0;
}

process.exitCode = await main();
