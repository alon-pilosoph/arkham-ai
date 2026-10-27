# Evals

The assistant is only useful if its answers are right, so they were checked by hand: a person
read every transcript and checked every claim in it against the card data, the official rulings
and the Rules Reference. No model graded another model's answers.

## Method

`evals/cases.ts` holds 24 cases. Each is a question the assistant exists to answer, with a note on
what a right answer must contain:

| Kind | Cases |
|---|---|
| Rules | Doom and the agenda's doom threshold; attacks of opportunity from an event; a rule that depends on a card (Ward of Protection is Fast) |
| Cards | Every level of one card; the taboo list on and off; an unowned card; deckbuilding (can Roland take Shrivelling?); comparing two weapons |
| Decks | How to play a deck; its XP with the taboo list on and off; a private or missing deck |
| Replacements | A cheaper card; a card that is not in the deck; a stand-in for an unowned card; spending 5 XP legally |
| Finding decks | By class and role, by archetype, by key card under an XP cap |
| Partners | A partner for a deck, and a follow-up when the other player switches decks |
| Follow-ups and scope | A second question in the same conversation (earlier tool results are not kept in the history, so the deck must be read again); a question about another game |

`npm run eval` runs every case through the real agent loop, tools and system prompt, and writes
one transcript per case: the answer, every tool call with the text the model got back, token
counts and cost. It does not grade answers. It does run four automatic checks on every turn,
flags any failure in its output, and exits with an error if one failed:

1. Every card code linked in the answer appears in that turn's own tool results.
2. The taboo list is never mentioned when it is off.
3. No deck is called by its number ("deck 33170"); a link's URL doesn't count.
4. The answer is not empty.

