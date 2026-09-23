# Evals

The assistant is only useful if it is right, so its answers were checked the slow way: every
transcript was read by a person, and every claim in it was checked against the card data, the
official rulings and the Rules Reference. No model graded another model.

## Method

`evals/cases.ts` holds 24 cases, each a question the assistant exists to answer and a note on
what a right answer must contain:

| Kind | Cases |
|---|---|
| Rules | doom and the agenda threshold; attacks of opportunity from an event; a rule that depends on a card (Ward of Protection is Fast) |
| Cards | every level of one card; the taboo list on and off; an unowned card; deckbuilding (can Roland take Shrivelling); comparing two weapons |
| Decks | how to play a deck; its XP with the taboo list on and off; a private or missing deck |
| Replacements | a cheaper card; a card that is not in the deck; a stand-in for an unowned card; spending 5 XP legally |
| Finding decks | by class and role, by archetype, by key card under an XP cap |
| Partners | a partner for a deck, and a follow-up when the other player switches decks |
| Follow-ups and scope | a second question in the same conversation (the earlier tool results are not in the history, so the deck must be read again); a question about another game |

`npm run eval` runs every case through the real agent loop, tools and system prompt, and writes
one transcript per case: the answer, every tool call with the text the model got back, token
counts and cost. It grades nothing. Three checks ran over every transcript besides reading it:
every card link must use a code a tool returned, the taboo list must never come up when it is
off, and no answer may be empty.

## Results

All four models on the final code, at their default effort, 2026-09-23:

| Model | Cost, 24 cases | Median time | Card links | Invented card codes | Errors found by reading |
|---|---|---|---|---|---|
| Claude Opus 5.5 | $3.95 | 16 s | 183 | 0 | none |
| GPT-6 Sol | $1.37 | 18 s | 68 | 0 | answered a Marvel Champions question partly from memory |
| Claude Sonnet 5 | $3.68 | 11 s | 136 | 4 | a card's level, a card named that is only in the guide, a taboo mention with the list off |
| GPT-6 Luna | $0.08 | 76 s | 68 | 0 | none |

- **Opus 5.5 is the default.** Every claim checked out, including two that looked wrong and
  were right word for word (where Archive of Conduits' leylines come from; that a level 0 card
  bought mid-campaign still costs 1 XP). It declined the Marvel Champions question and pointed
  to MarvelCDB.
- **Sol is the OpenAI default.** Accurate and concise, and it caught that one list's 3 XP
  depends on a card its guide names but its list leaves out.
- **Sonnet invented card codes.** Three distinct links pointed at the wrong cards, which the
  prompt forbids. At maximum effort it made none of its earlier errors, but cost about three
  times as much per answer and one answer ran out of time.
- **Luna is cheap and careful but slow here.** Its median includes waiting on the account's
  200,000 tokens-per-minute limit: every model call carries the system prompt (about 52,000
  tokens in OpenAI's count), and cached tokens still count toward OpenAI's limit. At maximum
  effort a third of its answers ran out of time.

Effort is pinned per provider (`lib/model.ts`) at the documented default, so a provider
changing its default cannot silently change the answers or make these numbers incomparable.

## What the evals changed

Each of these was found by reading a transcript:

- **Rulings travel with cards.** Opus once said Archive of Conduits' leylines come from your own
  resources and that bless tokens trigger a card that needs a +1, 0 or elder sign. Deck lists
  now mark every card with official rulings (`[FAQ]`), and `replaceCard` includes the replaced
  card's rulings. The re-run was right.
- **OpenAI tools are not strict.** OpenAI's Responses API makes function tools strict by
  default, which forces every optional field; Sol filled in every filter and every search came
  back empty. An OpenAI-only middleware turns strict off.
- **Deckbuilding choices are shown.** Luna had to guess a deck's secondary class, because the
  deck tool never showed it although the legality check reads it. The deck tool now names each
  choice ("Secondary Class: seeker").
- **Prompt wording.** Say when a card is not in the collection; never bring up the taboo list
  when it is off; name a card with no code from a tool plainly instead of in bare brackets.
- **Game symbols render.** Models copy ArkhamDB's `[elder_sign]` tokens into answers; the chat
  now draws them as the same keycaps the tool results use.
- **A cut-off answer says so.** An answer stopped at the deadline used to end with no text; it
  now shows "This answer ran out of time."
- **The runner itself.** Running Luna first, because it is cheap, found that a failed stream
  crashed the run and that pacing per turn could not see earlier calls. Both were fixed before
  the expensive models ran.

## Running them

```sh
set -a && . ./.env.local && set +a
npm run eval -- --model anthropic:claude-opus-5-5 --max-usd 5
npm run eval -- --model openai:gpt-6-luna --max-usd 1 --tpm 150000   # paced to a rate limit
npm run eval -- --model anthropic:claude-sonnet-5 --effort max --cases partner,deck-how
```

Transcripts go to `evals/results/<model>/`, which git ignores: they hold full tool output and
are meant to be read, not kept.
