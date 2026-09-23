import { tool } from "ai";
import { z } from "zod";
import { ARCHETYPE_NAMES, ARCHETYPES } from "../archetypes";
import { type CardStore, getCards, norm } from "../cards";
import { fetchDeck, notADeck, parseRef } from "../decks";
import { type Failure, failureText, fromFetched, notFound, safely, toolText, untrusted } from "../format";
import { COMPLEMENT, DECK_INDEX } from "../index/decks";
import { CLASSES, type IndexRow, ROLES, type Role, roleText } from "../index/schema";
import { DEFAULT_SETTINGS, type Settings, SettingsSchema } from "../settings";
import { tabooInForce } from "../taboo";
import { deckUrl } from "../urls";

const DECK_TAGS = ["multiplayer", "solo", "beginner", "theme"] as const;

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

/** `xp` is the XP under the players' taboo setting. */
export type Shortlisted = Omit<IndexRow, "cards" | "xpTaboo" | "tabooLegal" | "tabooList"> & { url: string };

type PartnerTarget = {
  id: number;
  name: string;
  investigator: string;
  role: Role | null;
  inIndex: boolean;
};

type PartnerSearch = PartnerTarget & { rolesSought: Role[] };

export type Filter =
  | { kind: "taboo" | "class" | "investigator" | "archetype" | "tag" | "maxXp" | "keyCard" | "role"; value: string }
  | { kind: "partner"; value: string; deck: number };

export type RecommendResult =
  | {
      ok: true;
      kind: "shortlist";
      filters: Filter[];
      indexSize: number;
      matched: number;
      decks: Shortlisted[];
      pairWith?: PartnerSearch;
      note?: string;
    }
  | {
      ok: true;
      kind: "needs_role";
      deck: PartnerTarget;
    }
  | Failure;

function keyCardCodes(store: CardStore, q: string): Set<string> | null {
  const { level, groups } = store.find(q);
  const codes = groups
    .flat()
    .filter((c) => level === undefined || (c.xp ?? 0) === level)
    .map((c) => store.canonical(c.code));
  return codes.length ? new Set(codes) : null;
}

function shortlist(rows: IndexRow[], limit: number, onePerInvestigator: boolean, roles: Role[] | null): IndexRow[] {
  const seen = new Set<string>();
  const out: IndexRow[] = [];
  const take = (pool: IndexRow[], n: number) => {
    for (const r of [...pool].sort((a, b) => b.likes - a.likes)) {
      if (out.length >= n) return;
      if (out.includes(r) || (onePerInvestigator && seen.has(r.investigatorCode))) continue;
      seen.add(r.investigatorCode);
      out.push(r);
    }
  };
  // the first role sought fills three quarters of the list, the other roles the rest
  if (roles && roles.length > 1) {
    take(
      rows.filter((r) => r.role === roles[0]),
      limit - Math.floor(limit / 4),
    );
    take(
      rows.filter((r) => r.role !== roles[0]),
      limit,
    );
  }
  take(rows, limit);
  return out;
}

function shown(
  { cards: _cards, xpTaboo: _xpTaboo, tabooLegal: _tabooLegal, tabooList: _tabooList, ...row }: IndexRow,
  xp: number,
): Shortlisted {
  return { ...row, xp, url: deckUrl(row.deckId, "decklist") };
}

async function partnerTarget(ref: string, index: IndexRow[]): Promise<{ ok: true; target: PartnerTarget } | Failure> {
  const parsed = parseRef(ref);
  if (!parsed) return notADeck(ref);
  const row = parsed.kind === "deck" ? undefined : index.find((r) => r.deckId === parsed.id);
  if (row)
    return {
      ok: true,
      target: { id: row.deckId, name: row.name, investigator: row.investigator, role: row.role, inIndex: true },
    };
  const fetched = await fetchDeck(parsed);
  if (!fetched.ok) return fromFetched(fetched);
  const { deck } = fetched.data;
  const store = await getCards();
  const investigator =
    store.get(store.canonical(deck.investigator_code))?.name ?? deck.investigator_name ?? deck.investigator_code;
  return { ok: true, target: { id: parsed.id, name: deck.name, investigator, role: null, inIndex: false } };
}

