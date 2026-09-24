# Architecture

**Scope.** How the assistant answers a question, what it reads to do it, and how the one
thing it stores (the deck index) is made. The reasons behind each choice, and what lost, are
in [design-decisions.md](design-decisions.md); the index build in detail is in
[data-pipeline.md](data-pipeline.md).

## The shape

Two halves share one library.

```
                 browser                                   offline, run on demand
  assistant-ui thread + taboo switch                 npm run data:crawl / data:index
            |  POST /api/chat                          data:rules / data:faq
            v  {messages, settings}                              |
  app/api/chat/route.ts  --validate-->  lib/agent.ts             v
            |                      streamText, 4 tools     pipeline/  (census, selection,
            |                      budgets, cache marks       labels, usage, scrapers)
            v                                                    |
  lib/tools/  cards | deck | recommendDecks | replaceCard         |
            |                                                    |
            +--------------------  lib/  ------------------------+
               cards.ts (card store)   decks.ts (lists, XP)   legality.ts
               taboo.ts, loader.ts     archetypes.ts          index/ (decks, schema, usage)
            |                                                    |
            v                                                    v
   ArkhamDB, live: cards, taboo lists, decks        lib/index/decks.json, card-usage.json
   bundled: data/rules.md, data/faq.json,           data/rules.md, data/faq.json
            lib/collection.json                      tests/fixtures/ (snapshots)
```

The app is one Next.js route and a chat page. Everything it knows about cards, taboo lists and
decks it fetches from ArkhamDB when asked; the pipeline never runs at request time. The pipeline
imports the same `lib/` modules the tools use, so an XP total, a legality verdict or a reprint
folding is computed by one function everywhere.

## A request, end to end

1. **The page** (`app/assistant.tsx`) is an assistant-ui thread. Each tool's renderer
   (`cards-ui.tsx`, `deck-ui.tsx`, `recommend-decks-ui.tsx` and `replace-card-ui.tsx` in
   `components/tools/`, sharing `parts.tsx`) is registered as an assistant-ui toolkit in
   `components/tools/tool-ui.tsx`; any other tool call gets the thread's generic card. The
   taboo switch (`components/settings/taboo-switch.tsx`) sets a setting kept by
   `hooks/use-settings.ts`, remembered in `localStorage` and shared by the browser's tabs, and
   the chat transport reads it fresh for every request. The transport trims history before
   sending (`lib/history.ts`), so old tool results never go over the wire. The composer takes
   text only: there is no attachment adapter, and pasting a file attaches nothing. Threads live
   in memory unless `NEXT_PUBLIC_ASSISTANT_BASE_URL` names an Assistant Cloud project, which
   keeps them per browser (anonymous) with generated titles.
2. **The route** (`app/api/chat/route.ts`) validates `{messages, settings}` with zod (a bad body
   or message part is a 400; settings are partial and merged over the defaults, so a tab opened
   before a new setting still works), resolves the model (`lib/model.ts`), and streams the
   agent's output back as a UI message stream, reasoning included. A failed answer shows the
   players plain words; the provider's own message goes to the server log.
3. **History is trimmed** (`trimHistory` in `lib/history.ts`, again on the server). Earlier
   turns keep only their text, never their tool results, so nothing stale is re-read as if it
   were fresh; tools refetch. The last 24 messages are kept, and the window always starts on a
   question: an answer whose question was cut off is dropped with it.
4. **The turn note** goes on the newest user message: today's date and whether the taboo list
   is on. It never enters the system prompt, whose bytes are identical on every request.
5. **The loop** is one `streamText` call with four tools. The players' settings reach each tool
   through the AI SDK's per-tool context (`toolsContext`), not through the prompt. `prepareStep`
   enforces the budget and moves the cache marker; see below.
6. **Each tool** returns a structured result for the UI and renders it to text for the model
   (`toModelOutput`), fencing stranger-written text as data. The UI draws every result as
   assistant-ui's own tool card (running, done or failed), with shadcn parts inside.

## The system prompt and caching