The first check tests whether the model followed the rule about where a card code comes from, not
whether the link is correct. The two are different, as
[a code can be right without being earned](#a-code-can-be-right-without-being-earned) explains.

## Results, 2026-09-23

All four models, on the code as it was that day, at their pinned effort level, one run each:

| Model | Cost, 24 cases | Median time per case | Card links | Invented card codes | Errors found by reading |
|---|---|---|---|---|---|
| Claude Opus 5.5 | $3.95 | 17 s | 183 | 0 | None |
| GPT-6 Sol | $1.37 | 22 s | 68 | 0 | Answered a Marvel Champions question partly from memory |
| Claude Sonnet 5 | $3.68 | 11 s | 136 | 4 | A card's level; a card named that is only in the guide, not the list; a taboo mention with the list off |
| GPT-6 Luna | $0.08 | 85 s | 68 | 0 | None |

- **Opus 5.5 looked like the obvious default.** Every claim checked out, including two that
  looked wrong and were right word for word: where Archive of Conduits' leylines come from, and
  that a level 0 card bought mid-campaign still costs 1 XP. It declined the Marvel Champions
  question and pointed to MarvelCDB.
- **Sol was accurate and concise.** It also noticed that one list's 3 XP depends on a card its
  guide names but its list leaves out.
- **Sonnet invented card codes.** Three distinct links pointed at the wrong cards, which the
  prompt forbids.
- **Luna was cheap and careful but slow.** Its median time was inflated by the account's rate
  limit of 200,000 tokens per minute: every call carries the system prompt (about 52,000 tokens by
  OpenAI's count), and cached tokens still count toward OpenAI's limit.

Reasoning effort is pinned per provider in `lib/model.ts` (`high` for Anthropic, `medium` for
OpenAI, each provider's documented default at the time), so a provider changing its default
cannot silently change the answers or make these numbers incomparable.

## Other effort levels, 2026-09-24

Sonnet's invented codes and Luna's speed both looked as if they might depend on the effort level.
So every model that showed a problem was run again at other effort levels (`--effort`). A fifth
model, `gpt-5.6-luna`, was also run at every level for comparison: it is the previous generation,
still available, and has a higher rate limit on the account (500,000 tokens per minute, against
GPT-6 Luna's 200,000).

| Model and effort | Cost, 24 cases | Median time per case | Failures |
|---|---|---|---|
| Sonnet 5, max | $6.72 | 43 s | None |
| GPT-6 Luna, low | $0.06 | 67 s | Invented codes in 1 case |
| GPT-6 Luna, high | $0.10 | 104 s | None |
| GPT-6 Luna, max | $0.12 | 105 s | **4 of 24 cases (17%) hit the 270 s deadline and never answered** |
| GPT-5.6 Luna, default | $0.13 | 25 s | Invented codes and a taboo mention with the list off, in 2 cases |
| GPT-5.6 Luna, low | $0.11 | 20 s | Invented codes in 3 cases, one of them with **no tool call at all** |
| GPT-5.6 Luna, high | $0.18 | 25 s | 1 case flagged, but the code was right (see below) |
| GPT-5.6 Luna, max | $0.22 | 37 s | 1 timeout, on a turn with 27 tool calls |

- **Maximum effort fixed every Sonnet failure**, at about 1.8 times the default cost, not the
  roughly 3 times a single spot check had first suggested.
- **Raising Luna's effort above its default is a net loss.** At high effort it is clean but
  slower than at its default. At max effort it calls `cards` redundantly (21 calls to answer one
  deck question) until a sixth of all cases time out. Its default effort is already its best
  setting.
- **Sonnet's invented codes recur; they were not a fluke.** Sonnet at default effort was run three
  more times on its three original failing cases. Two of the three repeats invented a code, a
  different one each time, so this is a general failure at that effort level, not something tied
  to particular questions.
- **GPT-5.6 Luna is not worth using over GPT-6 Luna.** Its higher rate limit does make it
  faster, but it costs more per token at every effort level. At its default effort, where GPT-6
  Luna is clean, it failed 2 cases, and at low effort it produced the only case in the whole
  matrix where a model invented a card code without calling a single tool.

### A code can be right without being earned

One of GPT-5.6 Luna's flagged failures turned out, on closer inspection, not to be a wrong link.
It linked Crafty as `08123` and Divination as `08103` without any tool call in that turn, and both
codes are correct. The runner still flags this, on purpose. The check tests whether the model
followed the rule that a code must come from a tool result in this turn, not whether the link
happens to be right, because the same shortcut produced 17 wrong links everywhere else it was
tried. Getting lucky once does not make the shortcut safe.

That difference, between a rule about where a code came from and a fact about whether it is
right, is why the fix below checks the fact directly instead of only tightening the rule.

## The fix: checking card links against the card data

Of the 18 invented codes across every model and effort level above, 17 turned out to be real,
valid ArkhamDB codes attached to the wrong card; only one did not exist at all. That rules out
checking whether a code exists, which would pass 17 of the 18 bad links. It also rules out asking
ArkhamDB while answering: the full card set is already cached in the app, and a network call
would be slower and add a dependency for no benefit.

Instead, `lib/link-repair.ts` checks every `[Name](https://arkhamdb.com/card/CODE)` link in the
answer against the cached card set. If the card with that code has a different name, it looks the
name up: when exactly one card matches, it swaps in that card's code; otherwise it reduces the link
to plain text, which is also what the prompt asks for when no tool supplied a code. `lib/agent.ts`
applies it as a `streamText` transform that buffers only the current text block of the answer.
Tool-call progress still streams live, but each block of answer text now appears whole instead
of token by token, and a block cut off by the deadline is dropped rather than shown half written.

The prompt was also tightened (`lib/prompt.ts`): it now says to copy a linked card's code from a
tool result in this conversation, not to recall it. After both changes, Sonnet's three original
failing cases were run again, and every card link was correct, checked by hand against the card
data and not only by the runner.

Because the check runs on the answer text itself, it covers every model and every effort level,
Sonnet and Luna alike.

## The move to GPT-6 Sol

In the first round of results, Opus was the choice, on correctness alone. Once correctness
stopped distinguishing the models (the link repair covers every model, and Sol never made a real
gameplay error), cost decided. Sol is 65% cheaper than Opus per 24-case run and about as fast.

There is also a structural reason Sol is cheaper for this app in particular. When Anthropic's
cache has gone cold, it charges roughly twice its normal input price to write the system prompt,
about 65,000 tokens, into the cache. This was measured directly: the first case in a fresh run
cost $0.48, almost all of it that one write. Every later request in the same hour reads the
prompt back for a few cents. Two people asking occasional questions, rather than chatting
continuously, means most real requests find the cache cold. So a premium that a run of
back-to-back eval cases barely notices is paid on nearly every real question. OpenAI's caching
has no such premium. `lib/model.ts` therefore prefers OpenAI when both keys are set, which makes
Sol the default rather than a fallback.

GPT-6 Luna remains an option for anyone who wants to cut cost further, with the tradeoff in view.
It is now free of errors at its default effort, but the account's 200,000 tokens-per-minute limit
still makes deck, replacement and partner questions, which are most of what this app answers,
take over a minute in real use, not only in a tight eval loop. Effort and prompt changes cannot
fix that: it comes from the rate limit and the number of sequential tool calls those questions
need.

## What the evals changed

Each of these was found by reading a transcript:

- **Rulings travel with cards.** Opus once said that Archive of Conduits' leylines come from your
  own resources, and that bless tokens trigger a card that needs a +1, 0 or Elder Sign. Deck lists
  now mark every card that has official rulings with `[FAQ]`, and `replaceCard` includes the
  replaced card's rulings. The rerun was right.
- **OpenAI tools are not strict.** OpenAI's Responses API makes function tools strict by default,
  which forces the model to fill in every optional field; Sol set every filter, and every search
  came back empty. An OpenAI-only middleware now turns strict mode off.
- **Deckbuilding choices are shown.** Luna had to guess a deck's secondary class, because the
  deck tool never showed it, even though the legality check reads it. The deck tool now names
  each choice ("Secondary Class: seeker").
- **Prompt wording.** Say when a card is not in the collection; never bring up the taboo list
  when it is off; name a card that no tool supplied a code for in plain text, not in bare
  brackets; copy a linked card's code from a tool result rather than recall it.
- **Game symbols render.** Models copy ArkhamDB's symbol tokens, such as `[elder_sign]`, into
  their answers; the chat now draws them as the same keycaps the tool results use.
- **A cut-off answer says so.** An answer stopped at the deadline used to end with no text; it
  now ends with "This answer ran out of time. Try again, or ask a narrower question."
- **A wrong card link is corrected, not just discouraged.** See
  [the fix](#the-fix-checking-card-links-against-the-card-data) above.
- **The default model changed.** See [the move to GPT-6 Sol](#the-move-to-gpt-6-sol) above.
- **The runner itself.** Running Luna first, because it is cheap, showed that a failed stream
  crashed the whole run and that pacing each turn separately could not see earlier calls. Both
  were fixed before the expensive models ran. Later, the three checks (card links, taboo
  mentions, empty answers), which had been done by reading, became automatic checks on every
  transcript.

## Running the evals

The runner reads API keys from the environment, so load `.env.local` first. Each run costs real
money; `--max-usd` stops it before the next case once spending reaches the cap (default $1).

```sh
set -a && . ./.env.local && set +a     # load the API keys

npm run eval -- --model openai:gpt-6-sol --max-usd 2

# pace calls to stay under a tokens-per-minute rate limit
npm run eval -- --model openai:gpt-6-luna --max-usd 1 --tpm 150000

# one effort level, selected cases only
npm run eval -- --model anthropic:claude-sonnet-5 --effort max \
  --cases partner,deck-how
```

`--model` must be one of the models priced in `evals/run.ts`. Transcripts are written to
`evals/results/<provider>_<model>[@<effort>]/`, for example `evals/results/openai_gpt-6-sol/`.
Git ignores that directory: the transcripts hold full tool output and are meant to be read, not
kept.
