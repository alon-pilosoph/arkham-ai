import fs from "node:fs";
import path from "node:path";
import { type Fetched, getJson } from "./arkhamdb";
import type { CardFace, Customization } from "./card-text";
import { type CardStore, cardFace, cleanText, DECK_CARD_TYPES, getCards, type RawCard } from "./cards";
import { type Failure, fromFetched, notFound, toolError } from "./format";
import type { Settings } from "./settings";
import { type TabooEntry, type TabooList, tabooEntry, tabooInForce } from "./taboo";
import type { CampaignContext } from "./tool-context";
import type { DeckKind } from "./urls";

export type RawDeck = {
  id: number;
  name: string;
  date_creation?: string;
  date_update?: string;
  description_md?: string;
  investigator_code: string;
  investigator_name?: string;
  slots: Record<string, number>;
  sideSlots?: Record<string, number> | unknown[];
  ignoreDeckLimitSlots?: Record<string, number> | unknown[] | null;
  xp?: number | null;
  xp_spent?: number | null;
  taboo_id?: number | null;
  meta?: string | Record<string, string>;
  tags?: string;
  previous_deck?: number | null;
  next_deck?: number | null;
};

export type DeckList = Pick<RawDeck, "id" | "investigator_code" | "slots" | "meta" | "taboo_id" | "ignoreDeckLimitSlots">;

export function ignoredCopies(d: Pick<RawDeck, "ignoreDeckLimitSlots">): Record<string, number> {
  const i = d.ignoreDeckLimitSlots;
  return i && !Array.isArray(i) ? i : {};
}

type DeckRef = { id: number; kind?: DeckKind };

export function parseRef(ref: string | number): DeckRef | null {
  const s = String(ref).trim();
  if (/^\d+$/.test(s)) return { id: Number(s) };
  const m = s.match(/arkhamdb\.com\/(decklist|deck)\/(?:view\/|edit\/)?(\d+)/);
  if (m) return { id: Number(m[2]), kind: m[1] as DeckKind };
  return null;
}

/** ARKHAM_DECKS_DIR serves decklists from `decklist-<id>.json` files instead of ArkhamDB, as
 *  ARKHAM_CARDS_FILE does for the card set: the Playwright run and offline screenshots use it. */
function deckFromDir(dir: string, ref: DeckRef): Fetched<{ deck: RawDeck; kind: DeckKind }> {
  const file = path.join(dir, `decklist-${ref.id}.json`);
  if (ref.kind === "deck" || !fs.existsSync(file))
    return { ok: false, status: "not_found", message: `No deck ${ref.id} in ${dir}.` };
  return { ok: true, data: { deck: JSON.parse(fs.readFileSync(file, "utf8")) as RawDeck, kind: "decklist" } };
}

/** Decklists and personal decks have separate id spaces; a bare id tries decklists first. */
export async function fetchDeck(ref: DeckRef): Promise<Fetched<{ deck: RawDeck; kind: DeckKind }>> {
  const dir = process.env.ARKHAM_DECKS_DIR;
  if (dir) return deckFromDir(dir, ref);
  const kinds: DeckKind[] = ref.kind ? [ref.kind] : ["decklist", "deck"];
  const errors: string[] = [];
  for (const kind of kinds) {
    const r = await getJson<RawDeck>(`/api/public/${kind}/${ref.id}`);
    if (r.ok && r.data?.slots) return { ok: true, data: { deck: r.data, kind } };
    if (!r.ok && r.status === "error") errors.push(r.message);
  }
  if (errors.length) return { ok: false, status: "error", message: errors.join("; ") };
  return {
    ok: false,
    status: "not_found",
    message: `No deck ${ref.id} on ArkhamDB${ref.kind === "deck" || !ref.kind ? " (a personal deck is only readable when its owner has made it public)" : ""}.`,
  };
}

export function deckMeta(d: Pick<RawDeck, "meta">): Record<string, string> {
  if (!d.meta) return {};
  let meta: unknown = d.meta;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta || "{}");
    } catch {
      return {};
    }
  }
  // Written by the deck's author: "null" or an array parses, and would break every lookup.
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, string>) : {};
}

