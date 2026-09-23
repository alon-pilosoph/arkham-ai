<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# arkham-ai: working on the code

A chat assistant for two Arkham Horror LCG players. Read [README.md](README.md) for what it does,
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how, and
[docs/design-decisions.md](docs/design-decisions.md) before changing anything structural.

## Invariants

- **The system prompt's bytes never change between requests.** It carries the whole Rules
  Reference and a long-lived cache marker. Anything that varies per turn (the date, the
  players' settings) goes on the newest user message, in `lib/agent.ts`. Tool descriptions are
  prompt text too. `tests/golden.test.ts` pins the guidance and every tool definition byte for
  byte, and the whole system prompt (rules included) by hash; a change is deliberate only when
  you rerun it with `UPDATE_GOLDEN=1`, and a missing pin fails.
- **Tools report errors as errors.** A failed fetch is `ERROR`, a missing thing is `NOT FOUND`,
  and neither is ever shown as "there are none".
- **Fetched text is untrusted.** Deck names and guides are written by strangers: wrap them with
  `untrusted()` from `lib/format.ts` before they reach the model.
- **Only owned cards are offered.** The collection is `lib/collection.json`, kept by hand (every
  pack before the 2026 reissue). Recommendations and replacements are filtered to it, and a
  card's printings are named only from owned boxes.
- **The taboo switch is absolute.** Off means no taboo change is applied or mentioned anywhere;
  on means the current list. Tools read it from their per-tool context (`lib/settings.ts`),
  never from the prompt.
- **XP is information, never a penalty.** Nothing ranks a deck lower for its XP, and a solo tag
  is no mark against a deck.
- **Budgets live in code.** Steps, tool calls and wall time are bounded in `BUDGET`
  (`lib/agent.ts`), and the last step is always reserved for the answer.
- **One implementation of each fact.** The pipeline uses the app's own card store, XP counting
  and legality check, so the index can never disagree with the tools.
- **`lib/settings.ts` is imported by the client.** Keep it free of server modules.

## Commands

```sh
npm run dev          # the app, http://localhost:3000 (ARKHAM_MODEL=mock:local needs no key)
npm run check        # typecheck, Biome lint and format check, tests
npm run format       # apply Biome fixes and formatting
npm run build
npm run e2e          # the built app in a browser (Playwright), no key needed
npm run eval -- --model anthropic:claude-opus-5-5 --max-usd 2   # real model, costs money
```

`npm run eval` reads its key from the environment: run `set -a && . ./.env.local && set +a`
first. It writes transcripts to `evals/results/` to be read, and grades nothing.

The data commands (`data:crawl`, `data:index`, `data:sheet`, `data:rules`, `data:faq`,
`data:collection`) are described in [docs/data-pipeline.md](docs/data-pipeline.md). They are
offline and polite to ArkhamDB (one request a second); the app never runs them.

## Tests

Hermetic: the card set, taboo lists and decklists come from `tests/fixtures/`, which
`npm run data:index` rewrites together with the index. `vitest.config.mts` sets
`ARKHAM_CARDS_FILE` and `ARKHAM_TABOOS_FILE` to the pinned snapshots, and the loaders
(`lib/loader.ts`) read those files instead of ArkhamDB. A test that needs a new deck gets a
`tests/fixtures/decklist-<id>.json`: the fetch mock answers any other deck id the way ArkhamDB
answers a missing one, and throws on every other URL. Test behavior with
known answers, not prose.

## Data you must not hand-edit

`lib/index/decks.json`, `lib/index/card-usage.json` and the `tests/fixtures/` snapshots are
build outputs. Change a deck's role, archetypes or summary in `data/deck-labels/`, then run
`npm run data:index`. Archetypes are defined in `lib/archetypes.ts` and explained in
[docs/archetypes.md](docs/archetypes.md).
