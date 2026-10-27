# Design log

This is how the project reached its current design, in order: what was built, what was
measured, and what was thrown away as a result. [design-decisions.md](design-decisions.md)
explains the design as it stands. This log records the path to it, dead ends included, because
the deleted designs were the expensive part.

The project serves one table: two players running Arkham Horror: The Card Game campaigns
together, from a fixed collection. Three constraints held through every version: the
collection is every release before the 2026 reissue; missing duplicates are proxied, so copy
counts never matter; and XP is reported, never penalized.

## v1: an LLM deckbuilder (June 2026)

**Built:** a full pipeline from ArkhamDB data to finished decks: a card pool, a deck validator,
an LLM builder, synergy and archetype detection, functional card profiles, substitutes, a rules
judge and combo discovery.

**Abandoned, because:**
- Bulk harvesting decklists by date produced mostly junk to learn from.
- Labeling card functions with a cheap model was wrong 73% of the time.
- Parsing card text with regular expressions was too brittle for the game's wording.

The repository was deleted before it had a single commit. The lesson that stuck: commit early.

## v2: a deck-pair finder (September 13 to 18)

**The question it answered:** which two published decks the two players should bring. It
harvested decks the collection could build, labeled 1,333 of them, scored pairs of decks, and
shipped as a static web app.

**Decisions that survived into v3:**
- **The collection boundary.** "Chapter 1" was first read as the first two boxes. It means
  every release before the 2026 reissue, and misreading it cost a full harvest and labeling
  pass. Ask what a boundary means before filtering on it.
- **XP is information.** An early score penalized XP and silently buried good decks. The
  requirement was to show XP, not punish it.
- **The deck is the unit, not the investigator.** Aggregating to investigator pairs was
  measured and rejected: within one investigator pair, the deck chosen swings the score by a
  median 0.258, while the whole top 20 spans about 0.04; ranking by best or by median deck pair
  agreed on only 7 of 20. "Zoey and Rex are good together" means little without naming decks.
- **Ground truth has to be clean.** Deck-level evidence from guide links looked plentiful (196
  links) but held only 8 real duos; the rest were an author's own series. Investigator-level
  recommendations (77 cases) were the usable signal.

**The manual review that changed everything after it.** All 225 top pair write-ups were
checked against card text by hand, and 102 needed a correction. Every error was about a single
card: a card credited with an effect it only has for its owner, the wrong printing's level, a
dropped once-per-round limit. Reasons that rest on one card break when a list changes one slot.
v3 reasons from roles, archetypes, investigator abilities and signature cards, and uses card
text to check its claims.

**ArkhamDB traps found on the way:**
- Its `packs[]` search filter silently drops decks the collection can build, so decks are
  harvested unfiltered and filtered locally.
- `xp_spent` is the last upgrade step, not the XP a list needs; XP is summed from card levels.
- Only `90xxx` codes are parallel investigators; the `alternate_front` fields are also set on
  plain reprints.
- Labels overstate what helps a partner: 79% of decks labeled as cancelling treacheries could
  only cancel their own. A claim about helping a partner is checked against card text.

## The pivot to a chat assistant (September 19 to 22)

The questions the players actually asked were broader than "which pair": what a rule means,
what a card does at each level, how to play a deck, what to play instead of a card. The v2 data
could not answer those, and much of it was derived facts stored on records. The pivot took
nine rounds of designing something and then deleting it. The deletions share one idea: stop
storing something derived from the sources, and compute it from the sources when asked.

**Rejected, in the order it happened:**
- **Reviewing pairs.** The v2 quality layer reviewed 231 pairs, which involve only 178
  distinct decks. Reviewing those 178 decks instead makes 15,753 pairs scoreable, 68 times the
  coverage. Review the decks, and compute the pairs.
- **Pair-level facts.** 73% of v2's pair flags were single-deck statements filed onto a pair
  and repeated on every pair that deck touched. The rest were derivable from two deck records.
