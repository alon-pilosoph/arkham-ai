import { type CardStore, norm, type RawCard } from "./cards";

export type CampaignKind = "campaign" | "return" | "standalone";

/** A Chapter 1 campaign and the packs its encounter cards come from, in play order. For the
 *  older cycles the first pack is the deluxe box (the opening scenarios) and each later pack is
 *  one scenario, named for it; the newer campaign boxes hold the whole campaign. `note` is what
 *  the card data cannot show (structure, travel, time pressure), written to be spoiler-light. */
export type Campaign = { code: string; name: string; kind: CampaignKind; packs: string[]; note: string };

// Pack codes are ArkhamDB's (api/public/packs). Written by hand: a campaign's packs never change.
// The notes come from the publisher's and reviewers' descriptions of each campaign (sources in
// docs/design-log.md, October 26), kept to mechanics and structure: no plot, no bosses, no endings.
export const CAMPAIGNS: Campaign[] = [
  {
    code: "notz",
    name: "Night of the Zealot",
    kind: "campaign",
    packs: ["core"],
    note: "The Core Set's three scenarios, playable alone or linked as a short campaign: the gentle start, built for learning the game.",
  },
  {
    code: "dwl",
    name: "The Dunwich Legacy",
    kind: "campaign",
    packs: ["dwl", "tmm", "tece", "bota", "uau", "wda", "litas"],
    note: "Eight scenarios. The first two can be played in either order, and the order changes how each plays out; choices in the campaign log carry weight later on.",
  },
  {
    code: "ptc",
    name: "The Path to Carcosa",
    kind: "campaign",
    packs: ["ptc", "eotp", "tuo", "apot", "tpm", "bsr", "dca"],
    note: "Eight scenarios. Choices mark Doubt or Conviction in the campaign log, and later scenarios change with them. Some treacheries are Hidden: whoever draws one keeps it secretly in hand. Heavy on horror, so willpower, sanity and horror healing pay off.",
  },
  {
    code: "tfa",
    name: "The Forgotten Age",
    kind: "campaign",
    packs: ["tfa", "tof", "tbb", "hote", "tcoa", "tdoy", "sha"],
    note: "A jungle expedition. Several scenarios build the map from an exploration deck with the Explore action; the supplies chosen at the start and at each resupply shape the campaign; Poisoned is a weakness you can pick up; and some encounter cards are worth Vengeance, which makes later scenarios harder, so it pays to avoid it.",
  },
  {
    code: "tcu",
    name: "The Circle Undone",
    kind: "campaign",
    packs: ["tcu", "tsn", "wos", "fgg", "uad", "icc", "bbt"],
    note: "A prologue and eight scenarios. Haunted locations trigger whenever you fail to investigate them, and some scenarios give locations a Spectral side with an encounter deck of its own.",
  },
  {
    code: "tde",
    name: "The Dream-Eaters",
    kind: "campaign",
    packs: ["tde", "sfk", "tsh", "dsm", "pnr", "wgd", "woc"],
    note: "Two campaigns, The Dream-Quest in the Dreamlands and The Web of Dreams in the waking world, played separately or woven into one. It brings the Swarming keyword: enemies that arrive with a pack.",
  },
  {
    code: "tic",
    name: "The Innsmouth Conspiracy",
    kind: "campaign",
    packs: ["tic", "itd", "def", "hhg", "lif", "lod", "itm"],
    note: "Eight scenarios moving between present and past. Flood tokens make locations harder, or impossible, to act in; key tokens open the way to places and rewards; and at times XP can't be spent yet, because of where the story stands.",
  },
  {
    code: "eote",
    name: "Edge of the Earth",
    kind: "campaign",
    packs: ["eoec"],
    note: "An Antarctic expedition of four to ten scenarios along a branching path, with the surviving members of an expedition team along. Frost tokens go into the chaos bag, and there is a lot of moving between locations.",
  },
  {
    code: "tsk",
    name: "The Scarlet Keys",
    kind: "campaign",
    packs: ["tskc"],
    note: "Non-linear: from a world map you choose where to go, playing all but the prologue and finale in any order. Time is the real threat, so one run won't see every scenario; some encounter cards hide enemy agents among decoys.",
  },
  {
    code: "fhv",
    name: "The Feast of Hemlock Vale",
    kind: "campaign",
    packs: ["fhvc"],
    note: "Three in-game days, each with a day and a night: by day you get to know the residents and explore the island, by night its wildlife turns deadly. You choose which scenarios to play each day and night, and some enemies and perils work differently by time of day.",
  },
  {
    code: "tdc",
    name: "The Drowned City",
    kind: "campaign",
    packs: ["tdcc"],
    note: "You choose to approach the city from the east or the west, which changes the order and setup of the scenarios, and each investigator has a personal Task: a side goal alongside the story.",
  },
  { code: "rtnotz", name: "Return to the Night of the Zealot", kind: "return", packs: ["rtnotz"], note: "" },
  { code: "rtdwl", name: "Return to the Dunwich Legacy", kind: "return", packs: ["rtdwl"], note: "" },
  { code: "rtptc", name: "Return to the Path to Carcosa", kind: "return", packs: ["rtptc"], note: "" },
  { code: "rttfa", name: "Return to the Forgotten Age", kind: "return", packs: ["rttfa"], note: "" },
  { code: "rttcu", name: "Return to the Circle Undone", kind: "return", packs: ["rttcu"], note: "" },
  ...(
    [
      ["cotr", "Curse of the Rougarou"],
      ["coh", "Carnevale of Horrors"],
      ["lol", "The Labyrinths of Lunacy"],
      ["guardians", "Guardians of the Abyss"],
      ["hotel", "Murder at the Excelsior Hotel"],
      ["blob", "The Blob That Ate Everything"],
      ["wog", "War of the Outer Gods"],
      ["mtt", "Machinations Through Time"],
      ["fof", "Fortune and Folly"],
      ["blbe", "The Blob That Ate Everything ELSE!"],
      ["tmg", "The Midwinter Gala"],
      ["film_fatale", "Film Fatale"],
    ] as const
  ).map(([code, name]): Campaign => ({ code, name, kind: "standalone", packs: [code], note: "" })),
];

