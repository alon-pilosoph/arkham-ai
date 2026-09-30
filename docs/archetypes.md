# Archetypes

This document explains the `archetypes` field of the deck index: what an archetype is, when a
deck is tagged with one, and what each archetype means. The definitions live in
`lib/archetypes.ts`, and the `recommendDecks` tool includes them in its description so the model
knows what each filter value means. The table below repeats them, and `tests/index.test.ts`
fails if the two drift apart.

## What an archetype is

The word is used the way the Arkham Horror LCG community uses it: **a way of building a deck that
works for many investigators and needs both enablers (cards that set the mechanic up) and payoffs
(cards that reward it).** Big money is an archetype because any Rogue can build around it; Daisy
Walker's tomes are not, because they only work with Daisy. An archetype says *how* a deck wins. Its
role (fighter, cluever, flex or support) says *what* it does in a scenario, and the two are
recorded separately.

A deck is tagged with an archetype only when it is built around it:

- **A build, not a package.** A couple of copies of The Chthonian Stone are a package, a small
  set of cards added to an otherwise unrelated deck. Protective Incantation, Seal of the Seventh
  Sign and the cards that release sealed tokens together make a seal deck.
- **Generic cards, not only the investigator.** When the investigator's own ability supports a
  mechanic, the deck is still tagged if it also invests in the generic cards for it: Carolyn Fern
  or Vincent Lee with healing cards, Sister Mary or Kōhaku with bless cards, Rita Young or Finn
  Edwards with evasion cards. An investigator's own engine with no generic support (Lily Chen's
  Disciplines, Joe Diamond's Hunch deck, Duke) is not an archetype; the deck's summary names it
  instead.
- **Having no archetype is normal.** A third of the indexed decks have none: they are collections
  of generally strong cards, or they run on their investigator's own engine. A deck can have up
  to three.
- **Deck names don't help.** Of 4,073 published deck names in one harvest, 53 mention money, 45
  guns and 35 bless, so labels are based on the list and the guide, not the title.

## The archetypes

| Archetype | Built around | Example cards |
|---|---|---|
| bless | adds bless tokens and profits when they are revealed | Blessed Blade, Hand of Fate, Holy Spear, Rite of Sanctification |
| curse | adds curse tokens and profits when they are revealed | Armageddon, Eye of Chaos, Tristan Botley, Blasphemous Covenant |
| seal | seals chaos tokens on its cards and releases them | Protective Incantation, Nkosi Mabati, The Chthonian Stone, Favor of the Sun |
| token manipulation | reveals extra tokens and chooses among them, or reads the bag | Olive McBride, Grotesque Statue, Jewel of Aureolus, Premonition |
| doom | places doom on its own cards for their effects | Blood Pact, David Renfield, Ghastly Possession, Arcane Initiate |
| succeed by X | pays off beating a test by a margin | Lucky Cigarette Case, Quick Thinking, .41 Derringer, Cheap Shot |
| succeed by exactly | pays off hitting a test's difficulty exactly | Alton O'Connell, Chemistry Set, Steady-Handed, Antikythera |
| difficulty reduction | brings test difficulty down to 0 and profits from testing at 0 | Shed a Light, Exploit Weakness, Old Keyring, Gumption |
| fail forward | gains from failing tests or from making them harder | Take Heart, Live and Learn, Drawing Thin, Oops! |
| spell events | casts Spell events as its main tools | Storm of Spirits, Blinding Light, Uncage the Soul, De Vermis Mysteriis |
| big hand | keeps a large hand and scales with it | Forbidden Tome, Farsight, Extensive Research, Dream-Enhancing Serum |
| card draw | draws through its deck fast and profits from the flow | Preposterous Sketches, Cryptic Research, Feed the Mind, Quantum Flux |
| discard recursion | discards its own cards and plays them again | Scavenging, Resourceful, True Survivor, Pushed to the Limit |
| secrets | spends and refills secrets on its assets | In the Know, Truth from Fiction, Enraptured, Pnakotic Manuscripts |
| skills matter | commits skill cards for their effects, not only their icons | Grisly Totem, Daredevil, Signum Crucis, Prescient |
| events matter | plays events as its engine and replays them | Double, Double, The Book of War, Chuck Fergus, Eldritch Tongue |
| big money | amasses resources and spends them on large effects | Hot Streak, Dario El-Amin, High Roller, Faustian Bargain |
| dark horse | wins by staying poor | Dark Horse, Fire Axe, Madame Labranche, Last Chance |
| allies | plays many allies and benefits from them | Charisma, Calling in Favors, Motivational Speech, Bonnie Walsh |
| relics | builds around Relic assets | Key of Ys, Tooth of Eztli, Dr. Elli Horowitz, Antiquary |
| tools | builds around Tool assets | Tool Belt, Tinker, Fine Tuning, Crafty |
| firearms | upgrades and reloads guns | Lightning Gun, Prepared for the Worst, Custom Ammunition, Bandolier |
| fight events | fights with events instead of a weapon | Backstab, One-Two Punch, Sweeping Kick, Counterpunch |
| evasion | answers enemies by evading them | Stealth, Pickpocketing, Suggestion, Cheap Shot |
| parley | answers enemies by parley | Grift, Stir the Pot, Interrogate, Drain Essence |
| soak | takes damage and horror for the team | Guard Dog, Brother Xavier, Bulletproof Vest, Something Worth Fighting For |
| healing | heals the team as a main job | First Aid, Clarity of Mind, Emergency Aid, Hallowed Mirror |
| clue drop | places its clues on locations and profits from it | Research Notes, Captivating Discovery, Bizarre Diagnosis, Press Pass |
| remote clues | discovers clues at other locations | In the Know, Pocket Telescope, Sixth Sense, Rite of Seeking |
| movement | moves itself or others without spending actions | Pathfinder, Shortcut, Elusive, Swift Reflexes |
| actions matter | takes extra actions or gets more from each | Haste, Borrowed Time, Quick Learner, Swift Reflexes |

Every example card is one the players own. `tests/index.test.ts` checks that, and that every
archetype is used by at least one indexed deck.

## Where the vocabulary comes from

The list was drawn from community sources: ArkhRec's data-driven classification of player cards,
the archetype discussion threads on r/arkhamhorrorlcg, two YouTube series of archetype guides,
BoardGameGeek and the Ancient Evils blog. A term made the list when three or more of those sources
use it. ArkhamDB's own deck tags (solo, multiplayer, beginner, theme) are kept separately, in the
index's `tags` field. The research notes, with every source, are in
[research/archetypes.md](research/archetypes.md).
