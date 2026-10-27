# The data pipeline

This document covers everything under `pipeline/`: how the deck index is built, how the bundled
Rules Reference and official rulings are refreshed, and what each step checks. The pipeline runs
offline, by hand; the app never runs any of it. The reasons it is built this way are in
[design-decisions.md, section 2](design-decisions.md#2-the-deck-index).

## Commands

| Command | Reads | Writes |
|---|---|---|
| `npm run data:crawl` | ArkhamDB's decklist search and decklists | `data/cache/`: the walk, the decklists and a crawl report; `data/crawl-manifest.json` |
| `npm run data:crawl -- --dry-run` | The last manifest; one search page | Nothing; prints an estimate |
| `npm run data:crawl -- --reuse` | The last walk; ArkhamDB decklists | `data/cache/decklists/` |
| `npm run data:sheet -- <mode>` | `data/cache/`, `data/deck-labels/` | Nothing; prints label sheets |
| `npm run data:index` | `data/cache/`, `data/deck-labels/` | `lib/index/decks.json`, `lib/index/card-usage.json`, `tests/fixtures/` |
| `npm run data:rules` | ArkhamDB's `/rules` page | `data/rules.md` |
| `npm run data:faq` | ArkhamDB's `/faqs` pages | `data/faq.json` |
| `npm run data:collection` | ArkhamDB's pack list | Nothing; checks `lib/collection.json` |

`data/cache/` is ignored by git. Every other output in the table is committed.

The scripts wait their turn between requests, one every two seconds, back off further when
ArkhamDB answers slowly (ten times as long as a slow answer took, up to two minutes), and identify
themselves with their own user agent (`pipeline/http.ts`). A 429, a 5xx or a network failure is
retried four times, after 3, 10, 30 and 60 seconds, or after as long as a `Retry-After` header
asks, up to ten minutes; a request asked to wait longer fails instead. A 404 is reported as
`not_found` and never retried. A crawl stops at its request budget, 4,000 by default
(`--budget`), with its walk saved for the next run to resume.

## Refreshing the deck index

```sh
npm run data:crawl -- --dry-run  # what the run will cost, from the last one; one request
npm run data:crawl            # walk, check, fetch decklists (about 10 min on a warm cache; resumes if stopped)
npm run data:sheet -- status  # how many selected decks still need labels
npm run data:sheet -- next    # label sheets for the next investigator
npm run data:index            # build; fails, listing them, if any lack labels
npm run check                 # the tests now read the new snapshots
```

Repeat the `data:sheet -- next` step, writing labels into `data/deck-labels/` (step 4 below),
until `status` reports every selected deck labeled.

### 1. The walk (`pipeline/walk.ts`, `pipeline/run.ts`)

The crawl reads ArkhamDB's decklist search in likes order, 30 decks a page, one investigator at
a time. Investigators are grouped by their original printing's code, and every code in the card
set is walked (reprints, parallels and Chapter 2 included), since a deck is filed under the code
its author picked; a code with no decks costs one empty page. ArkhamDB answers a search for a
parallel investigator's code with the original's decks, so a code whose first page holds no deck
filed under it is taken for such an alias and walked no further. Each row records the deck's id,
name, likes, favorites, comments, author, date, investigator and ArkhamDB tags.

An investigator is walked only as deep as it needs: down to 10 likes, for the usage counts, and
for an owned investigator further, until the selection (step 2) has its ten decks. A busy
investigator's ten decks are on its first page; the whole walk is about 200 pages.

The likes order has a catch. ArkhamDB orders decks with the same like count differently on every
request, even for the same page, so when such a tie group runs across a page break, paging can
show one of its decks twice and another never. The walk detects this rather than hoping it away.
Where the group sits does not move: the decks with more likes come before it in every ordering.
So the number of places the group fills on the pages, as first fetched, is its true size, and
the group is settled once that many distinct decks have been seen with its like count. An
unsettled group's pages are fetched again, up to five times, each fetch adding what it shows, and
a group that still will not settle is replaced by a walk of the investigator in date order:
stable, but it reads every deck the investigator has. The run's summary and manifest name each
such fallback and the groups that caused it. Once settled, every deck with at least the walk's lowest complete like
count (its frontier) has been seen, whatever order the requests came back in.

ArkhamDB serves no search page past 99, so a walk that would need more stops the crawl with an
error naming the investigator. A page whose like counts rise, or whose rows do not account for
every deck link on it, is an error too; every row field except the deck name is required.

The walk is saved after each investigator (`data/cache/walk-partial.json`). A crawl that stops,
on a network outage or at its request budget for instance, resumes from there the next time it
runs, unless the saved walk is more than two days old or `--fresh` is given.

Last, the crawl reads the ten most liked pages across every investigator, and fails, naming the
deck, if any deck there with 10 or more likes is missing from its investigator's walk: a check
that no investigator code was left out.

Replaying the census of all 39,462 published decklists (October 2026) through the walk, with
ties reshuffled on every request, selected the same 660 decks and the same usage counts in 170 to
210 search pages. Even if ArkhamDB stopped reshuffling ties, forcing date walks, it took 580. The
census it replaced took about 1,400. The first live run (October 27) passed every check and chose
the same 660 decks, but took 953 pages in 32 minutes: it walked each parallel investigator's
code as a full copy of its original, and its busiest investigators fell back to date walks
more often than the replay predicted. With the alias check and longer settling, the second run
took 420 pages in 14 minutes, five of its investigators still falling back to date walks over a
tie group one deck short of settling.

### 2. The selection (`pipeline/selection.ts`)

For each investigator the players own, the walked rows are sorted by likes, then favorites, then
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
so the three can never disagree about which decks were selected. A published decklist never
changes, so a cached one is never fetched again.

The crawl prints a progress line every minute and a summary at the end. When every check passes
(no deck missing from the walks, every decklist fetched), it writes `data/crawl-manifest.json`,
committed with the index it produced: when the run started and finished, its requests (search
pages, refetched pages, decklists, retries), how often ArkhamDB was slow or asked it to wait, how
many tie groups it settled and date walks it needed, and the selection's counts. `--dry-run`
estimates the next run from it.

### 3. Card usage (`pipeline/usage.ts`)

Every walked deck with 10 or more likes is fetched, whether the collection can build it or not.
Its distinct cards (excluding weaknesses and investigator cards, with reprints folded into their
originals) are counted per investigator and per class, along with how many of those decks hold at
least 0, 1, 2, 3, 4 and 5 XP in their list (`xpAtLeast`, the XP counted as the index counts it).
`replaceCard` reads these counts as play rates.

A published list is one moment in a campaign: many are starting decks with no XP, others are a
campaign's last list. So a card's play rate is the share of the decks that could hold it, those
with at least its level in XP, rather than of every deck; a level 5 card is not diluted by the
starting decks that could never run it.

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
cache, it prints how many are missing and to run `npm run data:crawl -- --reuse`, writes
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
