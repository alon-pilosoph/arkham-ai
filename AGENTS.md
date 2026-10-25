<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# arkham-ai: working on the code

A chat assistant for two Arkham Horror LCG players. Read [README.md](README.md) for what it does,
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it works, and
[docs/design-decisions.md](docs/design-decisions.md) before changing anything structural.

## Invariants

- **The system prompt's bytes never change between requests.** It holds the whole Rules
  Reference and carries a one-hour cache breakpoint. Anything that varies per turn (the date,
  the players' settings) goes on the newest user message, in `lib/agent.ts`. Tool descriptions
  and input schemas are prompt text too. `tests/golden.test.ts` pins the guidance and every tool
  definition byte for byte, and the whole system prompt (rules included) by hash. To make a
  deliberate change, regenerate the pins with `UPDATE_GOLDEN=1` and review the diff; a missing
  pin file fails the test.
- **Tools report errors as errors.** A failed fetch is `ERROR`, a missing thing is `NOT FOUND`,
  and neither is ever presented as "there are none".
- **Fetched text is untrusted.** Deck names, guides and free-text customization choices are
  written by strangers: wrap them with `untrusted()` from `lib/format.ts` before they reach the
  model. A deck's chosen class is checked against the investigator's options instead.
- **Only owned cards are offered.** The collection is `lib/collection.json`, kept by hand (every
  pack released before the 2026 reissue). Recommendations and replacements are filtered to it,
  and a card's printings are named only from owned packs.
- **The taboo switch is absolute.** Off means no taboo change is applied or mentioned anywhere;
  on means the current list applies. Tools read the setting from their per-tool context (typed
  by `Settings` in `lib/settings.ts`), never from the prompt.
- **XP is information, never a penalty.** Nothing ranks a deck lower for its XP, and a solo tag
  is not a mark against a deck.
- **Budgets live in code.** Steps, tool calls and wall time are bounded by `BUDGET` in
  `lib/agent.ts`, and the last step is always reserved for the answer.
- **One implementation of each fact.** The pipeline uses the app's own card store, XP counting
  and legality check, so the index can never disagree with the tools.
- **`lib/settings.ts` is imported by the client.** Keep it free of server modules.

## Commands

```sh
npm run dev      # dev server on http://localhost:3000
npm run check    # typecheck, Biome lint and format check, unit tests
npm run format   # apply Biome fixes and formatting
npm run build    # production build
npm run e2e      # Playwright end-to-end tests (no API key needed)
npm run eval -- --model openai:gpt-6-sol --max-usd 2   # costs money
```

`npm run dev` answers with a real model, so it needs an API key in `.env.local`.
`ARKHAM_MODEL=mock:local npm run dev` runs the app on the mock model (`lib/mock-model.ts`), a
scripted stand-in that needs no key.

`npm run eval` runs the eval cases against a real model and reads its API key from the
environment, so run `set -a && . ./.env.local && set +a` first. It writes transcripts to
`evals/results/` for a person to read. It does not grade answers, but it flags linked card codes
that no tool returned, taboo mentions while the list is off, and empty answers, and exits with an
error if any turn fails one of those checks. See [docs/evals.md](docs/evals.md).

The data commands (`data:crawl`, `data:index`, `data:sheet`, `data:rules`, `data:faq`,
`data:collection`) are described in [docs/data-pipeline.md](docs/data-pipeline.md). They run
offline, make at most one request a second to ArkhamDB, and are never run by the app.

## Tests

The unit tests never touch the network. `vitest.config.mts` sets `ARKHAM_CARDS_FILE` and
`ARKHAM_TABOOS_FILE` to the card set and taboo lists in `tests/fixtures/`, and the loaders
(`lib/loader.ts`) read those files instead of ArkhamDB. `npm run data:index` rewrites those two
snapshots and `tests/fixtures/indexed-decks.json` together with the index.

A test that needs a specific deck gets a hand-added `tests/fixtures/decklist-<id>.json`. The
`fetch` mock in `tests/helpers.ts` serves those files, answers any other deck id the way ArkhamDB
answers a missing deck (an empty 200 response), and throws on every other URL.

Assert on behavior with known correct answers (a card's level, a count, a legality verdict), not
on the wording of generated text.

## Generated data: do not edit by hand

`lib/index/decks.json`, `lib/index/card-usage.json` and the snapshots `npm run data:index` writes
into `tests/fixtures/` are build outputs. To change a deck's role, archetypes or summary, edit its
label in `data/deck-labels/` and run `npm run data:index`. Archetypes are defined in
`lib/archetypes.ts` and explained in [docs/archetypes.md](docs/archetypes.md); the table there
must match the definitions, which `tests/index.test.ts` checks.
