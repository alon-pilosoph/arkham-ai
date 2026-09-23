import path from "node:path";
import type { TabooChange } from "./card-text";
import type { CardStore, DeckOption } from "./cards";
import { errorMessage } from "./format";
import { cachedLoader } from "./loader";
import type { Settings } from "./settings";

export type TabooEntry = {
  code: string;
  text?: string;
  /** Added to the printed XP cost; the card's level does not change. */
  xp?: number;
  exceptional?: boolean;
  deck_limit?: number;
  deck_options?: DeckOption[];
};

/** Lists key the original printing (Elusive, 01050); decks often run a reprint (01550). */
export function tabooEntry(store: CardStore, taboo: TabooList | undefined, code: string): TabooEntry | undefined {
  if (!taboo) return undefined;
  return store
    .printings(code)
    .map((p) => taboo.cards.get(p))
    .find(Boolean);
}

export type TabooList = { id: number; code: string; date: string; cards: Map<string, TabooEntry> };

type RawTaboo = { id: number; code: string; date_start: string; active: number | boolean; cards: string };

const DISK_CACHE = path.join(process.cwd(), "data", "cache", "taboos.json");

function parse(raw: RawTaboo[]): Map<number, TabooList> {
  const lists = new Map<number, TabooList>();
  for (const t of raw) {
    const cards = new Map<string, TabooEntry>();
    for (const c of JSON.parse(t.cards) as TabooEntry[]) cards.set(c.code, c);
    lists.set(t.id, { id: t.id, code: t.code, date: t.date_start, cards });
  }
  return lists;
}

export const getTaboos = cachedLoader<RawTaboo[], Map<number, TabooList>>({
  what: "the taboo lists",
  envVar: "ARKHAM_TABOOS_FILE",
  file: DISK_CACHE,
  path: "/api/public/taboos/",
  parse,
});

export function latest(lists: Map<number, TabooList>): TabooList | undefined {
  return [...lists.values()].sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function tabooChange(list: TabooList, e: TabooEntry): TabooChange {
  const change = (e.text ?? "").replace(/<\/?[a-z]+>/g, "").replace(/\s*\n\s*/g, " ");
  return { list: list.code, date: list.date, change, ...(e.xp ? { xpCost: e.xp } : {}) };
}

type TabooInForce = { list?: TabooList; error?: string };

export async function tabooInForce(settings: Settings): Promise<TabooInForce> {
  if (!settings.taboo) return {};
  try {
    const list = latest(await getTaboos());
    return list ? { list } : { error: "ArkhamDB lists no taboo list" };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
