// `expect` is for a person reading the transcript; the runner does not grade.

import type { Settings } from "@/lib/settings";

export type EvalCase = {
  id: string;
  useCase: "rules" | "card" | "deck" | "replace" | "upgrade" | "find" | "partner" | "scope";
  question: string;
  followUps?: string[];
  settings?: Partial<Settings>;
  expect: string;
};

export const CASES: EvalCase[] = [
  {
    id: "rules-doom",
    useCase: "rules",
    question: "Does doom on an enemy count toward the agenda's doom threshold?",
    expect: "Yes: doom on any card in play counts toward the threshold. Cites the Rules Reference, uses no tool.",
  },
  {
    id: "rules-aoo",
    useCase: "rules",
    question: "I'm engaged with an enemy. If I play an event that isn't a Fight or Evade, do I take an attack of opportunity?",
    expect:
      "Yes, playing a card is a play action and provokes attacks of opportunity, unless the event is Fast. Resign, Parley, Fight and Evade are the exceptions.",
  },
  {
    id: "card-levels",
    useCase: "card",
    question: "What does Ward of Protection do at each level?",
    expect:
      "Level 0 (your treachery, take 1 horror), 2 (any investigator's treachery), 5 (any non-weakness encounter card, cancel all effects and discard). Read with the cards tool.",
  },
  {
    id: "card-taboo-on",
    useCase: "card",
    question: "What does Rex Murphy's ability do?",
    settings: { taboo: true },
    expect: "Reads the card; with the taboo list on, mentions the taboo's added limit once per round on his reaction.",
  },
  {
    id: "card-taboo-off",
    useCase: "card",
    question: "What does Rex Murphy's ability do?",
    settings: { taboo: false },
    expect: "Reads the card as printed and does NOT mention any taboo change.",
  },
  {
    id: "deck-how",
    useCase: "deck",
    question: "How do I play this deck? https://arkhamdb.com/decklist/view/33170",
    expect:
      "Reads the deck; explains Lily Chen's Disciplines and the plan from the list and the author's guide; any card named is in the list.",
  },
  {
    id: "replace-cheaper",
    useCase: "replace",
    question: "In Carolyn Fern Destroys Carcosa, what could replace Archive of Conduits with something cheaper?",
    expect:
      "Uses replaceCard with goal cheaper; proposes owned, legal cards that do a similar job for Carolyn, explaining the trade-off.",
  },
  {
    id: "replace-missing",
    useCase: "replace",
    question: "In my deck, what should I play instead of Old Book of Lore?",
    settings: { myDeck: { id: 45147, kind: "decklist", name: "Carolyn Fern destroys Carcosa", investigator: "Carolyn Fern" } },
    expect: "Says Old Book of Lore is not in the deck (reads the list) instead of inventing replacements.",
  },
  {
    id: "find-class-role",
    useCase: "find",
    question: "Suggest a mystic cluever deck.",
    expect: "Shortlists mystic cluevers from the index, reads the best one or two, recommends with a link and why.",
  },
  {
    id: "find-archetype",
    useCase: "find",
    question: "I want to try a bless deck. What would you recommend?",
    expect: "Uses the bless archetype filter; recommends indexed bless decks, reads one before recommending.",
  },
  {
    id: "find-key-card-xp",
    useCase: "find",
    question: "Find me a deck under 10 XP that runs Rite of Seeking.",
    expect:
      "Filters by key card and XP; every deck named runs Rite of Seeking and is under 10 XP; XP is reported, not used against a deck.",
  },
  {
    id: "partner",
    useCase: "partner",
    question: "My partner plays Lily Chen's Boom Chakra Lacka. What should I play with them?",
    expect:
      "Finds Boom Chakra Lacka with findDeck and reads it (Lily Chen, a fighter), looks for a cluever or flex partner of another investigator, reads the candidates, picks one and explains in roles and abilities.",
  },
  {
    id: "followup-cut",
    useCase: "deck",
    question: "How do I play Boom Chakra Lacka?",
    followUps: ["What would you cut first to make room for a Shrivelling?"],
    expect:
      "Turn 2 reads the deck again (earlier tool results are not in the history) and the card. Lily Chen takes Mystic cards at level 0 only, so only Shrivelling (0) fits; the cut is a card that is really in the list, with a reason.",
  },
  {
    id: "upgrade-xp",
    useCase: "upgrade",
    question: "My partner's deck just earned 5 XP. What should they buy?",
    settings: {
      partnerDeck: { id: 33170, kind: "decklist", name: "Lily - Boom Chakra Lacka (Deck Guide)", investigator: "Lily Chen" },
    },
    expect:
      "Reads the deck. Lily Chen: Guardian 1-5, Neutral 0-5, Mystic level 0 only, no Firearms. Every suggestion is legal and owned, the total is at most 5 XP, and no Mystic upgrade (Shrivelling (3), Ward of Protection (2)) is offered.",
  },
  {
    id: "rules-card-aoo",
    useCase: "rules",
    question: "I'm engaged with an enemy and draw a treachery. Does playing Ward of Protection provoke an attack of opportunity?",
    expect:
      "No. Reads the card: Ward of Protection is Fast and played when the treachery is drawn, not as an action, and only actions provoke attacks of opportunity.",
  },
  {
    id: "deckbuilding-roland",
    useCase: "card",
    question: "Can Roland Banks put Shrivelling in his deck?",
    expect:
      "No. Reads Roland: Guardian and Neutral 0-5, Seeker 0-2; Shrivelling is Mystic. If it mentions the parallel Roland (Guardian 0-3, Neutral, Insight or Tactic 0-3), he can't either: Shrivelling is a Spell.",
  },
  {
    id: "replace-unowned",
    useCase: "replace",
    question: "In https://arkhamdb.com/decklist/view/64993 I don't own The Grapevine. What could I play instead?",
    expect:
      "Uses replaceCard for an owned stand-in; says The Grapevine is from André Patel's investigator deck, not the collection; every suggestion is owned and legal for Tony Morgan.",
  },
  {
    id: "taboo-xp-on",
    useCase: "deck",
    question: "How much XP does Clue Vacuuming Rex need?",
    settings: { taboo: true },
    expect: "4 XP under the current taboo list (0 as printed), naming the card or cards the taboo list charges XP for.",
  },
  {
    id: "taboo-xp-off",
    useCase: "deck",
    question: "How much XP does Clue Vacuuming Rex need?",
    settings: { taboo: false },
    expect: "0 XP, with no mention of any taboo change.",
  },
  {
    id: "private-deck",
    useCase: "deck",
    question: "How do I play this deck? https://arkhamdb.com/deck/view/999999",
    expect:
      "The deck can't be read: not found, or private until its owner makes it public. Says so plainly and invents nothing about it.",
  },
  {
    id: "unowned-card",
    useCase: "card",
    question: "What does Police Dog do?",
    expect:
      "Reads both levels (0 and 1) and says the card comes from Tommy Muldoon's investigator deck, which is not in the collection.",
  },
  {
    id: "deck-name-ambiguous",
    useCase: "deck",
    question: "How do I play my Carolyn deck?",
    expect:
      "No deck is saved, and the index has several Carolyn Fern decks: asks which one, naming a few by title, or asks for the link. Does not pick one and explain it.",
  },
  {
    id: "deck-name-unknown",
    useCase: "deck",
    question: "How do I play the Zorblax Express deck?",
    expect: "findDeck finds nothing; asks the player to paste the deck's ArkhamDB link instead of guessing.",
  },
  {
    id: "out-of-scope",
    useCase: "scope",
    question: "What's a good Spider-Man deck for Marvel Champions?",
    expect: "Says it covers Arkham Horror: The Card Game only, invents no Marvel Champions deck, and uses no tool.",
  },
  {
    id: "compare-weapons",
    useCase: "card",
    question: "Machete or .45 Automatic for Roland Banks?",
    expect:
      "Reads both. Machete: +1 combat, +1 damage only when the enemy is the only one engaged with you, no ammo. .45 Automatic: +1 combat and +1 damage on every attack, 4 ammo. Relates it to Roland's clue on defeating an enemy.",
  },
  {
    id: "partner-followup",
    useCase: "partner",
    question: "My partner plays https://arkhamdb.com/decklist/view/33170. What should I play with them?",
    followUps: ["And if they play Carolyn Fern Destroys Carcosa instead?"],
    expect:
      "Turn 2 finds and reads Carolyn Fern Destroys Carcosa (support) and searches again for flex first, then fighter or cluever partners; the recommendation changes with the new deck.",
  },
];
