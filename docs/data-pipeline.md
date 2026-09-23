# The data pipeline

**Scope.** Everything under `pipeline/`: how the deck index is made, how the bundled Rules
Reference and rulings are refreshed, and what each step checks. The app never runs any of it.
Why it is built this way: [design-decisions.md](design-decisions.md), section 2.

## Commands

| Command | Reads | Writes |
|---|---|---|
| `npm run data:crawl` | ArkhamDB search pages and decklists | `data/cache/` (census, decklists, crawl report) |
| `npm run data:crawl -- --reuse-census` | the last census, ArkhamDB decklists | `data/cache/decklists/` |
| `npm run data:sheet -- <mode>` | the cache, `data/deck-labels/` | nothing: prints label sheets |
| `npm run data:index` | the cache, `data/deck-labels/` | `lib/index/decks.json`, `lib/index/card-usage.json`, `tests/fixtures/` |
| `npm run data:rules` | ArkhamDB `/rules` | `data/rules.md` |
| `npm run data:faq` | ArkhamDB `/faqs` | `data/faq.json` |
| `npm run data:collection` | ArkhamDB's pack list | nothing: checks `lib/collection.json` |

`data/cache/` is ignored by git. Everything else in the table is committed.

Every request waits its turn, one a second, identified by its own user agent (`pipeline/http.ts`).
A 429, a 5xx or a network failure is retried twice, after 3 and 10 seconds; a 404 is `not_found`,
never retried. ArkhamDB is volunteer-run, and a full crawl is about an hour of its time.

## Refreshing the deck index

```sh
npm run data:crawl        # census, cross-check, fetch what the selection and counts need
npm run data:sheet -- status
npm run data:sheet -- next          # label what the build will ask for, see below
npm run data:index        # fails, listing them, while any selected deck is unlabeled
npm run check             # the tests now read the new snapshot
```

### 1. The census (`pipeline/search.ts`, `pipeline/crawl.ts`)

The census walks ArkhamDB's decklist search in date order, page by page, until a page comes back
empty: about 1,300 pages, 38,984 published decklists at the last crawl. Each row keeps the deck's
id, name, likes, favorites, comments, author, date, investigator and ArkhamDB tags.

A search page is parsed one table row at a time. Every field but the name is required, and a
page whose rows do not account for every deck link on it is an error, never a short list: a row
with unexpected markup must not silently drop out of the census.

Then the cross-check walks the likes order down to 10 likes. Any deck it finds that the census
lacks fails the run, with the deck named. The likes order is too tie-ridden to trust below that,
which is why the census exists.

### 2. The selection (`pipeline/selection.ts`)

For each investigator the players own, the census rows are sorted by likes, then favorites, then
age, and read in that order until ten are kept:

| Rule | Constant |
|---|---|
| Stop at ten decks | `DECKS_PER_INVESTIGATOR = 10` |
| Never read a deck nobody liked | `MIN_LIKES = 1` |
| Skip a deck with any card the collection lacks, investigator sides included | `unownedCard` |
| Skip a deck any card of which fails legality under the author's taboo list | `deckViolation` |
| Skip a deck sharing 85% of its distinct cards with a kept one | `SAME_LIST_OVERLAP = 0.85` |

Investigators are grouped by canonical code, so a promo reprint of an investigator counts as the
original. Hidden cards, encounter investigators and parallel investigators are not choices of
their own; a deck with a parallel front or back is a deck of the original investigator.

The crawl runs the selection with a loader that fetches and caches decklists as it goes. The
index build and the label sheets run the same function with a loader that reads the cache only,
so the three can never disagree about which decks were selected.

### 3. Card usage (`pipeline/usage.ts`)

Every census deck with 10 or more likes is fetched, owned or not, and its distinct cards
(weaknesses and investigators aside, reprints folded) are counted per investigator and per class.
`replaceCard` reads the counts as play rates.

### 4. Labels (`data/deck-labels/`, `pipeline/labels.ts`)