`lib/prompt.ts` is the guidance (what the assistant is for, how to use each tool, the rules
that keep it honest) followed by the complete Rules Reference from `data/rules.md`: about
39,500 words and 285 headings, inlined whole. There is no rules tool.

Caching is a byte-stability discipline:

- The system prompt carries a one-hour cache marker and never changes between requests.
- One more marker sits on the newest message and moves forward each step, so every step
  re-reads everything before it from cache.
- Whatever varies (date, settings) is appended to the newest user message only.
- `tests/golden.test.ts` pins the guidance and every tool's description and schema byte for
  byte, and the whole system prompt (the rules wrapper and `data/rules.md` included) by hash. A
  tool description is prompt text the model reads on every call, so changing one fails the test
  until it is regenerated on purpose.

## Budgets

`BUDGET` in `lib/agent.ts`, enforced in code rather than asked for in the prompt:

| Limit | Value |
|---|---|
| Model calls per answer | 10, the last reserved for the answer |
| Tool calls per answer | 14, counted as each call starts; past it a call returns `ERROR` without doing work |
| The whole answer's wall time (`deadlineMs`) | 270 s, under the route's `maxDuration` of 300 s; the stream is stopped there |
| Kept for the answer step (`answerReserveMs`) | 60 s: tool work, ArkhamDB fetches included, is cut once less than this remains |
| One more tool step (`toolStepMs`) | 60 s: a step is offered tools only while it and the reserve both fit before the deadline |
| History kept | 24 messages (`HISTORY_MESSAGES`, `lib/history.ts`) |
| Characters one tool result may inject | 80,000 (`lib/format.ts`), cut loudly if ever hit |

When any limit is reached the next step runs with `toolChoice: "none"` and a note telling the
model to answer from what it has and say what it could not check. The loop also stops after that
step even if a model ignores the tool switch.

The tools' time limit reaches every fetch without being passed through each tool:
`lib/deadline.ts` holds the answer's tool signal in an `AsyncLocalStorage` scope, each tool call
runs inside it, and `getJson` (`lib/arkhamdb.ts`) reads it, so a fetch still running when time
is up stops and reports `ERROR`.

## The tools

| Tool | Reads | Returns |
|---|---|---|
| `cards` | the card store, rulings, the taboo list when on | every version of each matching card, grouped by name, with text, errata, rulings and the taboo change; long matches page by offset |
| `deck` | the deck from ArkhamDB, live | the decoded list (customizable upgrades included), XP, unowned cards, the investigator's sides, and the author's guide, paged by offset |
| `recommendDecks` | the deck index | a shortlist, most liked first, one per investigator unless one was asked for; with `pairWith`, the roles that complement the given deck |
| `replaceCard` | the deck, the card store, legality, play rates | legal owned candidates for one card in one deck, for a goal: cheaper, the same job, a different job, or an owned stand-in for an unowned card |

Common contracts:

- **Errors are not absence.** ArkhamDB calls return `Fetched<T>` (`lib/arkhamdb.ts`): data,
  `not_found`, or `error`. The model sees `ERROR: ...` or `NOT FOUND: ...`, never an empty
  answer, and the prompt tells it never to report a failed lookup as "there are none".
- **Untrusted text is fenced.** Deck names and guides go through `untrusted()`, which wraps them
  in `<untrusted_data>` and escapes every `<` inside as `‹`, so no tag in the text, however
  nested, can close the fence.
- **Long results page.** `cards` and `deck` return an offset to continue from rather than
  truncating.
- **Rulings travel with the card.** A deck list flags every card with official rulings
  (`[FAQ]`) so the model reads them before explaining it, and `replaceCard` includes the
  replaced card's rulings, since a ruling can change what a card's job is.
- **Decks open one way.** `deck` and `replaceCard` both read a deck through `openDeck`
  (`lib/decks.ts`), which returns the same `NOT FOUND` / `ERROR` failure (`Failure`, `lib/format.ts`).

### Pairing

`recommendDecks` with `pairWith` looks the deck up in the index. If it is there, its labeled role
picks the roles to seek (`COMPLEMENT` in `lib/index/decks.ts`: a cluever is offered fighters first,
then flex decks). If it is not, the tool refuses until the model has read the deck and passes the
role that fills its gap. The same investigator is never offered, and the model is told to read
the strongest candidates with `deck` before choosing.