- **A readiness tier.** Ranking "good and ready for scenario 1" first reintroduced an XP
  penalty through the back door, after the score had correctly stopped weighting XP.
- **Retrieval over the rules.** The Rules Reference is one page of about 39,500 words under
  285 headings, averaging under 140 words each. That is a dictionary, not a corpus: similarity
  search over a dictionary is worse than looking the entry up, and it adds chunking, embeddings
  and the risk of retrieving the wrong entry.
- **A rules lookup tool.** Designed as the replacement, then deleted. A cached system prompt
  beats a lookup round trip and removes "the search found nothing" as a failure. The whole Rules
  Reference, about 65,000 tokens, went into the cached prefix, and there is no rules tool.
- **A runtime answer checker.** Checking claims per request is unnecessary once the data it
  reads is right; check at build time instead.
- **Two services and a protocol bridge.** A Python API behind a separate web front end
  collapsed into one Next.js app, with the pipeline demoted to offline scripts.

**What survived:** four tools (`cards`, `deck`, `recommendDecks`, `replaceCard`), decks and
guides read live, and one stored artifact: a small index with a row per liked, buildable deck,
used only to make a shortlist before reading the decks. Hand-written deck reviews were built
for three decks and rejected: they restated the guides, and the restating produced a
misreading.

**Patterns carried over from earlier production agent work:** prompt caching that depends on
keeping the prompt's bytes identical, with a cache breakpoint that moves to the newest message;
errors never
presented as absence; budgets enforced in code, with the last step reserved for the answer;
tool definitions pinned by golden tests, because a tool description is prompt text; past tool
results not replayed into history; and untrusted text wrapped as data before it reaches the
model.

## Building v3 (September 22 and 23)

- **The index is a census, not a likes walk.** ArkhamDB's popularity ordering has unstable
  ties, so the crawl walks all 38,984 published decklists by date and cross-checks against the
  likes order (every deck with 10 or more likes is present). It keeps the ten most liked decks
  the collection can legally build for each of 66 owned investigators: 660 decks.
- **Labels were written by reading.** Claude labeled all 660 during development (role,
  secondary role, up to three archetypes, a one-line summary) from generated sheets of each
  deck's list and guide, five decks a page, then checked them against counts of mechanics in
  the decks' card text.
- **Published decks are the reference for legality.** Every published deck passed ArkhamDB's
  validator, so replaying every indexed deck through the new legality check (a port of that
  validator) exposed its gaps: Versatile's extra off-class cards; a customizable card's level
  being half its marked boxes, rounded up; copies splitting across two limited options; and
  ArkhamDB's validator, not the printed card, deciding Versatile's limit. The check follows the
  validator.
- **The taboo list is a switch, and it is absolute.** Taboo lists rewrite card text (Rex
  Murphy gains "Limit once per round", exactly the kind of error the v2 manual review kept
  finding),
  add XP, flip Exceptional and replace deckbuilding options. Off means no taboo change is
  applied or mentioned anywhere; on means the current list applies to everything.
- **Test the request that is actually sent.** The AI SDK's Anthropic provider implements "no
  tools" by deleting the tool list, which breaks the prompt cache (tools are the first cached
  bytes) and makes Anthropic reject a history with tool calls in it. A test against the mock
  model could not catch this; a fake `fetch` that captured the real request body did. A
  middleware now keeps the tools and sends Anthropic's own `tool_choice: {type: "none"}`.
- **Tests are hermetic.** A 24-hour card cache made tests pass on one day and fetch live data
  the next. The index build snapshots its own card set, taboo lists and decks into fixtures,
  and the tests read those.
- **Scraping traps.** ArkhamDB's FAQ is paged by path, but its pager only links ten pages, so
  the scraper keeps going until a page adds nothing new (949 cards with rulings). A regex meant
  to clean up emphasis stripped every bold span from the rules; the converter now skips empty
  emphasis tags where they appear.
  A spec-compliant HTML parser repaired the rules page's malformed markup into different
  paragraphs; a forgiving parser keeps the author's structure.

