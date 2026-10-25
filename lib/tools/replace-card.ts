import { tool } from "ai";
import { z } from "zod";
import { type CardFace, cardHead, type Rulings, rulingsMarkdown, tabooChangeText, traitList } from "../card-text";
import { type CardStore, cardFace, icons, isDeckCardType, norm, parseCardQuery, type RawCard } from "../cards";
import { type DeckCard, ignoredCopies, isWeakness, openDeck } from "../decks";
import { type Failure, failureText, notFound, safely, toolError, toolText } from "../format";
import { playRate, type Share, shareText } from "../index/usage";
import { rulesFor } from "../legality";
import { DEFAULT_SETTINGS, type Settings, SettingsSchema } from "../settings";

export const GOALS = ["cheaper", "same_job", "different_job", "collection"] as const;
export type Goal = (typeof GOALS)[number];

const DEFAULT_LIMIT = 10;
const MIN_LIMIT = 3;
const MAX_LIMIT = 20;

export type Candidate = CardFace & {
  legalBecause: string;
  playedBy: { investigator: Share; class: Share };
};

export type ReplaceResult =
  | {
      ok: true;
      kind: "replacements";
      deck: { id: number; name: string; investigator: string };
      goal: Goal;
      replacing: DeckCard;
      replacingRulings?: Rulings;
      maxXp: number;
      note?: string;
      candidates: Candidate[];
      considered: number;
    }
  | {
      ok: true;
      kind: "ambiguous";
      card: string;
      versions: { code: string; label: string }[];
    }
  | (Failure & {
      deckList?: string[];
    });

const WORD = /[a-z]{4,}/g;
const STOP = new Set([
  "your",
  "that",
  "this",
  "with",
  "from",
  "each",
  "then",
  "when",
  "after",
  "during",
  "card",
  "cards",
  "play",
  "into",
  "have",
  "until",
  "turn",
  "round",
]);

const LIKENESS = { sameType: 3, sameSlot: 2, perSharedTrait: 1, textOverlap: 6, perSharedIcon: 0.5 };

const POPULARITY = { investigator: 4, class: 2 };

const DIFFERENT_JOB = { unlikeBelow: 5, unlikeBonus: 1, likenessDivisor: 3 };

function words(t?: string): Set<string> {
  return new Set((norm(t ?? "").match(WORD) ?? []).filter((w) => !STOP.has(w)));
}

function similarity(a: RawCard, b: RawCard): number {
  let s = 0;
  if (a.type_code === b.type_code) s += LIKENESS.sameType;
  if (a.slot && a.slot === b.slot) s += LIKENESS.sameSlot;
  const ta = new Set(traitList(a.traits));
  for (const t of traitList(b.traits)) if (ta.has(t)) s += LIKENESS.perSharedTrait;
  const wa = words(a.text);
  const wb = words(b.text);
  const inter = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size || 1;
  s += LIKENESS.textOverlap * (inter / union);
  const ia = icons(a);
  const ib = icons(b);
  s += LIKENESS.perSharedIcon * ia.filter((i) => ib.includes(i)).length;
  return s;
}

function popularity(p: Candidate["playedBy"]): number {
  return POPULARITY.investigator * p.investigator.share + POPULARITY.class * p.class.share;
}

function score(goal: Goal, likeness: number, pop: number): number {
  if (goal !== "different_job") return likeness + pop;
  const unlike = likeness < DIFFERENT_JOB.unlikeBelow ? DIFFERENT_JOB.unlikeBonus : -likeness / DIFFERENT_JOB.likenessDivisor;
  return pop + unlike;
}

type Target = { kind: "found"; card: DeckCard } | { kind: "ambiguous"; hits: DeckCard[] } | { kind: "missing"; list: string[] };

function resolveTarget(store: CardStore, cards: DeckCard[], q: string): Target {
  const code = store.canonical(q.trim());
  const byCode = cards.find((c) => store.canonical(c.code) === code);
  if (byCode) return { kind: "found", card: byCode };
  const { name, level } = parseCardQuery(q);
  const missing = (): Target => ({ kind: "missing", list: cards.filter((c) => !c.weakness).map((c) => c.label) });
  // An empty name (from "(3)" or "?") is a substring of every name.
  if (!name) return missing();
  const hits = cards.filter((c) => norm(c.name) === name && (level === undefined || c.level === level));
  if (hits.length === 1) return { kind: "found", card: hits[0] };
  if (hits.length > 1) return { kind: "ambiguous", hits };
  const loose = cards.filter((c) => norm(c.name).includes(name));
  if (loose.length === 1) return { kind: "found", card: loose[0] };
  return missing();
}

function* candidatePool(
  store: CardStore,
  target: DeckCard,
  targetCard: RawCard,
  goal: Goal,
  maxXp: number,
  inDeck: Set<string>,
): Generator<RawCard> {
  for (const c of store.byCode.values()) {
    if (c.encounter_code || store.isReprint(c.code) || !isDeckCardType(c.type_code)) continue;
    // A signature, advanced or not, is required by its investigator and never fills a free slot.
    if (isWeakness(c) || c.bonded_to || c.hidden || c.restrictions?.investigator) continue;
    if (inDeck.has(c.code) || !store.inCollection(c.code)) continue;
    const lvl = c.xp ?? 0;
    if (lvl > maxXp) continue;
    if (goal === "cheaper" && !(lvl < target.level || (lvl === target.level && (c.cost ?? 0) < (target.cost ?? 0)))) continue;
    if ((goal === "same_job" || goal === "collection") && c.type_code !== targetCard.type_code) continue;
    yield c;
  }
}

