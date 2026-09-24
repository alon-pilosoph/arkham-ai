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
counts and cost. It grades nothing, but three checks run automatically on every transcript,
besides someone reading it: no linked card code may be missing from that turn's own tool
results, the taboo list must never come up when it is off, and no answer may be empty. The
first check is a policy signal, not a correctness one, and the two are not the same thing — see
"A code can be right without being earned" below.

## Results, 2026-09-23

All four models on the code at the time, at their pinned effort, one run each:

| Model | Cost, 24 cases | Median time | Card links | Invented card codes | Errors found by reading |
|---|---|---|---|---|---|
| Claude Opus 5.5 | $3.95 | 17 s | 183 | 0 | none |
| GPT-6 Sol | $1.37 | 22 s | 68 | 0 | answered a Marvel Champions question partly from memory |
| Claude Sonnet 5 | $3.68 | 11 s | 136 | 4 | a card's level, a card named that is only in the guide, a taboo mention with the list off |
| GPT-6 Luna | $0.08 | 85 s | 68 | 0 | none |

- **Opus 5.5 looked like the obvious default.** Every claim checked out, including two that
  looked wrong and were right word for word (where Archive of Conduits' leylines come from;
  that a level 0 card bought mid-campaign still costs 1 XP). It declined the Marvel Champions
  question and pointed to MarvelCDB.
- **Sol was accurate and concise**, and caught that one list's 3 XP depends on a card its guide
  names but its list leaves out.
- **Sonnet invented card codes.** Three distinct links pointed at the wrong cards, which the
  prompt forbids.