## The interface (September 23)

- **Library components, not custom styling.** The chat is assistant-ui on shadcn/ui (base-ui
  primitives), and each tool result is the library's tool card: running, done, stopped or
  failed, with the result inside. Custom CSS was replaced with library components wherever one
  existed.
- **Reviewed from screenshots.** A script drove the real interface, running on the mock model
  (`ARKHAM_MODEL=mock:local`, which needs no API key), through 37 states in light and dark mode,
  on desktop and phone, and reviewers critiqued the screenshots over several rounds. Fixes
  ranged from alignment to real bugs: a pasted file silently sent to the model, the keyboard
  opening on a phone, a card name wrapping away from its quantity.
- **Choices made from rendered options, not descriptions.** The welcome suggestions were built
  four ways and screenshotted side by side before one was picked.
- **Chats persist without accounts.** Assistant Cloud keeps each browser's chats, with
  generated titles, anonymously. The header and the sidebar name a chat by its first question
  until the title arrives.
- **Answers link cards.** The model links a card to ArkhamDB the first time it names it, using
  only a code a tool returned, never one from memory.

## Evals and model choice (September 23)

Twenty-four cases ran on four models, and every transcript was read and its claims checked by
hand. [evals.md](evals.md) has the method, the results and what they changed. In short, on the
first pass: Opus 5.5 had no errors found; Sonnet 5 invented card codes; GPT-6 Sol was accurate;
GPT-6 Luna was careful but slow under the account's rate limit. Effort is pinned per provider so
results stay comparable. The model actually shipped as the default changed the next day — see
below.

**Two decisions made along the way:**
- **Streaming, not websockets.** The answer already streams over HTTP. The real limit is the
  platform's 300-second function time, not the connection, so the agent works to a 270-second
  deadline and always leaves time to write the answer. A background job that survives a closed
  tab (resumable streams) needs a store and was not worth it for two players.
- **The card set is loaded whole.** ArkhamDB's API returns every card or one card by code,
  with no search by name, and name lookups, replacements and ownership checks all need the full
  set. It is fetched live once per server instance and kept for a day; if a refresh fails, the
  last copy keeps being served.

## Going public (September 23)

- **Hosting behind a login.** Vercel Authentication (free: visitors sign in with a Vercel
  account, and one outside user may be approved) was picked over a shared password (a paid
  add-on) and over real accounts with Clerk (history on every device, but a feature to build).
  The model key never goes into GitHub; CI needs none, because the tests are hermetic.
- **A final review of the whole codebase.** Three reviewers (correctness, design, conventions)
  read everything. The fixes that mattered most:
  - replacements now respect deck limits the way ArkhamDB does, including cards the taboo list
    forbids;
  - taboo-on recommendations skip decks the current list makes illegal;
  - signature cards are never offered as replacements;
  - answers budget against the real deadline;
  - an ArkhamDB outage serves yesterday's cards instead of failing;
  - untrusted text is escaped rather than stripped, so a nested tag can't close the wrapper;
  - tool failures share one shape;
  - tool results carry structured fields, so the interface stops re-parsing text written for
    the model.
- **A comment sweep.** 263 comments were deleted and 134 kept, each carrying something the code
  cannot say: an ArkhamDB quirk, a game rule, a cache or hydration constraint.
- **License and credits.** The code is MIT. The rules, FAQ and card text belong to Fantasy
  Flight Games, the data comes from ArkhamDB, and the deck guides belong to their authors; none
  of that is covered by the license.

## Widening the evals and picking Sol (September 24)