export async function replaceCard(
  input: { deck: string; card: string; goal: Goal; maxXp?: number; limit?: number },
  settings: Settings = DEFAULT_SETTINGS,
): Promise<ReplaceResult> {
  const opened = await openDeck(input.deck, settings);
  if (!opened.ok) return opened;
  const { store, deck, meta, taboo, tabooError, cards } = opened;
  const { inv, options } = opened.sides;
  if (tabooError)
    return toolError(`The taboo list is on but could not be loaded (${tabooError}), so legality cannot be checked.`);
  const found = resolveTarget(store, cards, input.card);
  if (found.kind === "ambiguous")
    return {
      ok: true,
      kind: "ambiguous",
      card: input.card,
      versions: found.hits.map((h) => ({ code: h.code, label: h.label })),
    };
  if (found.kind === "missing") return { ...notFound(`${input.card} is not in this deck's list.`), deckList: found.list };
  const target = found.card;
  const targetCard = store.get(target.code);
  if (!targetCard) return toolError(`Card ${target.code} is not in the card set.`);

  const rules = rulesFor(store, inv.code, options, meta, taboo, ignoredCopies(deck));
  const rest = { ...deck.slots };
  delete rest[target.code];
  const inDeck = new Set(Object.keys(deck.slots).map((c) => store.canonical(c)));
  const maxXp = input.maxXp ?? target.level;
  const goal = input.goal;
  const note =
    goal === "collection" && target.owned
      ? `${target.label} is already in the collection; these are owned alternatives doing the same job.`
      : undefined;

  const scored: { c: RawCard; score: number; why: string; played: Candidate["playedBy"] }[] = [];
  for (const c of candidatePool(store, target, targetCard, goal, maxXp, inDeck)) {
    const v = rules.check(c, rest, target.qty);
    if (!v.legal) continue;
    const played = playRate(store.canonical(inv.code), inv.faction_code, c.code, c.xp ?? 0);
    scored.push({ c, score: score(goal, similarity(targetCard, c), popularity(played)), why: v.reason, played });
  }
  scored.sort((a, b) => b.score - a.score || (a.c.xp ?? 0) - (b.c.xp ?? 0));
  const limit = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, input.limit ?? DEFAULT_LIMIT));
  const rulings = store.rulings(target.code);
  return {
    ok: true,
    kind: "replacements",
    deck: { id: deck.id, name: deck.name, investigator: inv.name },
    goal,
    replacing: target,
    ...(rulings ? { replacingRulings: rulings } : {}),
    maxXp,
    ...(note ? { note } : {}),
    considered: scored.length,
    candidates: scored
      .slice(0, limit)
      .map(({ c, why, played }) => ({ ...cardFace(store, c, taboo), legalBecause: why, playedBy: played })),
  };
}

export function replaceText(r: ReplaceResult): string {
  if (!r.ok) return `${failureText(r)}${r.deckList ? ` The list has: ${r.deckList.join(", ")}.` : ""}`;
  if (r.kind === "ambiguous")
    return `AMBIGUOUS: the deck runs more than one version of ${r.card}: ${r.versions.map((v) => `${v.label} [${v.code}]`).join(", ")}. Say which.`;
  const t = r.replacing;
  const out = [
    `Replacing ${t.qty}x ${t.label} [${t.code}] (${cardHead(t)}) in deck ${r.deck.id} (${r.deck.investigator}). Goal: ${r.goal}. Level cap ${r.maxXp}.`,
    `  its text: ${t.text}`,
    ...(r.replacingRulings ? [`  its official rulings: ${rulingsMarkdown(r.replacingRulings).replace(/\n/g, " ")}`] : []),
  ];
  if (r.note) out.push(r.note);
  out.push(
    `${r.considered} legal, owned cards pass the goal's filter; the best ${r.candidates.length} by likeness and by how often liked decks play them. Legality is checked against this deck's options and limits with ${t.label} removed. Judge the fit from the text:`,
  );
  for (const c of r.candidates) {
    out.push(
      `- ${c.label} [${c.code}] (${cardHead(c)}) ${c.text}${c.taboo ? `\n    TABOO: ${tabooChangeText(c.taboo)}` : ""}\n    legal: ${c.legalBecause}; played in ${shareText(c.playedBy.investigator)} liked decks for this investigator, ${shareText(c.playedBy.class)} for this class`,
    );
  }
  if (!r.candidates.length)
    out.push("Nothing legal and owned passes this goal. Say so, and suggest a different goal or a higher level cap.");
  return out.join("\n");
}

const inputSchema = z.object({
  deck: z.string().describe("A deck id or arkhamdb.com deck link."),
  card: z.string().describe('The card to replace, by name ("Machete", "Shrivelling (3)") or code.'),
  goal: z.enum(GOALS),
  maxXp: z.number().int().min(0).max(5).optional().describe("Highest level allowed. Defaults to the replaced card's level."),
  limit: z.number().int().min(MIN_LIMIT).max(MAX_LIMIT).optional().describe(`How many candidates, default ${DEFAULT_LIMIT}.`),
});

export type ReplaceInput = z.infer<typeof inputSchema>;

export const replaceCardTool = tool({
  description:
    "Find legal substitutes for one card in an ArkhamDB deck. Candidates are cards in the collection that this " +
    "investigator can include, checked against the deck's own options and limits with the old card removed. " +
    "Goals: cheaper (lower level or cost), same_job (same kind of card doing similar work), different_job " +
    "(a new effect this investigator's decks play), collection (an owned stand-in for a card not owned). " +
    "Candidates are ranked by likeness and popularity only; pick from their text.",
  inputSchema,
  contextSchema: SettingsSchema,
  execute: (input, { context }): Promise<ReplaceResult> => safely(() => replaceCard(input, context)),
  toModelOutput: ({ output }) => toolText(replaceText(output)),
});