/** A parallel investigator swaps its front (ability) and/or back (deckbuilding) for a 90xxx card. */
export function investigatorSides(store: CardStore, d: DeckList) {
  const inv = store.get(d.investigator_code);
  const meta = deckMeta(d);
  const alt = (k: string) => {
    const code = String(meta[k] ?? "");
    return code.startsWith("90") ? store.get(code) : undefined;
  };
  const front = alt("alternate_front");
  const back = alt("alternate_back");
  return { inv, ability: front ?? inv, options: back ?? inv, parallelFront: !!front, parallelBack: !!back };
}

type CustomizationPart = { index: number; boxes: number; choice?: string };

/** ArkhamDB's meta.cus_<code>: "index|boxes[|choice],..." per purchased option, where index is
 *  the customization_text line and choice what the option names: card codes, traits or a skill,
 *  several joined by "^". */
export function parseCustomization(raw: string | undefined): CustomizationPart[] {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((part) => {
      const [i, boxes, choice] = part.split("|");
      return { index: Number(i), boxes: Number(boxes) || 0, choice };
    })
    .filter((p) => Number.isInteger(p.index) && p.index >= 0);
}

function customizations(store: CardStore, meta: Record<string, string>, code: string): Customization[] {
  const parts = parseCustomization(meta[`cus_${code}`]);
  const c = store.get(code);
  const opts = (c?.customization_text ?? "").split("\n").filter((o) => o.trim());
  if (!parts.length || !opts.length) return [];
  const out: Customization[] = [];
  for (const { index: idx, boxes, choice } of parts) {
    if (idx >= opts.length) continue;
    // Each option line opens with one box glyph per checkbox: "□□ <b>Durable.</b> ..."
    const total = opts[idx].match(/^[□☐]+/)?.[0].length ?? 0;
    const text = cleanText(opts[idx].replace(/^[□☐]+\s*/, ""));
    const picks = (choice ?? "").split("^").filter(Boolean);
    const cards = picks.map((p) => store.get(p)?.name);
    const chosen = cards.every(Boolean)
      ? { choice: cards.join(", ") }
      : { choice: picks.join(", "), choiceIsText: true as const };
    out.push({ text, boxes, total, ...(picks.length ? chosen : {}) });
  }
  return out;
}

export function guideText(md?: string): string {
  let t = (md ?? "").replace(/<[^>]+>/g, " ");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
  t = t.replace(/[ \t]+/g, " ");
  return t.replace(/\n\s*\n+/g, "\n").trim();
}

export type DeckCard = CardFace & {
  qty: number;
  customizations: Customization[];
  owned: boolean;
  weakness: boolean;
  /** XP these copies cost: exceptional doubles, myriad pays once, customizable boxes add. */
  xpCost: number;
  hasRulings: boolean;
};

export function isExceptional(c: RawCard, t?: TabooEntry): boolean {
  return !!(t?.exceptional ?? c.exceptional);
}

export function isWeakness(c: RawCard): boolean {
  return c.subtype_code === "weakness" || c.subtype_code === "basicweakness";
}

export function deckCards(
  store: CardStore,
  slots: Record<string, number>,
  meta: Record<string, string>,
  taboo?: TabooList,
): DeckCard[] {
  const typeOrder = (type: string) => {
    const i = (DECK_CARD_TYPES as readonly string[]).indexOf(type);
    return i < 0 ? DECK_CARD_TYPES.length : i;
  };
  return Object.entries(slots)
    .map(([code, qty]): DeckCard => {
      const c = store.get(code);
      if (!c) {
        return {
          code,
          qty,
          name: `unknown card ${code}`,
          label: `unknown card ${code}`,
          level: 0,
          type: "?",
          classes: [],
          icons: [],
          text: "",
          customizations: [],
          owned: false,
          weakness: false,
          xpCost: 0,
          hasRulings: false,
        };
      }
      const t = tabooEntry(store, taboo, code);
      const exceptional = isExceptional(c, t);
      const boxes = parseCustomization(meta[`cus_${code}`]).reduce((n, p) => n + p.boxes, 0);
      return {
        ...cardFace(store, c, taboo),
        qty,
        customizations: customizations(store, meta, code),
        owned: store.inCollection(code),
        weakness: isWeakness(c),
        xpCost: isWeakness(c) ? 0 : ((c.xp ?? 0) * (exceptional ? 2 : 1) + (t?.xp ?? 0)) * (c.myriad ? 1 : qty) + boxes,
        hasRulings: store.rulings(code) !== undefined,
      };
    })
    .sort(
      (a, b) =>
        Number(a.weakness) - Number(b.weakness) ||
        typeOrder(a.type) - typeOrder(b.type) ||
        a.name.localeCompare(b.name) ||
        a.level - b.level,
    );
}