### Replacement popularity

`replaceCard` ranks candidates partly by how often they are played: `4 × investigator share +
2 × class share`, from `lib/index/card-usage.json`. That counts every published list with ten or
more likes, owned or not, so a rare investigator still gets a class-level signal.

## The card store

`lib/cards.ts` loads ArkhamDB's full card set (about 9 MB) into a `CardStore`. The load, like
the taboo lists' in `lib/taboo.ts`, goes through `cachedLoader` (`lib/loader.ts`): one copy in
memory and on disk (development only) for a day, loaded once however many requests ask at the
same time. A stale copy is served at once and refreshed behind it, so no answer waits on a
refresh. A failed refresh keeps serving the last copy (from memory, or a stale disk copy after
a restart), is logged once, and is not retried for a minute. Only a first load, with nothing to
serve, is waited for, and never past the request's time for tools. `ARKHAM_CARDS_FILE` and
`ARKHAM_TABOOS_FILE` point the loaders at pinned files instead, which is how the tests run.

The store:

- **Reprints fold into their original.** ArkhamDB's `duplicate_of_code`, plus hidden promo
  printings that match exactly one visible card by name, subname, class, type and level (the
  novella investigators, for instance). Parallel versions share a name but are different cards,
  so they never fold, and an ambiguous match folds nothing.
- **Versions come back together.** Every level of a card is one group, so the model cannot pick
  the wrong printing's text.
- **One name search.** `store.find` parses an optional level (`"Name (2)"`), tries the exact
  name, and otherwise matches word starts, so "Holy" finds Holy Rosary and not Melancholy. The
  `cards` tool and `recommendDecks`' key-card filter both use it.
- **Taboo entries follow the card.** `tabooEntry` (`lib/taboo.ts`) looks through every
  printing, so a reprint carries its original's taboo change.
- **Ownership is by pack.** `lib/collection.json` lists the owned packs. A card is owned when any
  of its printings is in one, and only owned printings are named to the players.

## Legality

`lib/legality.ts` evaluates ArkhamDB's deck options the way ArkhamDB does: a card is governed by
the first option that matches it, a `not` option forbids it, and an option with a limit admits it
only while there is room. It handles chosen classes, signatures, customizable levels, Versatile,
parallel investigator sides and taboo-list deckbuilding changes. Deck limits count copies by
title across levels, as ArkhamDB's validator does (myriad allows three, a purchased customization
can raise a limit, Underworld Support lowers it to one, copies marked outside the limit are not
counted), and the taboo list in force can lower a limit or forbid a card. `deckViolation`
returns the first card of a list that breaks the rules.

It is held to ArkhamDB's own verdict: every published list passed ArkhamDB's validator when it
was published, and `tests/legality.test.ts` checks that every indexed list passes here too, under
the taboo list it was built with.

## The deck index

`lib/index/decks.json`, validated by `IndexRowSchema` when it loads. One row per deck: id, name,
investigator, class, publication date, XP printed and under the current taboo list, whether the
list is legal under that taboo list, role and
optional secondary role, up to three archetypes, a one-line summary, the author's ArkhamDB tags,
likes, and the canonical card codes (so "a deck that runs Rite of Seeking" is answerable).

It holds the ten most liked published lists of each of the 66 investigators the players own,
buildable from the collection and legal, with republished copies of one list counted once:
660 decks. Every role, archetype and summary (`data/deck-labels/`) was written from a label
sheet showing the deck's list, card-text tallies and the opening of its guide: by Claude during
development, one investigator at a time, and checked against the card tallies. How it is built:
[data-pipeline.md](data-pipeline.md). What the archetypes mean: [archetypes.md](archetypes.md).

## The model