One file per investigator, named `<code>-<name>.json`:

```json
{
  "investigator": "Roland Banks",
  "decks": [
    {"id": 20344, "role": "fighter", "secondaryRole": "cluever", "archetypes": [], "summary": "Core Set Roland who ..."}
  ]
}
```

| Field | Rule |
|---|---|
| `role` | `fighter`, `cluever`, `flex` (does both) or `support` |
| `secondaryRole` | another role, or `null` |
| `archetypes` | up to three from `lib/archetypes.ts`, none repeated; often empty ([archetypes.md](archetypes.md)) |
| `summary` | one line, at most 240 characters: what the deck does and with which cards |

The files are validated with zod when read; a malformed file, or a deck labeled in two files,
stops the build.

`npm run data:sheet` prints what the labeler needs in front of them to label a batch, five decks
a page: the investigator's stats and ability, each deck's list grouped by type, a tally of signals
read off the card text (bless, seal, firearms, card draw and so on), and the opening of the
author's guide. The signals point at where to look; the label comes from reading the list and the
guide. The labels in the index were written this way by Claude during development, one
investigator at a time, and checked against the tallies. A deck counts as labeled only when its
label is filed under its own investigator, as the build counts it.

```sh
npm run data:sheet -- status          # labeled and unlabeled counts per investigator
npm run data:sheet -- next            # the first investigator with unlabeled decks
npm run data:sheet -- 01001           # one investigator's unlabeled decks
npm run data:sheet -- 01001 --all     # labeled ones included
npm run data:sheet -- 01001 --page 2  # the next five
```

### 5. The build (`pipeline/build-index.ts`)

The build reruns the selection and the usage counts from the cache, joins the labels, and writes:

- `lib/index/decks.json`: one row per line, by investigator code then likes, each validated by
  `IndexRowSchema`. XP is counted by `lib/decks.ts`, printed and under the current taboo list,
  and each row records whether the list is legal under the current taboo list (`tabooLegal`,
  the same `deckViolation` check) and which list that was (`tabooList`). With the taboo switch
  on, `recommendDecks` leaves out the rows that list makes illegal.
- `lib/index/card-usage.json`
- `tests/fixtures/indexed-decks.json`: every indexed list as the crawl saw it.
- `tests/fixtures/cards.json.gz` and `tests/fixtures/taboos.json`: the card set and taboo lists
  the build used, which the tests read instead of the live API.

It exits non-zero, listing the decks, when a selected deck has no label or is filed under the
wrong investigator, and when a decklist it needs is not cached. It reports labels whose decks
are no longer selected, so they can be removed.

## The Rules Reference (`pipeline/rules.ts`)

`/rules` is one page. Only its `#rules` column is kept, converted to Markdown: headings keep
their level, lists become `- ` lines, tables become pipe rows, bold and italics survive, card
icons become `[name]`, and links keep their text. The page is parsed as written (htmlparser2),
because a spec parser would repair its stray tags by merging paragraphs.

`npm run data:rules -- saved.html` converts a saved copy instead of fetching. A change to
`data/rules.md` is a change to the system prompt; read the diff.

## Official rulings (`pipeline/faq.ts`)

`/faqs` pages by path (`/faqs/2`, `/faqs/3`, ...), five cards a page, and its pager only links
the first ten pages, so the walk continues until a page adds no new card: about 190 pages, 949
cards with rulings at the last crawl. Each ruling keeps the card's name, its last update and its
text, with list items on their own lines, bold and italics as Markdown and icons as `[name]`. An
entry missing its card, date or text is an error.

## The collection (`pipeline/collection.ts`)

`lib/collection.json` is the players' shelf, kept by hand: every pack released before the 2026
reissue. `npm run data:collection` checks it against ArkhamDB's pack list and exits non-zero when
an owned pack has disappeared from ArkhamDB or ArkhamDB has a pack that is neither owned nor known
to be unowned, so a new release is a decision, never a default.