The first pass compared four models once each. It left two open questions: was Sonnet's
invented-code failure a fluke, and would a different effort level fix or explain Luna's
slowness. Both got a real answer instead of a guess, and a fifth model (`gpt-5.6-luna`, the
previous generation, with a 500,000 tokens/minute limit against the current Luna's 200,000) was
added for comparison. [evals.md](evals.md) has the numbers; the findings:

- **Not a fluke.** Sonnet's three failing cases, repeated three more times at default effort,
  invented a card code in two of the three repeats — a different code each time. Effort, not
  chance, was the fix: Sonnet at maximum effort ran the whole set clean.
- **Higher effort helped Sonnet and hurt Luna.** Luna at high effort was clean too, but slower
  than its own default; at max effort it called `cards` redundantly until a sixth of all cases
  ran out of time. Luna's default effort was already its best setting.
- **The previous-generation Luna was not worth it.** Its higher rate limit made it faster, but
  it was pricier per token, less reliable at its default and low effort, and the only model in
  the whole matrix to invent a card code with no tool call at all. There is no reason to use it
  over the current one.
- **17 of 18 invented codes were real cards, just the wrong ones.** Only one code did not
  exist at all. That ruled out checking whether a code merely exists (it would have missed 17
  of 18) and ruled out asking ArkhamDB live (the card set is already cached in the app).
  `lib/link-repair.ts` checks a linked code's real name against the one in the answer and
  corrects or strips it, backed only by data already in memory. It runs as a `streamText`
  transform (`lib/agent.ts`) buffering just the current text block, so tool progress keeps
  streaming live; the cost is that answer text no longer streams token by token.
  Re-running Sonnet's original failing cases afterward found every link correct.
- **Cost, not correctness, picked the default.** With the link-repair backstop covering every
  model, the choice between Opus and Sol stopped being about correctness and became about
  price. Sol costs 65% less per run and carries none of Anthropic's roughly 2x premium for
  writing the system prompt into the cache on a cold request. A run of back-to-back eval cases
  barely pays that premium, but two people asking occasional questions pay it on nearly every
  real question. `lib/model.ts` now
  prefers OpenAI over Anthropic when both keys are set.

## Play rates against the decks that could hold the card (October 25)

- **Why.** A play rate was "this share of the investigator's liked decks run it", and a published
  list is one moment of a campaign: a 0 XP starting deck can't run a level 5 card, so leveled
  cards looked rarer than they are. Each deck's list XP is now recorded with the counts, and a
  card's share is taken among the decks holding at least its level in XP. Until the index is
  rebuilt, the old counts fall back to every deck.

## A crawl that reads only what the index uses (October 27)

- **Why.** The October 26 refresh walked all 39,462 published decklists over hours to change 4
  of 660 indexed decks. The census was there because ArkhamDB reshuffles decks with equal likes
  on every request, so the likes order could not be paged through safely.
- **What changed.** A tie group's size is fixed by where it sits, so the walk counts the places
  it fills and refetches until that many distinct decks are seen, falling back to one
  investigator's date walk when it will not settle. Each investigator is walked only as deep
  as the index and the usage counts need.
- **Measured.** Replaying the October 26 census through the new walk, with ties reshuffled on
  every request, chose the same 660 decks and byte-identical usage counts in 170 to 210 search
  pages; with ties frozen in place, the worst case, it took 580. Two live requests confirmed
  ArkhamDB reshuffles ties even for the same page.
- **Also.** A request budget, Retry-After, a dry run, a progress line, and a committed manifest
  of each run.
- **The first live run** passed every check with the same 660 decks, but took 953 pages and 32
  minutes, not about 200. ArkhamDB answers a parallel investigator's code with the original's
  decks, which the replay had not modeled, so each parallel was walked as a full copy; and ties
  settled less often than under random reshuffling, so busy investigators fell back to date
  walks. Codes that alias another now stop after one page, settling gets five rounds, and each
  fallback is recorded with its reason. The second run took 420 pages in 14 minutes; five busy
  investigators still fell back to date walks, each over a tie group one deck short.
