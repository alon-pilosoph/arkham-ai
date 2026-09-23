# Design decisions

**Scope.** Every decision that shapes the assistant, with the reasoning that made it right and
the alternatives that lost, in the present tense.

Each record carries four things. **Decision**: what is true. **Why**: the forces that made it
right. **Rejected**: what lost, and the specific reason, which is what stops the next reader
re-litigating a settled question. **Revisit when**: the trigger, where there is one.

---

## 1. What the assistant knows

### It reads the sources when asked, and stores only a deck index

**Decision.** Card text, rulings, taboo changes and decks are fetched from ArkhamDB when a
question needs them. Guides are read live. The one thing stored about decks is an index row
each, enough to shortlist.

**Why.** Restating a source ahead of time is where the errors come from. Three full deck
reviews written in advance cost about 20k tokens each, the author's guide was 57 to 77% of what
had to be read, and the records mostly restated their guides; the restating produced a
misreading (an upgrade target reported as a guide error). Every one of the roughly 100
corrections made in a hand-check of stored pair write-ups was a card-text error: a wrong
printing level, a self-only card credited to a partner, an upgrade read as a card in the list.
Reading at question time is cheaper and cannot drift.

**Rejected.**
- *Stored per-deck reviews.* They restate the guide, and go stale when the author edits it.
- *Stored pair write-ups* (the earlier version's design). A pairing is worked out when asked,
  from two decks.

### The whole Rules Reference is in the system prompt

**Decision.** `data/rules.md`, about 39,500 words, is inlined into the cached system prompt.
There is no rules tool.

**Why.** The answer to a rules question can sit in any of 285 entries, often in several at once.
Inlined, every entry is always in view and the cost is one cold turn per conversation; after
that the prefix is read from cache.

**Rejected.**
- *A `rules(section)` lookup over the table of contents.* A round trip per question, and it can
  pick the wrong entry or find nothing.
- *Embeddings and similarity search.* The same failure mode, plus a subsystem to run.

**Revisit when** the Rules Reference outgrows a comfortable share of the context window.

### Official rulings are attached to cards, not kept as a document

**Decision.** ArkhamDB's `/faqs` is scraped into `data/faq.json`, keyed by card code, and the
`cards` tool returns a card's rulings with it.

**Why.** The FAQ is card name plus question plus answer. Attached to the card, it arrives
exactly when the card is read; there is no second corpus to search.

---

## 2. The deck index

### Ten decks per owned investigator, every one labeled

**Decision.** The index holds the ten most liked published lists of each investigator the
players own that the collection can build and the rules allow: 660 decks for 66 investigators.
Every row has a role, an optional secondary role, optional archetypes and a one-line summary.

**Why.** Recommendations are shortlists: the model reads the best two or three candidates in
full before choosing. What matters is that every investigator has good candidates and that
every candidate's label is right. A likes threshold spreads unevenly: of the 1,981 lists with 10
or more likes, one investigator has 75 and several have a single one. The earlier threshold index
held 2,683 decks and more than half were never labeled, so role filters silently skipped them.
Ten fully labeled decks per investigator covers every investigator with lists people vouched for.

**Rejected.**
- *Every deck with 10 or more likes.* Uneven coverage, and too many to label by reading.
- *Eight per investigator.* Thinner for investigators with several distinct builds.
- *Labels guessed from card traits.* The trait tallies are kept, but as a consistency check on
  the labels, not as the labels: a deck with five bless cards is not always a bless deck.

**Revisit when** a new investigator is added to the collection (rerun the build; it will list the
unlabeled decks).

### The census, not the likes order, is the source of truth

**Decision.** The crawl lists every published decklist by walking ArkhamDB's search by date,
then walks the likes order down to 10 likes and fails if any deck there is missing from the
census.

**Why.** The likes order is full of ties, and paging through ties is unstable: decks shift
between pages and a walk can miss them. The date order is stable. The census found 38,984
published decklists, and all 1,981 with 10 or more likes were present.

**Rejected.** *Walking the likes order alone* (the earlier version's crawl). It cannot tell a
complete walk from one that skipped a page.

### Republished lists count once

**Decision.** Within one investigator, a list sharing 85% or more of its distinct cards
(Jaccard) with a more liked one is the same list and is skipped.

**Why.** Starter decks are republished by many users, and guide authors republish each version
of a campaign deck. At 0.85 and above, the measured pairs were those; below, they were different
builds.

### Illegal and unowned lists are passed over, not flagged

**Decision.** The selection skips a list with any card the collection lacks, or any card
`deckViolation` rejects under the taboo list the author built with, and takes the next one.

**Why.** Everything recommended must be buildable. Three of the lists the selection reached fail
legality (novelty lists, or rules that changed after publication). Skipping them keeps the index
clean without a side list that every consumer has to remember to consult.

**Rejected.** *A flagged-decks file excluded at recommendation time*, which the index used before.
One more thing to keep in sync, and a filter every new tool would have to reapply.

### Labels are written by reading, and archetypes are optional

**Decision.** Each label was written from a generated sheet (`npm run data:sheet`) showing the
deck's list by type, trait and text tallies, the investigator's ability, and the opening of the
author's guide. The labels were written during development by Claude, one investigator at a
time, then checked for consistency against the card tallies. ArkhamDB's own tags (solo,
multiplayer, beginner, theme) are copied as the authors set them.

An archetype is recorded only when the deck is built around an investigator-agnostic mechanic,
with generic enablers and payoffs for it. Many strong decks have none: they run on their
investigator's own engine, which the summary names. See [archetypes.md](archetypes.md).

**Why.** Role is what a deck does in a scenario; archetype is how. Forcing an archetype on every
deck would dilute the filter until it means nothing.

**Rejected.** *Labeling at request time with a model call.* Cost on every recommendation, and
labels that could differ between two identical questions.

### One implementation of each fact

**Decision.** The pipeline is TypeScript and imports the app's card store, XP counting, reprint
folding and legality check.

**Why.** The previous Python pipeline had its own copies (its legality port was lenient and only
warned), so the index could state an XP or a legality the tools then contradicted. With one
implementation, a test can hold the index to the tools' own numbers.

**Rejected.** *Keeping the Python pipeline.* Two implementations of every rule.

---

## 3. The players' constraints

### Ownership is by pack, and copy counts never matter

**Decision.** `lib/collection.json` lists the owned packs: every release before the 2026 reissue.
A card is owned when any printing of it is in an owned pack. Only owned printings are named.

**Why.** The players proxy missing duplicates, so the question is only whether a card is owned.
Naming only owned printings means a card's code points at a box on their shelf.

**Rejected.** *Generating the list from ArkhamDB's packs minus the reissue.* A pack released
later would silently count as owned. `npm run data:collection` reports new packs for a decision
instead.

### The taboo switch is absolute

**Decision.** With the taboo list off, no taboo change is applied or mentioned anywhere. With it
on, the current list applies to card text, XP and deckbuilding. The setting reaches tools through
the AI SDK's per-tool context and the turn note, never the system prompt.

**Why.** Players who do not use the taboo list should not have to read about it. Keeping the
setting out of the system prompt keeps its bytes, and the cache, stable.

### XP is information, never a penalty

**Decision.** XP is reported for every deck and never lowers its rank. A solo tag is described
as self-sufficient, not as a mark against a deck.

**Why.** The players will earn the XP over a campaign, and a strong solo deck is often a strong
two-player deck.

---

## 4. The loop

### Budgets are enforced by code, and the last step is kept for the answer

**Decision.** Steps, tool calls and wall time are bounded in `BUDGET` (`lib/agent.ts`): 10 model
calls, 14 tool calls, and 270 s for the whole answer, of which the last 60 s are kept for writing
it. When a limit is reached the next step runs with tools switched off and a note to answer from
what was found and say what could not be checked.

**Why.** A prompt that asks the model to be brief with tools is a suggestion. A reserved answer
step means every question ends in an answer, never in a spent budget.

### History carries words, not evidence

**Decision.** Earlier turns keep their text; their tool results are dropped. The window starts on
a question, so an answer whose question fell out of it goes too.

**Why.** Decks, taboo lists and card data change. A result from ten minutes ago re-read as if it
were current is a quiet source of wrong answers, and tools refetch cheaply.

### Errors never masquerade as absence

**Decision.** Every ArkhamDB call returns data, `not_found` or `error`, and the model sees them as
different facts.

**Why.** ArkhamDB returns 500s. "This card has no rulings" and "I could not fetch the rulings" are
different answers, and a model shown an empty result reports the first.

### Untrusted text is fenced

**Decision.** Deck names and guides are wrapped in `<untrusted_data>` before the model reads them,
with every `<` inside escaped as `‹` so nothing in them can close the fence, and the prompt says
anything inside is material, never instructions.

**Why.** Guides are arbitrary prose written by strangers, and the `deck` tool feeds them straight
into the conversation.

---

## 5. Engineering

### Tests are hermetic, against the data the index was built from

**Decision.** `npm run data:index` writes, alongside the index, the card set and taboo lists it
used and the decklists it indexed into `tests/fixtures/`. The tests read only those.

**Why.** A test that fetches the live card set passes or fails with ArkhamDB's edits. Snapshotting
from the same build means "the index's XP matches the deck tool's" compares like with like, and
CI needs no network.

### The rules page is parsed as written

**Decision.** `pipeline/rules.ts` parses the Rules Reference with htmlparser2, not a spec HTML
parser.

**Why.** The page has stray tags, an `<i>` spanning two paragraphs among them. A spec parser
repairs them by merging what the author kept apart; parsing as written keeps the author's
structure.

---

## Reversals

Kept so that nobody rebuilds a thing that was removed on purpose. The full path, with every
design that was built and then removed and the measurement behind it, is in
[design-log.md](design-log.md).

- **Pair records.** The earlier version, a static pair finder, stored scored pairs of decks.
  Across 2,015 investigator pairs the spread between deck pairings within one investigator pair
  had a median of 0.258 on a 0 to 1 scale, so pairs are decided per deck, and a pairing is
  worked out when asked.
- **The flagged-decks list.** Replaced by skipping illegal lists at selection.
- **The Python pipeline.** Replaced by `pipeline/`, sharing `lib/`.
