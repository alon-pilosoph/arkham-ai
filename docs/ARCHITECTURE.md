# Architecture

This document describes how the assistant answers a question, what it reads to do so, and how
the deck index, the only data it builds ahead of time, is produced. The reasons behind each
choice, and the alternatives that were rejected, are in
[design-decisions.md](design-decisions.md). The index build is covered step by step in
[data-pipeline.md](data-pipeline.md).

## Overview

The code has two halves that share one library, `lib/`:

- **The app** is a Next.js chat page and a single API route. While answering, it fetches the
  card set, taboo lists and decks from ArkhamDB, and reads a few files bundled with the code.
- **The offline pipeline** (`pipeline/`) is a set of scripts run by hand with `npm run data:*`.
  They build the deck index and refresh the bundled Rules Reference and rulings. The app never
  runs them.

```
Browser: app/assistant.tsx (assistant-ui thread, taboo switch)
  |
  |  POST /api/chat  {messages, settings}
  v
app/api/chat/route.ts     validates the body, picks the model
  |
  v
lib/agent.ts              one streamText loop: budgets, cache breakpoints
  |
  v
lib/tools/                cards, deck, recommendDecks, replaceCard
  |
  +--> ArkhamDB, live:     card set, taboo lists, decks
  +--> bundled files:      data/rules.md, data/faq.json,
                           lib/collection.json, lib/index/*.json

pipeline/ (offline, npm run data:*)
  reads:   ArkhamDB, data/deck-labels/
  writes:  lib/index/*.json, data/rules.md, data/faq.json,
           tests/fixtures/
```

Both halves import the same modules from `lib/`: the card store (`lib/cards.ts`), deck decoding
and XP counting (`lib/decks.ts`), taboo handling (`lib/taboo.ts`) and the legality check
(`lib/legality.ts`). An XP total, a legality verdict or the folding of a reprint into its
original card is therefore computed by the same function in the app and in the pipeline.

## A request, end to end