export async function recommend(
  input: RecommendInput,
  settings: Settings = DEFAULT_SETTINGS,
  index: IndexRow[] = DECK_INDEX,
): Promise<RecommendResult> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT));
  const filters: Filter[] = [];
  const xpOf = (r: IndexRow) => (settings.taboo ? r.xpTaboo : r.xp);
  let rows = index;
  const keep = (filter: Filter, test: (r: IndexRow) => boolean) => {
    rows = rows.filter(test);
    filters.push(filter);
  };

  let note: string | undefined;
  if (settings.taboo) {
    // Every row is counted under one list, the one current when the index was built.
    const built = index[0]?.tabooList;
    keep({ kind: "taboo", value: built ?? "" }, (r) => r.tabooLegal);
    const live = await tabooInForce(settings);
    if (live.error) note = `The index checks taboo list ${built}; the current list could not be loaded (${live.error}).`;
    else if (live.list && live.list.code !== built)
      note = `The index checks taboo list ${built}, but ${live.list.code} is current: XP and legality here may be out of date, so read a deck before recommending it.`;
  }
  if (input.class) keep({ kind: "class", value: input.class }, (r) => r.class === input.class);
  if (input.investigator) {
    const wanted = norm(input.investigator);
    keep({ kind: "investigator", value: input.investigator }, (r) => norm(r.investigator).includes(wanted));
  }
  const { archetype, tag, maxXp } = input;
  if (archetype) keep({ kind: "archetype", value: archetype }, (r) => r.archetypes.includes(archetype));
  if (tag) keep({ kind: "tag", value: tag }, (r) => r.tags.includes(tag));
  if (maxXp !== undefined) keep({ kind: "maxXp", value: String(maxXp) }, (r) => xpOf(r) <= maxXp);
  if (input.keyCard) {
    const codes = keyCardCodes(await getCards(), input.keyCard);
    if (!codes) return notFound(`No card is named "${input.keyCard}".`);
    keep({ kind: "keyCard", value: input.keyCard }, (r) => r.cards.some((c) => codes.has(c)));
  }

  let roles: Role[] | null = input.role ? [input.role] : null;
  let pairWith: PartnerSearch | undefined;
  if (input.pairWith) {
    const found = await partnerTarget(input.pairWith, index);
    if (!found.ok) return found;
    const { target } = found;
    if (!roles) {
      if (!target.role) return { ok: true, kind: "needs_role", deck: target };
      roles = COMPLEMENT[target.role];
    }
    pairWith = { ...target, rolesSought: roles };
    keep(
      { kind: "partner", value: target.investigator, deck: target.id },
      (r) => norm(r.investigator) !== norm(target.investigator),
    );
  }
  if (roles) {
    const allowed = new Set(roles);
    keep({ kind: "role", value: roles.join(" or ") }, (r) => allowed.has(r.role));
  }

  const picked = shortlist(rows, limit, !input.investigator, roles);
  return {
    ok: true,
    kind: "shortlist",
    filters,
    indexSize: index.length,
    matched: rows.length,
    decks: picked.map((r) => shown(r, xpOf(r))),
    ...(pairWith ? { pairWith } : {}),
    ...(note ? { note } : {}),
  };
}

function filterText(f: Filter): string {
  switch (f.kind) {
    case "taboo":
      return `legal under taboo list ${f.value}`;
    case "tag":
      return `tagged ${f.value}`;
    case "maxXp":
      return `at most ${f.value} XP`;
    case "keyCard":
      return `runs ${f.value}`;
    case "partner":
      return `partner for deck ${f.deck}, not ${f.value}`;
    default:
      return `${f.kind} ${f.value}`;
  }
}

