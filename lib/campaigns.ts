import { type CardStore, norm, type RawCard } from "./cards";

export type CampaignKind = "campaign" | "return" | "standalone";

/** A Chapter 1 campaign and the packs its encounter cards come from, in play order. For the
 *  older cycles the first pack is the deluxe box (the opening scenarios) and each later pack is
 *  one scenario, named for it; the newer campaign boxes hold the whole campaign. `note` is what
 *  the campaign asks of a deck that the counts can't show, from the Rules Reference and published
 *  advice; empty where nothing is known beyond the counts. */
export type Campaign = { code: string; name: string; kind: CampaignKind; packs: string[]; note: string };

// Pack codes are ArkhamDB's (api/public/packs). Written by hand: a campaign's packs never change.
// The notes say what each campaign asks of a deck, using only claims verified in
// docs/research/campaigns.md: two independent sources, a rule, or a count of its encounter cards.
// Story structure that changes nothing in a deck is left out, as are plot, bosses and endings.
export const CAMPAIGNS: Campaign[] = [
  {
    code: "notz",
    name: "Night of the Zealot",
    kind: "campaign",
    packs: ["core"],
    note: "Its second and third scenarios are much harder than the tutorial-like first, so don't build only for the opening.",
  },
  {
    code: "dwl",
    name: "The Dunwich Legacy",
    kind: "campaign",
    packs: ["dwl", "tmm", "tece", "bota", "uau", "wda", "litas"],
    note: "Don't build a deck that draws through itself fast, and plan few upgrades: XP is scarce. Some intellect tests matter, so bring real intellect, not only testless clues, and keep moving. Treacheries deal damage more often than horror.",
  },
  {
    code: "ptc",
    name: "The Path to Carcosa",
    kind: "campaign",
    packs: ["ptc", "eotp", "tuo", "apot", "tpm", "bsr", "dca"],
    note: "Heavy on horror: willpower, sanity and horror healing pay off. No enemy has 1 health, so every attack needs to deal real damage. Hidden treacheries sit in your hand and count toward hand size. Fine Clothes pays off in one parley-heavy scenario.",
  },
  {
    code: "tfa",
    name: "The Forgotten Age",
    kind: "campaign",
    packs: ["tfa", "tof", "tbb", "hote", "tcoa", "tdoy", "sha"],
    note: "Agility and evading matter more than in any other campaign: evade enemies with Vengeance rather than kill them, though weapons still matter. Expect poison and trauma, so bring allies, soak and healing. Actions are tight, and exploring costs them.",
  },
  {
    code: "tcu",
    name: "The Circle Undone",
    kind: "campaign",
    packs: ["tcu", "tsn", "wos", "fgg", "uad", "icc", "bbt"],
    note: "Willpower is tested most, about 40% of treachery tests, and low-willpower investigators struggle. Haunted locations punish failed investigations, so clue-gatherers need reliable intellect rather than fail-forward tricks. Self-sufficient decks beat narrow specialists; Alter Fate and Handcuffs earn their place.",
  },
  {
    code: "tde",
    name: "The Dream-Eaters",
    kind: "campaign",
    packs: ["tde", "sfk", "tsh", "dsm", "pnr", "wgd", "woc"],
    note: "Swarming enemies arrive as packs taken from the top of your own deck: each swarm card attacks and is defeated separately, but one evade exhausts the whole pack, and area damage such as Dynamite Blast or Storm of Spirits is strong. Most enemies are ordinary ones, though, so don't build only for swarms.",
  },
  {
    code: "tic",
    name: "The Innsmouth Conspiracy",
    kind: "campaign",
    packs: ["tic", "itd", "def", "hhg", "lif", "lod", "itm"],
    note: "Enemies are everywhere: bring plenty of enemy management, and healing or soak for both damage and horror, much of it testless. Evading Deep Ones again and again costs you, since they hurt you when they engage, and some enemies grow stronger in flooded locations. Movement matters.",
  },
  {
    code: "eote",
    name: "Edge of the Earth",
    kind: "campaign",
    packs: ["eoec"],
    note: "Frost tokens join the chaos bag: the first in a test is -1 and draws another token, a second is an automatic failure, so pass tests by a margin and value chaos bag control. The maps are big, so movement earns its place; all-round investigators do better than specialists, and agility is more useful than usual. Story assets bloat your deck, so tutoring helps.",
  },
  {
    code: "tsk",
    name: "The Scarlet Keys",
    kind: "campaign",
    packs: ["tskc"],
    note: "Concealed enemies must be exposed first, by fighting, evading or investigating against the location's shroud, or with an effect that damages, evades or discovers a clue without a test. Investigators with a free or extra fight, investigate or evade action shine, as does a 5 in one of those skills; Skeleton Key trivializes much of it.",
  },
  {
    code: "fhv",
    name: "The Feast of Hemlock Vale",
    kind: "campaign",
    packs: ["fhvc"],
    note: "Evasion matters more than anywhere since The Forgotten Age: many enemies are Aloof or Elusive. All four skills are tested, agility most, and treacheries make you discard, so avoid discard-reliant decks. Some scenarios bring Elite enemies that need real damage.",
  },
  {
    code: "tdc",
    name: "The Drowned City",
    kind: "campaign",
    packs: ["tdcc"],
    note: "Movement and action economy are key, with a lot to do in little time. Agility for evading helps and willpower is tested often; enemy attacks deal far more damage than horror.",
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

/** A scenario of a campaign, by its published name, and the encounter set made for it. */
export type Scenario = { name: string; set: string };

/** A campaign's scenarios in printed order (play order for every linear campaign), read from its
 *  scenario cards. A Return to box lists its own versions ("Return to Curtain Call"). */
export function scenarios(store: CardStore, campaign: Campaign): Scenario[] {
  const out: Scenario[] = [];
  for (const pack of campaign.packs) {
    const cards = [...store.byCode.values()]
      .filter((c) => c.pack_code === pack && c.type_code === "scenario" && c.encounter_code && !store.isReprint(c.code))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (const c of cards)
      if (c.encounter_code && !out.some((x) => x.set === c.encounter_code)) out.push({ name: c.name, set: c.encounter_code });
  }
  if (out.length || campaign.kind !== "standalone") return out;
  // a standalone ArkhamDB gives no scenario card (The Blob That Ate Everything ELSE!) is its own one
  // scenario, made of its most used set
  const sets = new Map<string, number>();
  for (const c of encounterCards(store, campaign.packs))
    if (c.encounter_code) sets.set(c.encounter_code, (sets.get(c.encounter_code) ?? 0) + (c.quantity ?? 1));
  const [set] = [...sets].sort((a, b) => b[1] - a[1])[0] ?? [""];
  return [{ name: campaign.name, set }];
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
