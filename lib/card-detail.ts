import { type CardStore, label, type RawCard } from "./cards";
import type { TabooList } from "./taboo";
import { type CardView, cardView } from "./tools/cards";
import { ARKHAMDB } from "./urls";

export type Printing = { code: string; pack: string; position?: number; quantity?: number };

/** What the card dialog shows: the tools' own view of the card, plus what only a person reads.
 *  The `rich` texts keep ArkhamDB's markup (<b>, <i>, [[Trait]], [icon]); the client renders it
 *  from a fixed set of tags and never as HTML. */
export type CardDetail = CardView & {
  rich: { text?: string; back?: string; flavor?: string; backFlavor?: string; customization?: string };
  backName?: string;
  unique: boolean;
  illustrator?: string;
  image?: string;
  backImage?: string;
  /** Owned printings only, original first. */
  prints: Printing[];
  /** Every version of the card, this one included, by level. */
  versions: { code: string; label: string; level: number; pack: string; owned: boolean }[];
};

const image = (path?: string) => (path ? `${ARKHAMDB}${path}` : undefined);

export function cardDetail(store: CardStore, code: string, taboo?: TabooList): CardDetail | undefined {
  const c = store.get(store.canonical(code));
  if (!c) return undefined;
  // a reprint can carry the scan its original lacks
  const printed = store
    .printings(c.code)
    .map((p) => store.get(p))
    .filter((p): p is RawCard => !!p);
  const scan = printed.find((p) => p.imagesrc);
  const owned = new Set(store.ownedPrintings(c.code));
  return {
    ...cardView(store, c, taboo),
    rich: {
      text: c.text,
      back: c.back_text,
      flavor: c.flavor,
      backFlavor: c.back_flavor,
      customization: c.customization_text,
    },
    backName: c.back_name,
    unique: !!c.is_unique,
    illustrator: c.illustrator,
    image: image(scan?.imagesrc),
    backImage: image(scan?.backimagesrc),
    prints: printed
      .filter((p) => owned.has(p.code))
      .map((p) => ({ code: p.code, pack: p.pack_name ?? p.pack_code, position: p.position, quantity: p.quantity }))
      // a hidden promo copy (98004 for 01001) can repeat its original's pack and position
      .filter((p, i, all) => all.findIndex((q) => q.pack === p.pack && q.position === p.position) === i),
    versions: store.versions(c.code).map((v) => ({
      code: v.code,
      label: label(v),
      level: v.xp ?? 0,
      pack: v.pack_name ?? v.pack_code,
      owned: store.inCollection(v.code),
    })),
  };
}