export function recommendText(r: RecommendResult): string {
  if (!r.ok) return failureText(r);
  if (r.kind === "needs_role")
    return `NEEDS ROLE: Deck ${r.deck.id} is not in the index, so its role is unknown. Read it with the deck tool, decide what it lacks, and call again with role set to the role that fills the gap.`;
  const out = [
    `Index of ${r.indexSize} labeled decks buildable from the collection. Filters: ${r.filters.map(filterText).join("; ") || "none"}. ${r.matched} match.`,
    ...(r.note ? [r.note] : []),
  ];
  if (r.pairWith) {
    const p = r.pairWith;
    out.push(
      `Partner search for deck ${p.id} (${p.investigator}, role ${p.role ?? "judged by you"}${p.inIndex ? "" : ", not in the index"}); looking for ${p.rolesSought.join(" or ")}.`,
    );
  }
  if (!r.decks.length) {
    out.push("No deck in the index fits. Say so, and suggest loosening a filter.");
    return out.join("\n");
  }
  const order = r.pairWith && r.pairWith.rolesSought.length > 1 ? `${r.pairWith.rolesSought[0]} first, then ` : "";
  out.push(
    `Shortlist, ${order}most liked first, one per investigator unless one was asked for. Read a deck with the deck tool before recommending it:`,
  );
  for (const d of r.decks) {
    const fields = [
      `${d.deckId}: ${untrusted("deck name", d.name || "(untitled)")}`,
      `${d.investigator} (${d.class})`,
      roleText(d),
      d.archetypes.length ? `archetypes ${d.archetypes.join(", ")}` : "no archetype",
      d.summary,
      d.tags.length ? `tagged ${d.tags.join(", ")}` : "untagged",
      `XP in list ${d.xp}`,
      `${d.likes} likes`,
      `published ${d.published}`,
      d.url,
    ];
    out.push(`- ${fields.join(" | ")}`);
  }
  return out.join("\n");
}

const ARCHETYPE_GUIDE = ARCHETYPE_NAMES.map((a) => `${a} (${ARCHETYPES[a].what})`).join("; ");

const inputSchema = z.object({
  class: z.enum(CLASSES).optional(),
  role: z.enum(ROLES).optional().describe("fighter, cluever, flex (does both) or support."),
  archetype: z.enum(ARCHETYPE_NAMES).optional().describe(`What the deck is built around. ${ARCHETYPE_GUIDE}.`),
  tag: z
    .enum(DECK_TAGS)
    .optional()
    .describe(
      "The author's ArkhamDB tag. A solo tag means the deck stands on its own, which is no mark against it in two-player.",
    ),
  maxXp: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Only decks whose whole list costs at most this much XP; 0 for campaign-start lists."),
  keyCard: z.string().optional().describe('A card the deck must run, e.g. "Rite of Seeking" or "Shrivelling (3)".'),
  investigator: z.string().optional(),
  pairWith: z.string().optional().describe("A deck id or link to find a two-player partner for."),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional().describe(`How many to shortlist, default ${DEFAULT_LIMIT}.`),
});

export type RecommendInput = z.infer<typeof inputSchema>;

export const recommendDecksTool = tool({
  description:
    "Shortlist ArkhamDB decks from the deck index: each owned investigator's most liked decks that the collection can build, " +
    "each with a role, a one-line summary and any archetype it is built around. " +
    "Filter by class, role, archetype, ArkhamDB tag, XP, investigator, or a key card the deck runs. " +
    "With pairWith, find partners for a given deck in the roles that fill its gap, never the same investigator; " +
    "for a deck outside the index, read it first and pass role once you have judged its gap. " +
    "The shortlist is a starting point: read a deck with the deck tool before recommending it.",
  inputSchema,
  contextSchema: SettingsSchema,
  execute: (input, { context }): Promise<RecommendResult> => safely(() => recommend(input, context)),
  toModelOutput: ({ output }) => toolText(recommendText(output)),
});
