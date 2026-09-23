export const ARCHETYPES = {
  bless: {
    what: "adds bless tokens and profits when they are revealed",
    examples: ["Blessed Blade", "Hand of Fate", "Holy Spear", "Rite of Sanctification"],
  },
  curse: {
    what: "adds curse tokens and profits when they are revealed",
    examples: ["Armageddon", "Eye of Chaos", "Tristan Botley", "Blasphemous Covenant"],
  },
  seal: {
    what: "seals chaos tokens on its cards and releases them",
    examples: ["Protective Incantation", "Nkosi Mabati", "The Chthonian Stone", "Favor of the Sun"],
  },
  "token manipulation": {
    what: "reveals extra tokens and chooses among them, or reads the bag",
    examples: ["Olive McBride", "Grotesque Statue", "Jewel of Aureolus", "Premonition"],
  },
  doom: {
    what: "places doom on its own cards for their effects",
    examples: ["Blood Pact", "David Renfield", "Ghastly Possession", "Arcane Initiate"],
  },
  "succeed by X": {
    what: "pays off beating a test by a margin",
    examples: ["Lucky Cigarette Case", "Quick Thinking", ".41 Derringer", "Cheap Shot"],
  },
  "succeed by exactly": {
    what: "pays off hitting a test's difficulty exactly",
    examples: ["Alton O'Connell", "Chemistry Set", "Steady-Handed", "Antikythera"],
  },
  "difficulty reduction": {
    what: "brings test difficulty down to 0 and profits from testing at 0",
    examples: ["Shed a Light", "Exploit Weakness", "Old Keyring", "Gumption"],
  },
  "fail forward": {
    what: "gains from failing tests or from making them harder",
    examples: ["Take Heart", "Live and Learn", "Drawing Thin", "Oops!"],
  },
  "spell events": {
    what: "casts Spell events as its main tools",
    examples: ["Storm of Spirits", "Blinding Light", "Uncage the Soul", "De Vermis Mysteriis"],
  },
  "big hand": {
    what: "keeps a large hand and scales with it",
    examples: ["Forbidden Tome", "Farsight", "Extensive Research", "Dream-Enhancing Serum"],
  },
  "card draw": {
    what: "draws through its deck fast and profits from the flow",
    examples: ["Preposterous Sketches", "Cryptic Research", "Feed the Mind", "Quantum Flux"],
  },
  "discard recursion": {
    what: "discards its own cards and plays them again",
    examples: ["Scavenging", "Resourceful", "True Survivor", "Pushed to the Limit"],
  },
  secrets: {
    what: "spends and refills secrets on its assets",
    examples: ["In the Know", "Truth from Fiction", "Enraptured", "Pnakotic Manuscripts"],
  },
  "skills matter": {
    what: "commits skill cards for their effects, not only their icons",
    examples: ["Grisly Totem", "Daredevil", "Signum Crucis", "Prescient"],
  },
  "events matter": {
    what: "plays events as its engine and replays them",
    examples: ["Double, Double", "The Book of War", "Chuck Fergus", "Eldritch Tongue"],
  },
  "big money": {
    what: "amasses resources and spends them on large effects",
    examples: ["Hot Streak", "Dario El-Amin", "High Roller", "Faustian Bargain"],
  },
  "dark horse": { what: "wins by staying poor", examples: ["Dark Horse", "Fire Axe", "Madame Labranche", "Last Chance"] },
  allies: {
    what: "plays many allies and benefits from them",
    examples: ["Charisma", "Calling in Favors", "Motivational Speech", "Bonnie Walsh"],
  },
  relics: { what: "builds around Relic assets", examples: ["Key of Ys", "Tooth of Eztli", "Dr. Elli Horowitz", "Antiquary"] },
  tools: { what: "builds around Tool assets", examples: ["Tool Belt", "Tinker", "Fine Tuning", "Crafty"] },
  firearms: {
    what: "upgrades and reloads guns",
    examples: ["Lightning Gun", "Prepared for the Worst", "Custom Ammunition", "Bandolier"],
  },
  "fight events": {
    what: "fights with events instead of a weapon",
    examples: ["Backstab", "One-Two Punch", "Sweeping Kick", "Counterpunch"],
  },
  evasion: { what: "answers enemies by evading them", examples: ["Stealth", "Pickpocketing", "Suggestion", "Cheap Shot"] },
  parley: { what: "answers enemies by parley", examples: ["Grift", "Stir the Pot", "Interrogate", "Drain Essence"] },
  soak: {
    what: "takes damage and horror for the team",
    examples: ["Guard Dog", "Brother Xavier", "Bulletproof Vest", "Something Worth Fighting For"],
  },
  healing: {
    what: "heals the team as a main job",
    examples: ["First Aid", "Clarity of Mind", "Emergency Aid", "Hallowed Mirror"],
  },
  "clue drop": {
    what: "places its clues on locations and profits from it",
    examples: ["Research Notes", "Captivating Discovery", "Bizarre Diagnosis", "Press Pass"],
  },
  "remote clues": {
    what: "discovers clues at other locations",
    examples: ["In the Know", "Pocket Telescope", "Sixth Sense", "Rite of Seeking"],
  },
  movement: {
    what: "moves itself or others without spending actions",
    examples: ["Pathfinder", "Shortcut", "Elusive", "Swift Reflexes"],
  },
  "actions matter": {
    what: "takes extra actions or gets more from each",
    examples: ["Haste", "Borrowed Time", "Quick Learner", "Swift Reflexes"],
  },
} as const satisfies Record<string, { what: string; examples: readonly string[] }>;

export type Archetype = keyof typeof ARCHETYPES;

export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES) as [Archetype, ...Archetype[]];