- **Luna was cheap and careful but slow**, its median inflated by the account's
  200,000-tokens-per-minute limit: every call carries the system prompt (about 52,000 tokens in
  OpenAI's count), and cached tokens still count toward OpenAI's limit.

Effort was pinned per provider (`lib/model.ts`) at each provider's documented default, so a
provider changing its default cannot silently change the answers or make these numbers
incomparable.

## The full effort matrix, 2026-09-24

Sonnet's invented codes and Luna's speed both looked like they might be a matter of degree, not
kind, so every model that showed a problem was re-run at other effort levels (`--effort`), and a
fifth model — `gpt-5.6-luna`, the previous generation, still available and with a higher account
rate limit (500,000 tokens/minute against Luna's 200,000) — was run at every level for
comparison:

| Model / effort | Cost, 24 cases | Median time | Failures |
|---|---|---|---|
| Sonnet 5 @ max | $6.72 | 43 s | clean |
| GPT-6 Luna @ low | $0.06 | 67 s | invented codes on 1 case |
| GPT-6 Luna @ high | $0.10 | 104 s | clean |
| GPT-6 Luna @ max | $0.12 | 105 s | **4 of 24 cases (17%) hit the 270 s deadline and never answered** |
| GPT-5.6 Luna (default) | $0.13 | 25 s | invented codes and a taboo-off mention, 2 cases |
| GPT-5.6 Luna @ low | $0.11 | 20 s | invented codes on 3 cases, including one with **no tool call at all** |
| GPT-5.6 Luna @ high | $0.18 | 25 s | 1 flagged, but the code was actually right (see below) |
| GPT-5.6 Luna @ max | $0.22 | 37 s | 1 timeout on a 27-tool-call turn |

- **Raising Sonnet's effort to max fixed every failure**, at about 1.8x the default cost — not
  the roughly 3x a single spot check first suggested.
- **Raising Luna's effort past its own default is a net loss.** High effort is clean but slower
  than default; max effort makes it call `cards` redundantly (21 calls to answer one deck
  question) until a sixth of all cases time out. Default effort turns out to already be Luna's
  sweet spot; there was nothing to fix by raising it.
- **A repeat check found the invented-code failure recurs, not a fluke.** Sonnet at default
  effort was run three more times on its three original failing cases: two of the three repeats
  invented a code, a *different* one each time. It is a general failure mode of this effort
  level, not something tied to those specific questions.
- **GPT-5.6 Luna is strictly worse than GPT-6 Luna here.** Pricier per token at every effort
  level, no faster in practice despite its higher rate limit, and less reliable everywhere —
  including the only case in this whole matrix where a model invented a card without calling a
  single tool. Its higher rate limit never translated into a real speed advantage at this
  volume. There is no case for using it.

### A code can be right without being earned

One of GPT-5.6 Luna's flagged failures, on closer look, was not a wrong link: it named `Crafty`
as `08123` and `Divination` as `08103` without a tool call that turn, and both codes are
correct. The runner's check still flags this, on purpose — it tests whether the model followed
the rule ("the code must come from a tool result this turn"), not whether the link happens to be
right, because the same shortcut produced 17 wrong links everywhere else it was tried. Getting
lucky once does not make the shortcut safe.

That distinction — a rule about where a code came from, versus a fact about whether it's right —
is why the fix below checks the fact directly instead of only tightening the rule.

## The fix: a card link is checked against the real card data, not just asked to be right

17 of the 18 invented codes across every model and effort level in this matrix turned out to be
*real, valid* ArkhamDB codes — just attached to the wrong card. Only one was a pure fabrication.
That rules out "does this code exist" as a check (it would pass 17 of 18 broken links) and rules
out asking ArkhamDB at answer time (the full card set is already cached in the app; a network
call would be slower and add a dependency for no reason).

`lib/link-repair.ts` instead checks every `[Name](arkhamdb.com/card/CODE)` in the final answer
against the cached card set: if the code's real name doesn't match, it looks the name up and
swaps in the correct code when exactly one card matches, or strips the link to plain text
otherwise — the same fallback the prompt already asks for when no tool gave a code. `lib/agent.ts`
wires it in as a `streamText` transform that buffers only the answer's current text block, so
tool-call progress still streams live and only the final prose appears whole instead of
character by character.

The prompt was also tightened (`lib/prompt.ts`): linking a card now says explicitly to copy the
code from a tool result in this conversation, not recall it. Re-running Sonnet's three original
failing cases after both changes landed found every card link correct, checked by hand against
the real card data, not just by the runner.

Because the check runs on the answer text itself, it is a backstop for every model and every
effort level, not a fix aimed at Luna specifically — Sonnet's failures are covered by exactly
the same mechanism.

## The move to GPT-6 Sol

Opus was the pick in the first pass, on correctness alone. Cost was the deciding factor once
correctness stopped being the differentiator (the link-repair backstop covers every model, and
Sol never showed a real gameplay error): Sol is 65% cheaper than Opus per 24-case run, just as
fast, and there is a second, structural reason it is cheaper for this app specifically. Anthropic
charges roughly double its normal input price to *write* the ~65,000-token system prompt into
cache on a request after the cache has gone cold (measured directly: the first case in a fresh
run cost $0.48 of a $0.48 total, almost all of it that one write); every later request in the
same hour reads it back for a few cents. Two people asking occasional questions, not chatting
continuously, mean most real requests are cold starts — so the premium that a bench of
back-to-back eval cases barely notices is paid on close to every real question. OpenAI's caching
carries no such premium. `lib/model.ts` now prefers OpenAI over Anthropic when both keys are
set, so Sol is the default rather than a fallback.

GPT-6 Luna remains an option for anyone who wants to go further on cost, with eyes open about the
tradeoff: it is now correctness-clean at its own default effort, but its account's 200,000
tokens/minute limit will still make deck, replacement and partner questions — the actual core of
what this app answers — take over a minute in real use, not only in a tight eval loop. That is
not something effort or prompt changes fix; it is the account's rate limit against how many
sequential tool calls those questions need.

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
  when it is off; name a card with no code from a tool plainly instead of in bare brackets; copy
  a linked code from a tool result this turn rather than recall it.
- **Game symbols render.** Models copy ArkhamDB's `[elder_sign]` tokens into answers; the chat
  now draws them as the same keycaps the tool results use.
- **A cut-off answer says so.** An answer stopped at the deadline used to end with no text; it
  now shows "This answer ran out of time."
- **A wrong card link is corrected, not just discouraged.** See "The fix" above.
- **The default model changed.** See "The move to GPT-6 Sol" above.
- **The runner itself.** Running Luna first, because it is cheap, found that a failed stream
  crashed the run and that pacing per turn could not see earlier calls. Both were fixed before
  the expensive models ran. Later, the runner's own three checks (card links, taboo, empty
  answers) were turned from something read by hand into assertions that run on every transcript.

## Running them

```sh
set -a && . ./.env.local && set +a
npm run eval -- --model openai:gpt-6-sol --max-usd 2
npm run eval -- --model openai:gpt-6-luna --max-usd 1 --tpm 150000   # paced to a rate limit
npm run eval -- --model anthropic:claude-sonnet-5 --effort max --cases partner,deck-how
```

Transcripts go to `evals/results/<model>[@effort]/`, which git ignores: they hold full tool
output and are meant to be read, not kept.
