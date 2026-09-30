// Imported by the client: keep it free of server modules.

import type { RawCard } from "./cards";

export type TabooChange = {
  list: string;
  date: string;
  change: string;
  /** Per copy, on top of the printed XP; the card's level does not change. */
  xpCost?: number;
};

export type InvestigatorStats = {
  kind: "investigator";
  willpower: number;
  intellect: number;
  combat: number;
  agility: number;
  health: number;
  sanity: number;
};

/** An X or unprinted value is undefined. */
export type Stats =
  | InvestigatorStats
  | { kind: "enemy"; fight?: number; health?: number; evade?: number; damage: number; horror: number }
  | { kind: "soak"; health?: number; sanity?: number };

export type Rulings = { updated: string; items: string[] };

export type Customization = {
  text: string;
  boxes: number;
  total: number;
  choice?: string;
  /** The choice is the deck author's own text (traits, a skill), not card names. */
  choiceIsText?: true;
};

export type CardFace = {
  code: string;
  name: string;
  label: string;
  level: number;
  type: string;
  classes: string[];
  cost?: number | null;
  slot?: string;
  icons: string[];
  text: string;
  taboo?: TabooChange;
};

export function investigatorStats(c: RawCard): InvestigatorStats {
  return {
    kind: "investigator",
    willpower: c.skill_willpower ?? 0,
    intellect: c.skill_intellect ?? 0,
    combat: c.skill_combat ?? 0,
    agility: c.skill_agility ?? 0,
    health: c.health ?? 0,
    sanity: c.sanity ?? 0,
  };
}

export function cardStats(c: RawCard): Stats | undefined {
  if (c.type_code === "investigator") return investigatorStats(c);
  if (c.type_code === "enemy")
    return {
      kind: "enemy",
      fight: c.enemy_fight ?? undefined,
      health: c.health ?? undefined,
      evade: c.enemy_evade ?? undefined,
      damage: c.enemy_damage ?? 0,
      horror: c.enemy_horror ?? 0,
    };
  if (c.health || c.sanity) return { kind: "soak", health: c.health ?? undefined, sanity: c.sanity ?? undefined };
  return undefined;
}

export function statGroups(s: Stats): [string, number | undefined][][] {
  switch (s.kind) {
    case "investigator":
      return [
        [
          ["willpower", s.willpower],
          ["intellect", s.intellect],
          ["combat", s.combat],
          ["agility", s.agility],
        ],
        [
          ["health", s.health],
          ["sanity", s.sanity],
        ],
      ];
    case "enemy":
      return [
        [
          ["fight", s.fight],
          ["health", s.health],
          ["evade", s.evade],
        ],
        [
          ["damage", s.damage],
          ["horror", s.horror],
        ],
      ];
    case "soak":
      return [
        [
          ["health", s.health],
          ["sanity", s.sanity],
        ],
      ];
  }
}

export function statsText(s: Stats): string {
  return statGroups(s)
    .map((g) => g.map(([k, v]) => `${k} ${v ?? "-"}`).join(" "))
    .join(", ");
}

export function tabooChangeText(t: TabooChange): string {
  const bits = [t.change];
  if (t.xpCost) bits.push(`costs ${t.xpCost > 0 ? "+" : ""}${t.xpCost} XP`);
  return bits.filter(Boolean).join(" ");
}

export function cardHead(c: CardFace): string {
  return [
    c.type,
    c.classes.join("/"),
    c.cost != null ? `cost ${c.cost}` : "",
    c.slot ? `slot ${c.slot}` : "",
    c.icons.length ? `icons ${c.icons.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function rulingsMarkdown(r: Rulings): string {
  return r.items.map((i) => `- ${i}`).join("\n");
}

export function traitList(traits: string | undefined): string[] {
  return (traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
}
