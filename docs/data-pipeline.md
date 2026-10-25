# The data pipeline

This document covers everything under `pipeline/`: how the deck index is built, how the bundled
Rules Reference and official rulings are refreshed, and what each step checks. The pipeline runs
offline, by hand; the app never runs any of it. The reasons it is built this way are in
[design-decisions.md, section 2](design-decisions.md#2-the-deck-index).

## Commands

| Command | Reads | Writes |
|---|---|---|
| `npm run data:crawl` | ArkhamDB's decklist search and decklists | `data/cache/`: the census, the decklists and a crawl report |
| `npm run data:crawl -- --reuse-census` | The last census; ArkhamDB decklists | `data/cache/decklists/` |
| `npm run data:sheet -- <mode>` | `data/cache/`, `data/deck-labels/` | Nothing; prints label sheets |
| `npm run data:index` | `data/cache/`, `data/deck-labels/` | `lib/index/decks.json`, `lib/index/card-usage.json`, `tests/fixtures/` |
| `npm run data:rules` | ArkhamDB's `/rules` page | `data/rules.md` |
| `npm run data:faq` | ArkhamDB's `/faqs` pages | `data/faq.json` |
| `npm run data:collection` | ArkhamDB's pack list | Nothing; checks `lib/collection.json` |

`data/cache/` is ignored by git. Every other output in the table is committed.

The scripts wait their turn between requests, one a second, and identify themselves with their
own user agent (`pipeline/http.ts`). A 429, a 5xx or a network failure is retried twice, after 3
and then 10 seconds; a 404 is reported as `not_found` and never retried. ArkhamDB is run by
volunteers, and a full crawl takes about an hour of its time.

## Refreshing the deck index

```sh
npm run data:crawl            # census, cross-check, fetch decklists (~1 h)
npm run data:sheet -- status  # how many selected decks still need labels
npm run data:sheet -- next    # label sheets for the next investigator
npm run data:index            # build; fails, listing them, if any lack labels
npm run check                 # the tests now read the new snapshots
```

Repeat the `data:sheet -- next` step, writing labels into `data/deck-labels/` (step 4 below),
until `status` reports every selected deck labeled.

### 1. The census (`pipeline/search.ts`, `pipeline/crawl.ts`)

The census is the complete list of published decklists. The crawl builds it by walking
ArkhamDB's decklist search in date order, 30 decks a page, once for each investigator code in the
card set (reprints, parallels and Chapter 2 included, since a deck is filed under the code its
author picked), until a page comes back short. A code with no decks costs one empty page. Each
row records the deck's id, name, likes, favorites, comments, author, date, investigator and
ArkhamDB tags, and a deck found under two codes is counted once.

ArkhamDB serves no search page past 99, filtered or not, so a single walk of every deck (about
1,300 pages) is no longer possible. The busiest investigator, Roland Banks, fills under 80 pages.
An investigator that ever needs more than 99 stops the crawl with an error naming it, rather than
leaving the census short.

A search page is parsed one table row at a time. Every field except the deck name is required,
and a page whose rows do not account for every deck link on it is an error, never a shorter list,
so a row with unexpected markup cannot silently drop out of the census.

The crawl then cross-checks the census twice. It walks the likes order down to 10 likes (about 66
pages), and it reads the 10 newest pages across every investigator. If a deck found by either is
missing from the census, the run fails and names the deck and its investigator code; the newest
pages catch a code the census did not walk. Below 10 likes the likes order has too many ties to
page through reliably, which is why the census exists.

### 2. The selection (`pipeline/selection.ts`)

For each investigator the players own, the census rows are sorted by likes, then favorites, then
age (older first), and read in that order until ten decks are kept:

| Rule | Where it is set |
|---|---|
| Stop at ten decks | `DECKS_PER_INVESTIGATOR = 10` |
| Never read a deck with no likes | `MIN_LIKES = 1` |
| Skip a deck with any card the collection lacks, including the investigator and any parallel sides | `unownedCard` |
| Skip a deck with any card that fails the legality check under the author's taboo list | `deckViolation` (`lib/legality.ts`) |
| Skip a deck that shares 85% or more of its distinct cards with one already kept | `SAME_LIST_OVERLAP = 0.85` |

Investigators are grouped by their original printing's code, so a promo reprint of an
investigator counts as the original. Hidden cards, encounter-deck investigators and parallel
investigators are not investigators of their own: a deck that uses a parallel front or back is a
deck for the original investigator.

The crawl runs the selection with a deck loader that fetches and caches decklists as it goes. The
index build and the label sheets run the same function with a loader that reads only the cache,
so the three can never disagree about which decks were selected.

### 3. Card usage (`pipeline/usage.ts`)

Every census deck with 10 or more likes is fetched, whether the collection can build it or not.
Its distinct cards (excluding weaknesses and investigator cards, with reprints folded into their
originals) are counted per investigator and per class. `replaceCard` reads these counts as play
rates.

### 4. Labels (`data/deck-labels/`, `pipeline/labels.ts`)

A deck's label is its role, optional secondary role, archetypes and one-line summary. Labels are
kept in one file per investigator, named `<code>-<name>.json`:

```json
{
  "investigator": "Roland Banks",
  "decks": [
    {
      "id": 20344,
      "role": "fighter",
      "secondaryRole": "cluever",
      "archetypes": [],
      "summary": "Core Set Roland who ..."
    }
  ]
}
```

| Field | Rule |
|---|---|
| `role` | `fighter`, `cluever`, `flex` (does both) or `support` |
| `secondaryRole` | A different role, or `null` |
| `archetypes` | Up to three from `lib/archetypes.ts`, none repeated; often empty ([archetypes.md](archetypes.md)) |
| `summary` | One line of at most 240 characters: what the deck does, and with which cards |

The files are validated with zod when they are read. A malformed file, or a deck labeled in two
files, stops the build.

`npm run data:sheet` prints a label sheet for each deck: what a labeler needs in front of them.
It shows the investigator's ability, the deck's list grouped by card type, counts of mechanics
detected in the card text (bless, seal, firearms, card draw and so on), and the first 150 words of
the author's guide. The counts show where to look; the label itself comes from reading the list
and the guide. The labels in the index were written this way by Claude during development, one
investigator at a time, and checked against the counts. A deck counts as labeled only when its
label is in its own investigator's file, which is also how the build counts it.

```sh
npm run data:sheet -- status          # labeled and unlabeled counts
npm run data:sheet -- next            # first investigator still unlabeled
npm run data:sheet -- 01001           # one investigator's unlabeled decks
npm run data:sheet -- 01001 --all     # include decks already labeled
npm run data:sheet -- 01001 --page 2  # five decks at a time: decks 6-10
```

### 5. The build (`pipeline/build-index.ts`)

The build reruns the selection and the usage counts from the cache, joins the labels, and writes:

- `lib/index/decks.json`: one row per line, sorted by investigator code and then likes, each
  validated by `IndexRowSchema`. XP is counted by `lib/decks.ts`, both as printed and under the
  current taboo list. Each row also records whether the list is legal under the current taboo
  list (`tabooLegal`, from the same `deckViolation` check) and which list that was
  (`tabooList`). With the taboo switch on, `recommendDecks` leaves out the rows that list makes
  illegal.
- `lib/index/card-usage.json`: the play-rate counts.
- `tests/fixtures/indexed-decks.json`: every indexed list as the crawl saw it.
- `tests/fixtures/cards.json.gz` and `tests/fixtures/taboos.json`: the card set and taboo lists
  the build used, which the tests read instead of the live API.

The build exits with an error, writing nothing, when a selected deck has no label or its label is
in another investigator's file; it lists those decks. When a decklist it needs is not in the
cache, it prints how many are missing and to run `npm run data:crawl -- --reuse-census`, writes
its outputs, and exits with an error. It also lists labels whose decks are no longer selected, so
they can be removed.

## The Rules Reference (`pipeline/rules.ts`)

ArkhamDB's `/rules` is a single page. Only its `#rules` column is kept, converted to Markdown:
headings keep their level, lists become `- ` lines, tables become pipe-separated rows, bold and
italics are kept, card icons become `[name]`, and links keep their text. The page is parsed as
written, with htmlparser2, because a spec-compliant parser would repair its stray tags by merging
paragraphs.

`npm run data:rules -- saved.html` converts a saved copy of the page instead of fetching it. A
change to `data/rules.md` is a change to the system prompt, so read the diff, and expect
`tests/golden.test.ts` to fail until its pins are regenerated with `UPDATE_GOLDEN=1`.

## Official rulings (`pipeline/faq.ts`)

`/faqs` is paged by path (`/faqs/2`, `/faqs/3`, ...), five cards a page, but its pager only links
the first ten pages. The script therefore keeps requesting pages until one adds no new card:
about 190 pages, and 949 cards with rulings at the last crawl. Each ruling keeps the card's name,
the date it was last updated, and its text, with list items on their own lines, bold and italics
as Markdown, and icons as `[name]`. An entry missing its card, date or text is an error.

## The collection (`pipeline/collection.ts`)

`lib/collection.json` is the players' shelf, kept by hand: every pack released before the 2026
reissue. `npm run data:collection` checks it against ArkhamDB's pack list. It exits with an error
when an owned pack has disappeared from ArkhamDB, or when ArkhamDB has a pack that is neither
owned nor on the script's list of known unowned packs, so a new release is always a deliberate
decision rather than a default.