/** ArkhamDB's xp fields cover only the last upgrade step, so the list's total is counted here. */
export function xpInList(cards: DeckCard[]): number {
  return cards.reduce((n, c) => n + c.xpCost, 0);
}

export function notADeck(ref: string): Failure {
  return notFound(`"${ref}" is not a deck id or an arkhamdb.com deck link.`);
}

export type OpenDeck = {
  ok: true;
  store: CardStore;
  deck: RawDeck;
  /** "seat": a campaign seat's deck, which lives in the app, not on ArkhamDB. */
  kind: DeckKind | "seat";
  /** For a seat's deck: the campaign page, where it is kept. */
  campaignUrl?: string;
  meta: Record<string, string>;
  sides: ReturnType<typeof investigatorSides> & { inv: RawCard; options: RawCard };
  taboo?: TabooList;
  tabooError?: string;
  cards: DeckCard[];
};

/** A campaign seat's deck, by the seat's name (or id): "seat:Alon". */
const SEAT_REF = /^seat:\s*(.+)$/i;

async function openSeatDeck(name: string, ctx: Settings & { campaign?: CampaignContext | null }): Promise<OpenDeck | Failure> {
  const c = ctx.campaign;
  if (!c) return notFound(`"seat:${name}" names a campaign seat, and this chat is not in a campaign.`);
  const seat = c.seats.find((s) => s.id === name || s.name.toLowerCase() === name.trim().toLowerCase());
  if (!seat) return notFound(`No seat named "${name}" in this campaign. Its seats: ${c.seats.map((s) => s.name).join(", ")}.`);
  if (!seat.deck) return notFound(`${seat.name}'s seat has no deck locked in yet.`);
  const list = seat.deck.list;
  const deck: RawDeck = {
    id: 0,
    name: seat.deck.name,
    investigator_code: list.investigator_code,
    slots: list.slots,
    sideSlots: list.sideSlots,
    ignoreDeckLimitSlots: list.ignoreDeckLimitSlots,
    meta: list.meta,
    taboo_id: list.taboo_id ?? null,
  };
  return opened(deck, "seat", ctx, `/campaigns/${c.id}`);
}

export async function openDeck(
  ref: string,
  settings: Settings & { campaign?: CampaignContext | null },
): Promise<OpenDeck | Failure> {
  const seatRef = ref.match(SEAT_REF);
  if (seatRef) return openSeatDeck(seatRef[1], settings);
  const parsed = parseRef(ref);
  if (!parsed) return notADeck(ref);
  const fetched = await fetchDeck(parsed);
  if (!fetched.ok) return fromFetched(fetched);
  return opened(fetched.data.deck, fetched.data.kind, settings);
}

async function opened(
  deck: RawDeck,
  kind: OpenDeck["kind"],
  settings: Pick<Settings, "taboo">,
  campaignUrl?: string,
): Promise<OpenDeck | Failure> {
  const store = await getCards();
  const sides = investigatorSides(store, deck);
  const { inv, options } = sides;
  if (!inv || !options)
    return toolError(`Deck ${deck.id} uses investigator ${deck.investigator_code}, which is not in the card set.`);
  const meta = deckMeta(deck);
  const { list: taboo, error: tabooError } = await tabooInForce(settings);
  return {
    ok: true,
    store,
    deck,
    kind,
    ...(campaignUrl ? { campaignUrl } : {}),
    meta,
    sides: { ...sides, inv, options },
    ...(taboo ? { taboo } : {}),
    ...(tabooError ? { tabooError } : {}),
    cards: deckCards(store, deck.slots, meta, taboo),
  };
}
