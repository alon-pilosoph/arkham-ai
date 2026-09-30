# Design decisions

This document records every decision that shapes the assistant: what was decided, why, and which
alternatives were rejected. It describes the design as it stands today. The history of how it got
here, including designs that were built and later removed, is in [design-log.md](design-log.md).

Each record has up to four parts:

- **Decision**: what is true of the design.
- **Why**: the reasons it is right.
- **Rejected**: the alternatives, each with the specific reason it lost, so that a settled
  question does not have to be argued again.
- **Revisit when**: the condition that would reopen the decision, where there is one.

Contents:

1. [What the assistant knows](#1-what-the-assistant-knows)
2. [The deck index](#2-the-deck-index)
3. [The players' constraints](#3-the-players-constraints)
4. [The agent loop](#4-the-agent-loop)
5. [Engineering](#5-engineering)
6. [Reversals](#reversals)

---

## 1. What the assistant knows

### It reads its sources when asked, and stores only a deck index

**Decision.** Card text, rulings, taboo changes and decks are fetched from ArkhamDB when a
question needs them, and deck guides are read live. The only thing stored about decks is one row
per deck in the index, with enough information to build a shortlist.

**Why.** Errors come from restating a source ahead of time. Three full deck reviews written in
advance cost about 20k tokens each; the author's guide was 57% to 77% of what had to be read, and
the reviews mostly restated their guides. The restating also introduced a misreading: an upgrade
the guide planned for later was reported as an error in the guide. When the stored write-ups of
deck pairs from the previous version were checked by hand, all of the roughly 100 corrections
were card-text errors: a wrong printing's level, a card that only helps its owner credited to a
partner, a planned upgrade read as a card in the list. Reading the source at question time is
cheaper and cannot go out of date.

**Rejected.**
- *Stored per-deck reviews.* They restate the guide, and go stale when the author edits it.
- *Stored write-ups of deck pairs* (the previous version's design). A pairing is worked out when
  asked, from the two decks.

### The whole Rules Reference is in the system prompt

**Decision.** `data/rules.md`, about 39,500 words, is inlined into the cached system prompt.
There is no rules tool.

**Why.** The answer to a rules question can be in any of 285 entries, often in several at once.
With the whole text inlined, every entry is always in view. The cost is one uncached request per
conversation; after that, the prompt is read from the cache.

**Rejected.**
- *A `rules(section)` tool over the table of contents.* It adds a round trip per question, and
  it can pick the wrong entry or find nothing.
- *Embeddings and similarity search.* The same failure modes, plus a subsystem to run.

**Revisit when** the Rules Reference grows to an uncomfortable share of the context window.

### Official rulings are attached to cards, not kept as a document

**Decision.** ArkhamDB's `/faqs` pages are scraped into `data/faq.json`, keyed by card code, and
the `cards` tool returns a card's rulings with the card.

**Why.** Each FAQ entry is a card name, a question and an answer. Attached to the card, it
arrives exactly when the card is read, and there is no second body of text to search.

---

## 2. The deck index

### Ten decks per owned investigator, every one labeled

**Decision.** The index holds the ten most liked published decklists of each investigator the
players own, counting only lists the collection can build and the rules allow: 660 decks for 66
investigators. Every row has a role, an optional secondary role, optional archetypes and a
one-line summary.

**Why.** Recommendations are shortlists: the model reads the best two or three candidates in full
before choosing. What matters is that every investigator has good candidates and that every
candidate is labeled correctly. A minimum-likes threshold covers investigators unevenly: of the
1,981 lists with 10 or more likes, Roland Banks has 86 and the least-played owned investigators
have 3 or 4. The earlier threshold-based index held 2,683 decks, and more than half were never
labeled, so role filters silently skipped them. Ten fully labeled decks per investigator covers
every investigator with lists that other players have endorsed.

**Rejected.**
- *Every deck with 10 or more likes.* Uneven coverage, and too many to label by reading.
- *Eight per investigator.* Too few for investigators with several distinct builds.
- *Labels inferred from card traits.* The trait counts are kept, but as a consistency check on
  the labels, not as the labels: a deck with five bless cards is not always a bless deck.

**Revisit when** a new investigator is added to the collection. Rerun the build; it lists the
decks that still need labels.

### The census, not the likes order, is the source of truth

**Decision.** The crawl first takes a census: it lists every published decklist by walking
ArkhamDB's decklist search in date order. It then walks the search in likes order down to 10
likes, and fails if any deck found there is missing from the census.

**Why.** The likes order has many ties, and ArkhamDB orders tied decks differently from one
request to the next, so paging through them can skip or repeat decks. The date order is stable.
The census found 38,984 published decklists, and all 1,981 with 10 or more likes were in it.

**Rejected.** *Walking the likes order alone* (the previous version's crawl). It cannot tell a
complete walk from one that skipped a page.

### Republished lists count once

**Decision.** Within one investigator, a list that shares 85% or more of its distinct cards with
a more liked list (Jaccard similarity) is treated as the same list and skipped.

**Why.** Starter decks are republished by many users, and guide authors republish each version of
a campaign deck. In the measured pairs, those at 0.85 and above were such copies; those below
were different builds.

### Illegal and unowned lists are skipped, not flagged

**Decision.** The selection skips a list that contains any card the collection lacks, or any card
that `deckViolation` rejects under the taboo list the author built with, and takes the next one.

**Why.** Everything recommended must be buildable. Three of the lists the selection reached fail
the legality check (novelty lists, or rules that changed after publication). Skipping them keeps
the index clean without a separate list that every consumer has to remember to check.

**Rejected.** *A file of flagged decks excluded at recommendation time*, which the index used
before. It is one more thing to keep in sync, and a filter every new tool would have to apply
again.

### Labels are written by reading, and archetypes are optional

**Decision.** Each label was written from a generated label sheet (`npm run data:sheet`) showing
the deck's list by card type, counts of mechanics found in the card text, the investigator's
ability, and the opening of the author's guide. Claude wrote the labels during development, one
investigator at a time, and they were then checked for consistency against the counts.
ArkhamDB's own tags (solo, multiplayer, beginner, theme) are copied as the authors set them.

An archetype is recorded only when the deck is built around a mechanic that is not specific to
its investigator, with generic cards that enable it and cards that pay off from it. Many strong
decks have none: they run on their investigator's own ability, which the summary names. See
[archetypes.md](archetypes.md).

**Why.** A role is what a deck does in a scenario; an archetype is how it does it. Forcing an
archetype onto every deck would dilute the filter until it meant nothing.

**Rejected.** *Labeling at request time with a model call.* It costs a call on every
recommendation, and two identical questions could get different labels.

### One implementation of each fact

**Decision.** The pipeline is written in TypeScript and imports the app's card store, XP
counting, reprint folding and legality check.

**Why.** The previous Python pipeline had its own copies of these (its legality check was lenient
and only warned), so the index could state an XP total or a legality verdict that the tools then
contradicted. With one implementation, a test can hold the index to the tools' own numbers.

**Rejected.** *Keeping the Python pipeline.* Every rule would be implemented twice.

---

## 3. The players' constraints

### Ownership is by pack, and copy counts never matter

**Decision.** `lib/collection.json` lists the owned packs: every release before the 2026 reissue.
A card is owned when any printing of it is in an owned pack. Only owned printings are named.

**Why.** The players proxy missing duplicates, so the only question is whether a card is owned.
Naming only owned printings means a card's code points to a box on their shelf.

**Rejected.** *Generating the list from ArkhamDB's packs minus the reissue.* A pack released later
would silently count as owned. Instead, `npm run data:collection` reports new packs so that
someone decides.

### The taboo switch is absolute

**Decision.** With the taboo list off, no taboo change is applied or mentioned anywhere. With it
on, the current list applies to card text, XP and deckbuilding. The setting reaches the tools
through the AI SDK's per-tool context, and the model through the per-turn note on the newest user
message, never through the system prompt.

**Why.** Players who do not use the taboo list should not have to read about it. Keeping the
setting out of the system prompt keeps the prompt's bytes, and therefore the cache, stable.

### XP is information, never a penalty

**Decision.** XP is reported for every deck and never lowers its rank. A solo tag is described as
meaning the deck stands on its own, not as a mark against it.

**Why.** The players will earn the XP over a campaign, and a strong solo deck is often a strong
two-player deck.

---

## 4. The agent loop

### Budgets are enforced in code, and the last step is kept for the answer

**Decision.** Steps, tool calls and wall time are bounded by `BUDGET` in `lib/agent.ts`: 10 model
calls, 14 tool calls, and 270 s for the whole answer, of which the last 60 s are kept for writing
it. When a limit is reached, the next step runs with tools switched off and a note telling the
model to answer from what it found and say what it could not check.

**Why.** A prompt that asks the model to use tools sparingly is only a suggestion. A reserved
answer step means every question ends with an answer, never with a spent budget.

### History keeps the conversation, not the evidence

**Decision.** Earlier turns keep their text; their tool results are dropped. The history window
always starts on a user message, so an answer whose question fell out of the window is dropped
too.

**Why.** Decks, taboo lists and card data change. A tool result from ten minutes ago, re-read as
if it were current, is a quiet source of wrong answers, and the tools can fetch again cheaply.

### Errors are never presented as absence

**Decision.** Every ArkhamDB call returns data, `not_found` or `error`, and the model sees these
as different facts.

**Why.** ArkhamDB does return 500 errors. "This card has no rulings" and "I could not fetch the
rulings" are different answers, and a model shown an empty result gives the first one.

### Untrusted text is wrapped

**Decision.** Deck names, guides and free-text customization choices are wrapped in `<untrusted_data>` tags before the model reads
them, with every `<` inside replaced by `‹` so that nothing in them can close the wrapper. The
prompt says that anything inside is material to read, never instructions.

**Why.** Guides are arbitrary text written by strangers, and the `deck` tool passes them straight
into the conversation.

---

## 5. Engineering

### Tests are hermetic, and use the data the index was built from

**Decision.** Alongside the index, `npm run data:index` writes the card set and taboo lists it
used, and the decklists it indexed, into `tests/fixtures/`. The tests read only those files and
never the network.

**Why.** A test that fetches the live card set passes or fails depending on ArkhamDB's latest
edits. Taking the snapshots from the same build means that a test like "the index's XP matches the
deck tool's" compares like with like, and CI needs no network access.

### The rules page is parsed as written

**Decision.** `pipeline/rules.ts` parses the Rules Reference page with htmlparser2, not with a
parser that follows the HTML specification.

**Why.** The page has stray tags, among them an `<i>` that spans two paragraphs. A spec-compliant
parser repairs such markup by merging what the author kept apart; parsing the page as written
keeps the author's structure.

---

## Reversals

These designs were removed on purpose; they are listed so that nobody rebuilds them. The full
history, with every design that was built and then removed and the measurements behind each
removal, is in [design-log.md](design-log.md).

- **Stored deck pairs.** The previous version, a static pair finder, stored scored pairs of decks.
  Across 2,015 investigator pairs, the choice of decks within one investigator pair moved the
  score by a median of 0.258 on a 0 to 1 scale, so a pairing depends on the specific decks. It is
  now worked out when asked.
- **The flagged-decks list.** Replaced by skipping illegal lists during selection.
- **The Python pipeline.** Replaced by `pipeline/`, which shares `lib/` with the app.