const FILLER = new Set(["the", "a", "campaign", "cycle", "of"]);

/** Campaigns whose name has every word of the query, or whose code is the query ("eote", "tsk").
 *  "Return to ..." finds only the Return to box; anything else, never. */
export function findCampaign(query: string): Campaign[] {
  const q = norm(query);
  const byCode = CAMPAIGNS.filter((c) => c.code === q.replace(/\s+/g, ""));
  if (byCode.length) return byCode;
  const words = q.split(" ").filter((w) => w && !FILLER.has(w));
  if (!words.length) return [];
  const wantsReturn = words.includes("return");
  return CAMPAIGNS.filter((c) => {
    const name = ` ${norm(c.name)} `;
    return words.every((w) => name.includes(` ${w}`)) && (c.kind === "return") === wantsReturn;
  });
}

const SKILLS = ["willpower", "intellect", "combat", "agility"] as const;
const KEYWORDS = ["hunter", "retaliate", "alert", "aloof", "massive", "elusive", "patrol", "swarming"] as const;
const TOKENS = ["frost", "bless", "curse"] as const;

/** What a set of encounter cards asks of the investigators, as counts and averages only: no card
 *  is named, so it spoils nothing. Copies count as many times as the scenario uses them; health
 *  "per investigator" counts for two players. */
export type Profile = {
  cards: number;
  treacheries: {
    copies: number;
    tests: Record<(typeof SKILLS)[number], number>;
    horror: number;
    damage: number;
    doom: number;
  };
  enemies: {
    copies: number;
    fight: number | null;
    evade: number | null;
    health: number | null;
    attackDamage: number;
    attackHorror: number;
    keywords: Record<(typeof KEYWORDS)[number], number>;
  };
  locations: { count: number; shroud: number | null };
  tokens: Record<(typeof TOKENS)[number], number>;
};

const avg = (xs: number[]) => (xs.length ? Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 : null);

function textOf(c: RawCard): string {
  return (c.real_text ?? c.text ?? "").replace(/<[^>]+>/g, "");
}

export function encounterCards(store: CardStore, packs: string[]): RawCard[] {
  const wanted = new Set(packs);
  return [...store.byCode.values()].filter((c) => c.encounter_code && wanted.has(c.pack_code) && !store.isReprint(c.code));
}

export function profile(cards: RawCard[]): Profile {
  const p: Profile = {
    cards: 0,
    treacheries: { copies: 0, tests: { willpower: 0, intellect: 0, combat: 0, agility: 0 }, horror: 0, damage: 0, doom: 0 },
    enemies: {
      copies: 0,
      fight: null,
      evade: null,
      health: null,
      attackDamage: 0,
      attackHorror: 0,
      keywords: { hunter: 0, retaliate: 0, alert: 0, aloof: 0, massive: 0, elusive: 0, patrol: 0, swarming: 0 },
    },
    locations: { count: 0, shroud: null },
    tokens: { frost: 0, bless: 0, curse: 0 },
  };
  const fight: number[] = [];
  const evade: number[] = [];
  const health: number[] = [];
  const shroud: number[] = [];
  for (const c of cards) {
    const n = c.quantity ?? 1;
    const text = textOf(c);
    p.cards += n;
    for (const t of TOKENS) if (new RegExp(`\\[${t}\\]`, "i").test(text)) p.tokens[t] += n;
    if (c.type_code === "treachery") {
      p.treacheries.copies += n;
      for (const s of SKILLS) if (new RegExp(`test \\[${s}\\]`, "i").test(text)) p.treacheries.tests[s] += n;
      if (/\bhorror\b/i.test(text)) p.treacheries.horror += n;
      if (/\bdamage\b/i.test(text)) p.treacheries.damage += n;
      if (/\bdoom\b/i.test(text)) p.treacheries.doom += n;
    } else if (c.type_code === "enemy") {
      p.enemies.copies += n;
      const lower = text.toLowerCase();
      for (const k of KEYWORDS) if (new RegExp(`\\b${k}\\b`).test(lower)) p.enemies.keywords[k] += n;
      for (let i = 0; i < n; i++) {
        if (typeof c.enemy_fight === "number") fight.push(c.enemy_fight);
        if (typeof c.enemy_evade === "number") evade.push(c.enemy_evade);
        if (typeof c.health === "number") health.push(c.health * (c.health_per_investigator ? 2 : 1));
      }
      p.enemies.attackDamage += (c.enemy_damage ?? 0) * n;
      p.enemies.attackHorror += (c.enemy_horror ?? 0) * n;
    } else if (c.type_code === "location") {
      p.locations.count += 1;
      if (typeof c.shroud === "number") shroud.push(c.shroud);
    }
  }
  p.enemies.fight = avg(fight);
  p.enemies.evade = avg(evade);
  p.enemies.health = avg(health);
  p.locations.shroud = avg(shroud);
  return p;
}