`lib/model.ts` picks OpenAI (default `gpt-6-sol`) or Anthropic (default `claude-opus-5-5`) from
`ARKHAM_MODEL` or whichever key is set, preferring OpenAI when both are; nothing else in the app
knows which. Sol is the default because it is accurate and far cheaper per question than Claude:
evals across every model and effort level found it clean, and Anthropic's prompt-cache write
carries a price premium a lightly used app pays on most requests, which OpenAI's caching does
not. OpenAI's Responses API makes function tools strict by default, which forces the model to
fill every optional field (a search with every filter set finds nothing); an OpenAI-only
middleware (`openaiModel`) turns strict off, leaving Anthropic's cached request bytes untouched.
`ARKHAM_MODEL=mock:local` swaps in `lib/mock-model.ts`, a scripted stand-in that routes a
question to one tool by pattern and reports the result, so the real loop, tools and UI run end
to end with no key.

Every model, even the ones evals never faulted, occasionally names a real card with another
card's code. `lib/link-repair.ts` checks each `[Name](arkhamdb.com/card/CODE)` link in the
answer against the cached card set (no ArkhamDB call): a mismatch is corrected when the name
resolves to exactly one card, or stripped to plain text otherwise, the same fallback the prompt
already asks for when no tool gave a code. `lib/agent.ts` wires it in as a `streamText`
transform that buffers only the current text block, so tool-call progress still streams live.

## Tests

| File | Holds |
|---|---|
| `known-answers.test.ts` | answers from mistakes a hand-check pass once caught: wrong printing level, a self-only card credited to a partner, a card named that is not in the deck, a dropped once-per-round limit; plus taboo on and off, pairing, filters and untrusted fencing |
| `legality.test.ts` | every indexed list is legal under its own taboo list; hand-checked deckbuilding cases |
| `index.test.ts` | the index's XP matches the deck tool's, its cards are the list's own, every archetype is used and every example card is owned, play-rate counts are sane |
| `selection.test.ts` | the crawl's rules: most liked first, republished lists once, unowned and illegal lists passed over with the card named, promo reprints folded |
| `pipeline-parsers.test.ts` | the rules, FAQ and decklist-search parsers on pages shaped like ArkhamDB's, including a search page whose rows miss a deck link |
| `agent.test.ts` | the loop: budgets, the reserved answer step, cache markers, history trimming, a wrong card code corrected against the real card data |
| `providers.test.ts` | the request each provider really receives: Anthropic cache breakpoints (1 h on the system prompt, 5 min on the newest message) and its own `tool_choice`, and a valid OpenAI Responses call |
| `model.test.ts` | which provider `modelSpec` picks from the keys set, `ARKHAM_MODEL`, and `ARKHAM_EFFORT` |
| `link-repair.test.ts` | a correct link left alone, a level pinning a name to one version, an ambiguous or unknown name stripped to plain text |
| `route.test.ts` | the chat route's contract: 400s for bad bodies, partial settings, provider errors in plain words |
| `loader.test.ts` | the card set and taboo lists survive ArkhamDB being down: the last copy served, one log line, a minute's wait before retrying |
| `mock-model.test.ts` | the scripted model only calls tools that exist |
| `symbols.test.ts` | game symbols in an answer become keycaps; links and other brackets are left alone |
| `e2e/smoke.spec.ts` | Playwright, desktop and phone: the welcome screen, a card lookup, a deck shortlist, the taboo switch surviving a reload |
| `golden.test.ts` | the guidance and tool definitions byte for byte, and the whole system prompt (rules included) by hash; a missing pin fails |

All of it is hermetic: the card set, taboo lists and decklists come from `tests/fixtures/`,
written by the same index build that produced the shipped index. `vitest.config.mts` sets
`ARKHAM_CARDS_FILE` and `ARKHAM_TABOOS_FILE` to those snapshots.

## Evals

`evals/run.ts` runs the product's use cases (`evals/cases.ts`: rules, card lookups with the
taboo list on and off, reading a deck, replacements, finding decks, partners) against a real
model, with a dollar cap, and writes each transcript to `evals/results/<model>/` (git-ignored)
to be read by a person:

```sh
set -a && . ./.env.local && set +a
npm run eval -- --model openai:gpt-6-sol --max-usd 2 [--cases rules-doom,partner]
```
