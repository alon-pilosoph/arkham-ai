# arkham-ai

<p align="center">
  <img alt="The assistant answering which deck to play beside a partner's Lily Chen deck: it read the partner's deck, searched the index for decks that fill the gap, read the two best, and recommends one with the reasons" src="docs/images/hero-desktop-light.png#gh-light-mode-only" width="900">
  <img alt="The assistant answering which deck to play beside a partner's Lily Chen deck: it read the partner's deck, searched the index for decks that fill the gap, read the two best, and recommends one with the reasons" src="docs/images/hero-desktop-dark.png#gh-dark-mode-only" width="900">
</p>
<p align="center">
  <img alt="The same answer on a phone" src="docs/images/hero-phone-light.png#gh-light-mode-only" width="280">
  <img alt="The same answer on a phone" src="docs/images/hero-phone-dark.png#gh-dark-mode-only" width="280">
</p>

A chat assistant for two people playing Arkham Horror: The Card Game campaigns together. It
answers from the real sources at the moment you ask: the full Rules Reference, ArkhamDB's card
text with errata, official rulings and taboo changes, and any ArkhamDB deck together with its
author's guide. To recommend decks it keeps a small index of its own: the ten most liked
published decks for every investigator the players own, each labeled with a role, archetypes and
a summary from its list and guide. Claude wrote the labels during development, one investigator
at a time from generated label sheets, and they were checked against the decks' card tallies.

| You ask | Answered by |
|---|---|
| A rules question | the whole Rules Reference, inlined in the cached system prompt |
| What a card does | `cards`: every level and printing together, with errata and rulings |
| How to run this deck | `deck`: the decoded list and the author's guide, read live |
| What can I play instead of this card | `replaceCard`: legal, owned substitutes, with how often each is played |
| Find me a deck | `recommendDecks`: by class, role, archetype, tag, XP, investigator or key card |
| Find me a partner for this deck | `recommendDecks` with `pairWith`: the roles that fill the gap, never the same investigator |

Everything it recommends can be built from the players' collection, and it never ranks a deck
lower for its XP. The taboo list is a switch in the UI: off means no taboo change is applied or
mentioned anywhere; on means the current list applies to card text, XP and deckbuilding.

## Run it

```sh
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY or OPENAI_API_KEY
npm run dev                  # http://localhost:3000
```

`ARKHAM_MODEL` picks the model as `provider:model` (default `openai:gpt-6-sol`, or
`anthropic:claude-opus-5-5` when only an Anthropic key is set). `ARKHAM_MODEL=mock:local` needs no key:
a scripted stand-in that routes each question to one tool, so the loop, the tools and the UI
can be exercised end to end for free.

The first request loads ArkhamDB's full card set (about 9 MB) and keeps it for a day, on disk
under `data/cache/` in development.

## Check it

```sh
npm run check   # typecheck, lint (Biome) and tests
npm run build
npm run e2e     # the built app in a browser, desktop and phone, on the scripted model
```

The tests are hermetic. They read the card set, taboo lists and decklists the index was built
from (`tests/fixtures/`), never the network, and CI runs the same steps on every push to `main`
and every pull request. They check behavior against known answers rather than prose: every
level of a card comes back together, a card that is not in a deck is refused, every replacement
is legal and owned, every indexed list passes the legality check under its own taboo list, the
index's XP matches the deck tool's, and the prompt is pinned (the guidance and every tool
definition byte for byte, the whole system prompt with the Rules Reference by hash), because
changing any of it is a prompt change. The end-to-end tests (Playwright) run the built app on
the scripted model and the fixture card set, so they need no key and no network either.

## Evaluate it

The evals run the product's use cases (`evals/cases.ts`) against a real model, with a dollar
cap, and write each transcript to `evals/results/` (git-ignored) to be read by a person. They
grade nothing. The script reads keys from the environment, so load `.env.local` first:

```sh
set -a && . ./.env.local && set +a
npm run eval -- --model openai:gpt-6-sol --max-usd 2 [--cases rules-doom,partner]
```

## Documentation

| You want | Read |
|---|---|
| How it works, end to end | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Why it is built this way, and what was rejected | [docs/design-decisions.md](docs/design-decisions.md) |
| How the deck index is made, and how to refresh any data | [docs/data-pipeline.md](docs/data-pipeline.md) |
| How it got here: every version, what was measured, what was thrown away | [docs/design-log.md](docs/design-log.md) |
| How the answers were checked, per model, and what that changed | [docs/evals.md](docs/evals.md) |
| How to deploy it, and who can open it | [docs/deploying.md](docs/deploying.md) |
| What an archetype means here, and each one's definition | [docs/archetypes.md](docs/archetypes.md) |
| To change the code | [AGENTS.md](AGENTS.md) for the invariants, then the two docs above |

Source wins over any doc, and the docs describe the present. An earlier version, a static pair
finder with a Python pipeline, was retired; [design-decisions.md](docs/design-decisions.md#reversals)
says what it taught and why it went.

## Layout

```
app/                     the chat page; /api/chat runs the agent loop
components/tools/        how each tool's result renders in the thread, one file per tool
components/settings/     the taboo switch
components/assistant-ui/ the thread, thread list and tool card, from the assistant-ui registry, adapted
components/ui/           shadcn primitives, vendored from the shadcn registry (excluded from Biome)
hooks/                   client hooks: the players' settings, the chat's name, media queries
lib/agent.ts             the loop: budgets, the reserved answer step, cache markers
lib/history.ts           how much of a conversation goes to the model (browser and server)
lib/model.ts             picks the provider and model from ARKHAM_MODEL or the key that is set
lib/prompt.ts            the system prompt, with data/rules.md inlined
lib/tools/               cards, deck, recommendDecks, replaceCard
lib/legality.ts          ArkhamDB deckbuilding rules, evaluated the way ArkhamDB does
lib/index/               the deck index and card play rates the tools read
pipeline/                offline: crawl ArkhamDB, build the index, scrape rules and rulings
data/deck-labels/        the role, archetypes and summary of every indexed deck
tests/                   known answers, the legality oracle, the loop, pinned prompts
evals/                   the use cases, run against a real model and read by a person
```

## Credits

This is an unofficial fan project. It is not affiliated with or endorsed by Fantasy Flight
Games or ArkhamDB.

- Arkham Horror: The Card Game, its card text, the Rules Reference (`data/rules.md`) and the
  official FAQ rulings (`data/faq.json`) are © Fantasy Flight Games.
- Card data, taboo lists, rulings and decklists come from [ArkhamDB](https://arkhamdb.com), a
  volunteer-run community site. The pipeline asks it for one page a second.
- Deck guides, and the decks themselves, belong to their authors on ArkhamDB. The assistant
  reads them live and links back to them.

## License

The code is under the [MIT License](LICENSE). The license does not cover the third-party
material above: `data/rules.md`, `data/faq.json`, the deck index in `lib/index/` (built from
public decklists) and the ArkhamDB snapshots in `tests/fixtures/`.