1. **The page** (`app/assistant.tsx`) is an [assistant-ui](https://www.assistant-ui.com)
   thread. Each tool has its own renderer in `components/tools/` (`cards-ui.tsx`,
   `deck-ui.tsx`, `recommend-decks-ui.tsx`, `replace-card-ui.tsx`, with shared pieces in
   `parts.tsx`), registered as an assistant-ui toolkit in `components/tools/tool-ui.tsx`. A call
   to any other tool falls back to the thread's generic tool card.

   The taboo switch (`components/settings/taboo-switch.tsx`) writes the players' settings
   through `hooks/use-settings.ts`, which keeps them in `localStorage` so every tab of the
   browser shares them. The chat transport reads the settings again for every request, and
   trims the history before sending it (`trimHistory`, `lib/history.ts`), so old tool results
   never go over the wire.

   The composer accepts text only: there is no attachment adapter, and pasting a file attaches
   nothing. Threads are kept in memory unless `NEXT_PUBLIC_ASSISTANT_BASE_URL` names an
   [Assistant Cloud](https://cloud.assistant-ui.com) project, which stores them per browser,
   anonymously, and gives them generated titles.

2. **The route** (`app/api/chat/route.ts`) validates the body, `{messages, settings}`, with zod.
   A malformed body or message part gets a 400, and a body over 512 KB a 413. Settings are
   optional and merged over the defaults, so a tab opened before a new setting existed still
   works. The route then picks the model (`lib/model.ts`) and streams the agent's output back as
   an AI SDK UI message stream, including the model's reasoning. If the answer fails, the
   players see a plain-language message and the provider's own error goes to the server log.

3. **The history is trimmed again** on the server, by the same `trimHistory`. Earlier turns
   keep only their text, never their tool results, so stale data is never re-read as if it were
   current; the tools fetch it again. The last 24 messages are kept, and the window always
   starts on a user message: an answer whose question fell out of the window is dropped with it.

4. **A per-turn note** is prepended to the newest user message: today's date, whether the
   taboo list is on, and the decks the players saved as their own and their partner's, if any,
   by link, investigator and name, the name wrapped as untrusted (`turnNote` and `anchorTurn`,
   `lib/agent.ts`). It never goes into the system
   prompt, whose bytes are identical on every request.

5. **The agent loop** is one `streamText` call with seven tools. The players' settings reach each
   tool through the AI SDK's per-tool context (`toolsContext`), not through the prompt. Before
   each step, `prepareStep` checks the budgets and moves the cache breakpoint (see below).

6. **Each tool** returns a structured result for the UI, and renders that result as text for the
   model (`toModelOutput`), wrapping any text written by ArkhamDB users as untrusted data. The UI
   shows every result in assistant-ui's own tool card (running, done, stopped or failed), with
   shadcn/ui components inside.

## The system prompt and caching

The system prompt (`lib/prompt.ts`) is the guidance, which covers what the assistant is for, how
to use each tool and the rules that keep it honest, followed by the complete Rules Reference from
`data/rules.md`: about 39,500 words under 285 headings, inlined whole. There is no rules tool.

Prompt caching depends on keeping the request's leading bytes identical:

- The system prompt carries a one-hour cache breakpoint and never changes between requests.
- A second breakpoint (the provider's default five minutes) sits on the newest message and moves
  forward at each step, so every step reads everything before it from the cache.
- Anything that varies, such as the date or the settings, goes on the newest user message only.
- `tests/golden.test.ts` pins the guidance and every tool's description and input schema byte for
  byte, and the whole system prompt, `data/rules.md` included, by hash. A tool description is
  prompt text the model reads on every call, so changing one fails the test until the pins are
  regenerated on purpose with `UPDATE_GOLDEN=1`.

## Budgets

The limits live in `BUDGET` in `lib/agent.ts` and are enforced in code, not requested in the
prompt:

| Limit | Value |
|---|---|
| Model calls per answer (`maxSteps`) | 10, the last one reserved for the answer |
| Tool calls per answer (`maxToolCalls`) | 14, counted as each call starts; later calls return `ERROR` without doing any work |
| Wall time for the whole answer (`deadlineMs`) | 270 s, under the route's `maxDuration` of 300 s; the stream is stopped at the deadline, and any unfinished text block is dropped (see [card link repair](#card-link-repair)) |
| Time kept for writing the answer (`answerReserveMs`) | 60 s: tool work, ArkhamDB fetches included, is cut off once less than this remains |
| Time allowed for one more tool step (`toolStepMs`) | 60 s: a step is offered tools only if this and the reserve both fit before the deadline |
| History kept | 24 messages (`HISTORY_MESSAGES`, `lib/history.ts`) |
| Characters one tool result may add to the context | 80,000 (`MAX_TOOL_CHARS`, `lib/format.ts`); a longer result is cut with a note saying so |

When any limit is reached, the next step runs with `toolChoice: "none"` and a note telling the
model to answer from what it has and to say what it could not check. The loop also stops after
that step, even if a model ignores the tool setting.

The time limit for tools reaches every ArkhamDB fetch without being passed through each tool.
`lib/deadline.ts` holds the answer's abort signal in an `AsyncLocalStorage` scope, every tool
call runs inside that scope, and `getJson` (`lib/arkhamdb.ts`) reads the signal from it. A fetch
still running when time is up is aborted and reports `ERROR`.

## The tools

| Tool | Reads | Returns |
|---|---|---|
| `cards` | The card store, official rulings, and the taboo list when it is on | Every version of each matching card, grouped by name, with text, errata, rulings and any taboo change. Long results are paged with an offset. |
| `deck` | The deck, from ArkhamDB | The decoded list (customizable upgrades included), XP, cards not in the collection, the investigator's sides and deckbuilding choices, and the author's guide, paged with an offset |
| `findDeck` | The deck index | The indexed decks closest to the way a player named one ("Boom Chakra Lacka", "my bless Mary deck"), ranked by title and investigator, then role and archetypes, then summary. The model reads one only when it clearly fits; otherwise it asks which, or for the deck's link. |
| `recommendDecks` | The deck index | A shortlist, most liked first, one deck per investigator unless an investigator was asked for. With `pairWith`, decks in the roles that complement the given deck. |
| `upgrades` | The deck, the card store, the legality check, play rates, and the taboo list when it is on | What an XP budget buys for the deck, each owned and legal: higher levels of cards it runs (the difference in level, at least 1, for every copy), unmarked customization boxes (1 XP each, at most 10 a sheet), new cards of level 1 and up, and the level 0 cards this investigator's liked decks play most. Prices follow the Rules Reference: exceptional doubles, myriad pays once, the taboo surcharge only when the list is on; cards bought only at deck creation are left out. The model picks the set and names what each new card replaces. |
| `campaignPrep` | The card store's encounter cards, and the campaign table in `lib/campaigns.ts` | What a Chapter 1 campaign or standalone scenario asks of the investigators, computed from its encounter cards as counts and averages: the skills its treacheries test, how often they deal horror, damage or doom, its enemies' fight, evade, health, attacks and keywords, its locations' shroud, and frost, bless or curse tokens. For the older cycles also by pack, in play order. No card is named, so it spoils nothing; a hand-written note per campaign covers structure the data can't show. Used only when the players ask. |
| `replaceCard` | The deck, the card store, the legality check, play rates | Legal, owned candidates to replace one card in one deck, for a goal: cheaper, the same job, a different job, or an owned stand-in for an unowned card |

All seven tools follow the same contracts:

- **An error is never shown as absence.** ArkhamDB calls return a `Fetched<T>`
  (`lib/arkhamdb.ts`): the data, `not_found` or `error`. The model sees `ERROR: ...` or
  `NOT FOUND: ...`, never an empty result, and the prompt tells it never to report a failed
  lookup as "there are none".
- **Untrusted text is wrapped.** Deck names (in tool results and in the saved decks of the
  per-turn note), guides and free-text customization choices (a
  trait or skill the author typed) pass through `untrusted()`
  (`lib/format.ts`), which wraps them in `<untrusted_data>` tags and replaces every `<` inside
  with `‹`, so no tag in the text, however nested, can close the wrapper.
- **Long results are paged.** `cards` and `deck` return an offset to continue from rather than
  truncating.
- **Rulings travel with the card.** A deck list marks every card that has official rulings with
  `[FAQ]`, so the model reads them before explaining the card, and `replaceCard` includes the
  replaced card's rulings, since a ruling can change what a card does.
- **Decks are opened one way.** `deck`, `replaceCard` and `upgrades` all read a deck through `openDeck`
  (`lib/decks.ts`), so they fail the same way, with a `Failure` (`lib/format.ts`) that renders as
  `NOT FOUND` or `ERROR`.

### Finding a partner deck

`recommendDecks` with `pairWith` first looks the given deck up in the index. If it is there, its
labeled role determines which roles to look for (`COMPLEMENT`, `lib/index/decks.ts`): a cluever
is offered fighters first, then flex decks. If it is not in the index, the tool returns
`NEEDS ROLE` until the model has read the deck and passes the role that fills its gap. The
partner's own investigator is never offered, and the tool description tells the model to read the
strongest candidates with `deck` before choosing.

### How replacements are ranked

`replaceCard` scores each candidate by how similar it is to the replaced card (for the
"different job" goal, how dissimilar) plus how often it is played:
`4 × investigator share + 2 × class share`, from `lib/index/card-usage.json`. Those play rates count every published decklist with 10 or more
likes, owned or not, so an investigator with few published decks still gets a signal from its
class. A leveled card's share is taken among the decks whose list holds at least its level in XP
(`playRate`, `lib/index/usage.ts`), so starting decks don't dilute it.

## The card store

`lib/cards.ts` loads ArkhamDB's full card set, about 9 MB of JSON, into a `CardStore`. That load
and the taboo lists' load (`lib/taboo.ts`) both go through `cachedLoader` (`lib/loader.ts`):

- One copy is kept in memory for a day, and also on disk (`data/cache/`) where the filesystem is
  writable, which in practice means local development.
- Concurrent requests share a single load.
- A copy older than a day is served immediately and refreshed in the background, so no answer
  waits on a refresh.
- A failed refresh keeps serving the last copy (from memory, or after a restart a stale disk
  copy), logs one warning, and waits a minute before trying again.
- Only a first load, with nothing to serve yet, is waited for, and never for longer than the
  request's time for tools.

`ARKHAM_CARDS_FILE` and `ARKHAM_TABOOS_FILE` point the loaders at fixed snapshot files instead of
ArkhamDB. The tests and the Playwright run use them.

The store's behavior:

- **Reprints fold into their original.** A card folds into the one named by ArkhamDB's
  `duplicate_of_code`. A hidden promo printing (the novella investigators, for instance) folds
  into the one visible card that has the same name, subname, class, type and level. Parallel
  versions share a name but are different cards, so they never fold, and an ambiguous match folds
  nothing.
- **All versions come back together.** Every level of a card is returned as one group, so the
  model cannot quote the wrong printing's text.
- **There is one name search.** `store.find` parses an optional level (`"Name (2)"`), tries the
  exact name, and otherwise matches the starts of words, so "Holy" finds Holy Rosary but not
  Melancholy. The `cards` tool and the `keyCard` filter of `recommendDecks` both use it.
- **Taboo entries follow the card.** `tabooEntry` (`lib/taboo.ts`) checks every printing, so a
  reprint carries its original's taboo change.
- **Ownership is by pack.** `lib/collection.json` lists the owned packs. A card is owned when any
  of its printings is in one of them, and only owned printings are named to the players.

## Saved decks

The **Decks** button in the header (`components/settings/deck-slots.tsx`) keeps two decks in the
browser's settings: the player's own and their partner's. A pasted ArkhamDB link is read by
`GET /api/deck?ref=` (`app/api/deck/route.ts`), through the same `fetchDeck` as the tools, into
the deck's id, kind, name and investigator. Saved decks travel with every request as settings
and reach the model in the per-turn note, so "my deck" and "my partner's deck" need no link.
Tool rows name a saved deck by whose it is and any other as "the deck", never by its number
(`components/tools/deck-label.ts`).

## The card dialog

A card link, in an answer or in a tool's result, opens the card in the app instead of on
ArkhamDB: a dialog on desktop and a bottom sheet on a phone, laid out like the ArkhamCards app.
A click with a modifier key still opens ArkhamDB in a new tab.

- `components/cards/card-link.tsx` recognizes `arkhamdb.com/card/<code>` links, and
  `CardDialogProvider` (`components/cards/card-dialog.tsx`) is the context they open.
- The dialog asks `GET /api/card/<code>?taboo=0|1` (`app/api/card/[code]/route.ts`), which
  builds `cardDetail` (`lib/card-detail.ts`) from the same store and the same `cardView` as the
  `cards` tool, so the dialog and the model never disagree about a card. The taboo change is
  included only when the switch is on.
- The card text keeps ArkhamDB's markup. `components/cards/rich-text.tsx` turns a fixed set of
  tags (`<b>`, `<i>`, `<blockquote>` and a few more), `[[Trait]]` and `[icon]` into elements;
  anything else is dropped to its text and nothing is ever set as HTML.
- Game symbols come from ArkhamDB's own icon font (`app/fonts/arkham-icons.woff`); card text
  is set in Alegreya, as on the printed cards.
- The art is a crop of ArkhamDB's scan, placed by card type; tapping it shows the whole scan.
  Only owned printings are listed, and a link inside the dialog (another level, a card named in
  a ruling) opens on top of it, with a back button.

## Legality

`lib/legality.ts` evaluates ArkhamDB's deckbuilding options the way ArkhamDB does: a card is
governed by the first option that matches it, a `not` option forbids it, and an option with a
limit admits it only while there is room. It handles chosen classes, signature cards,
customizable levels, Versatile, parallel investigator sides and the taboo list's changes to
deckbuilding.

Deck limits count copies by title across levels, as ArkhamDB's validator does: myriad allows
three, a purchased customization can raise a limit, Underworld Support lowers it to one, and
copies the author marked as outside the deck limit are not counted. The taboo list in force can
lower a limit or forbid a card. `deckViolation` returns the first card in a list that breaks the
rules.

The check is tested against ArkhamDB's own verdicts. Every published decklist passed ArkhamDB's
validator when it was published, and `tests/legality.test.ts` checks that every indexed list also
passes here, under the taboo list it was built with.

## The deck index

`lib/index/decks.json` has one row per deck, validated by `IndexRowSchema`
(`lib/index/schema.ts`) when it loads. Each row holds the deck's id, name, investigator, class,
publication date, XP (as printed, and under the current taboo list), whether the list is legal
under that taboo list, its role and optional secondary role, up to three archetypes, a one-line
summary, the author's ArkhamDB tags, its likes, and its cards as original-printing codes, which is
what lets the tool answer "a deck that runs Rite of Seeking".

It holds the ten most liked published decklists for each of the 66 investigators the players own,
counting only lists the collection can build and the rules allow, with republished copies of one
list counted once: 660 decks.

Every deck's role, archetypes and summary (its label, kept in `data/deck-labels/`) was written
from a generated label sheet showing the deck's list, counts of mechanics found in its card text,
and the opening of its guide. Claude wrote the labels during development, one investigator at a
time, and they were checked against those counts. [data-pipeline.md](data-pipeline.md) describes
the build, and [archetypes.md](archetypes.md) defines the archetypes.

## The model

`lib/model.ts` chooses the provider. `ARKHAM_MODEL` (`provider:model`) wins if it is set;
otherwise OpenAI (`gpt-6-sol`) is used when `OPENAI_API_KEY` is set, and Anthropic
(`claude-opus-5-5`) when only `ANTHROPIC_API_KEY` is. Nothing else in the app knows which
provider is answering. Reasoning effort is pinned per provider (`medium` for OpenAI, `high` for
Anthropic) and can be overridden with `ARKHAM_EFFORT`.

GPT-6 Sol is the default because it is accurate and much cheaper per question than Claude. The
evals found it free of errors, and Anthropic charges extra to write the system prompt into its
cache, which a lightly used app pays on most requests; OpenAI's caching has no such charge. See
[evals.md](evals.md#the-move-to-gpt-6-sol).

Two provider quirks are handled by middleware in `lib/model.ts`:

- **OpenAI.** The Responses API makes function tools strict by default, which forces the model to
  fill in every optional field; a search with every filter set finds nothing. `openaiModel` turns
  strict mode off.
- **Anthropic.** The AI SDK's Anthropic provider implements `toolChoice: "none"` by dropping the
  tool list, which invalidates the cached prefix and makes Anthropic reject a history that
  contains tool calls. `anthropicModel` keeps the tools and sends Anthropic's own
  `tool_choice: {type: "none"}` instead.

`ARKHAM_MODEL=mock:local` swaps in the mock model (`lib/mock-model.ts`): a scripted stand-in that
picks one tool for the question by pattern matching, calls it, and replies with a fixed message
saying how long the result was. It runs the real loop, tools and UI end to end with no API key,
which is how the Playwright tests run.

### Card link repair

Every model tested, even those the evals never caught making an error, occasionally links a real
card with another card's code. `lib/link-repair.ts` checks each
`[Name](https://arkhamdb.com/card/CODE)` link in an answer against the cached card set, with no
ArkhamDB call. If the code belongs to a different card, the link is corrected when the name
matches exactly one card, and otherwise reduced to plain text, which is also what the prompt asks
for when no tool supplied a code. `lib/agent.ts` applies it as a `streamText` transform that
holds back each block of answer text until the block ends, then sends it repaired, in one piece.
Tool calls and reasoning still stream live, but the answer text does not appear token by token.
If the deadline cuts a text block off before it ends, that block's partial text is never sent;
the route then ends the stream with an error that reads "This answer ran out of time. Try
again, or ask a narrower question." (`OUT_OF_TIME_ANSWER`).

## Tests

The unit tests use Vitest and are all in `tests/`. `known-answers.test.ts` holds regression tests
built from mistakes found when stored write-ups were checked by hand, each with a known correct
answer.

| File | What it checks |
|---|---|
| `known-answers.test.ts` | Past mistakes: the wrong printing's level, a card that only helps its owner credited to a partner, a card named that is not in the deck, a dropped once-per-round limit. Also taboo on and off, partner search, filters and untrusted-text wrapping. |
| `legality.test.ts` | Every indexed list is legal under its own taboo list; deckbuilding cases checked by hand against ArkhamDB |
| `index.test.ts` | The index's XP matches the `deck` tool's, its cards are the list's own, every archetype is used and every example card is owned, `docs/archetypes.md` matches `lib/archetypes.ts`, play-rate counts are consistent |
| `selection.test.ts` | The pipeline's selection rules: most liked first, republished lists once, unowned and illegal lists skipped with the card named, promo reprints folded |
| `pipeline-parsers.test.ts` | The rules, FAQ and decklist-search parsers, on pages shaped like ArkhamDB's, including a search page with a row that has no deck link |
| `agent.test.ts` | The loop: budgets, the reserved answer step, cache breakpoints, history trimming, a wrong card code corrected against the real card data |
| `providers.test.ts` | The request each provider actually receives: Anthropic's cache breakpoints (1 h on the system prompt, 5 min on the newest message) and its own `tool_choice`, and a valid OpenAI Responses call |
| `model.test.ts` | Which provider `modelSpec` picks from the keys that are set, `ARKHAM_MODEL` and `ARKHAM_EFFORT` |
| `link-repair.test.ts` | A correct link is left alone, a level pins a name to one version, an ambiguous or unknown name becomes plain text |
| `route.test.ts` | The chat route: 400s for bad bodies, a 413 for an oversized one, partial settings, provider errors shown in plain words, a cut-off answer that says so |
| `taboo-unavailable.test.ts` | With the taboo switch on and the taboo lists unavailable, every tool reports an error instead of an answer without the taboo list applied |
| `loader.test.ts` | The card set and taboo lists survive ArkhamDB being down: the last copy is served, one warning is logged, and retries wait a minute |
| `mock-model.test.ts` | The mock model only calls tools that exist |
| `card-detail.test.ts` | The card dialog's data: owned printings named once, every version (a parallel investigator by its pack), reprints opened as the original, the taboo change only with the switch on; the route's 200, 400 and 404; which links are card links; card markup rendered without passing other HTML through |
| `find-deck.test.ts` | `findDeck` finds a deck by title, with or without its investigator, and by what it does; a name that fits many returns several candidates; an unknown name returns none and says to ask for the link; deck names are wrapped as untrusted; `GET /api/deck` reads a pasted link and refuses one that isn't |
| `upgrades.test.ts` | XP spending: an upgrade pays the difference for every copy, nothing costs more than the budget or is unowned, a new card's price (level, at least 1, exceptional doubled, the taboo surcharge only when on), level 0 cards listed apart, deck-creation cards never offered, customization boxes within the sheet's 10, a card the deck runs is an upgrade and never a purchase |
| `campaign-prep.test.ts` | Campaigns found by name or code (a Return to box only when asked for), every campaign's packs present in the card set, Carcosa's treacheries dealing more horror than damage, Edge of the Earth's frost, the by-pack breakdown, copies counted once, and no encounter card named in the output |
| `symbols.test.ts` | Game symbols in an answer become keycaps; links and other brackets are left alone |
| `golden.test.ts` | The guidance and tool definitions byte for byte, and the whole system prompt by hash; a missing pin file fails |
| `e2e/smoke.spec.ts` | Playwright, on desktop and phone viewports: the welcome screen, a card lookup, a card link opening the card dialog, a deck shortlist, a deck found by name, a deck slot refusing what isn't a link, campaign prep, the taboo switch surviving a reload |

The unit tests never touch the network. `vitest.config.mts` sets `ARKHAM_CARDS_FILE` and
`ARKHAM_TABOOS_FILE` to the card set and taboo lists in `tests/fixtures/`, and a `fetch` mock
(`tests/helpers.ts`) answers deck requests from `tests/fixtures/decklist-<id>.json` and throws on
any other URL. `npm run data:index` rewrites the card set, the taboo lists and
`indexed-decks.json` (every indexed list) together with the index, so the tests compare the index
with the data it was built from. The `decklist-<id>.json` files are added by hand for tests that
need a particular deck.

## Evals

`evals/run.ts` runs the product's use cases (`evals/cases.ts`: rules questions, card lookups with
the taboo list on and off, reading a deck, replacements, finding decks, finding partners) against
a real model, stops once a dollar cap is reached, and writes each transcript to
`evals/results/<provider>_<model>[@effort]/` (ignored by git) for a person to read:

```sh
set -a && . ./.env.local && set +a   # load the API keys
npm run eval -- --model openai:gpt-6-sol --max-usd 2
npm run eval -- --model openai:gpt-6-sol --cases rules-doom,partner
```

[evals.md](evals.md) has the method, the results per model and what they changed.
