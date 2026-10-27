# Plan: campaigns with accounts

Status: **draft, for review.** Nothing here is built. Each section ends with what is still open.

## 1. The goal

Today every chat starts from nothing: the players re-explain their decks, their XP and where
they are in the campaign each time. A campaign gives the app a memory. Players create one, invite
the people they play with, lock in their decks, and every chat inside it starts from the
campaign's current state. After each scenario they tell the chat what happened, the chat records
it, and the next question ("what should I buy with 5 XP?") starts from the truth.

## 2. What players do

**Get in.** Someone opens an invite link, signs in, and lands in the campaign they were invited
to. Without an invite there is no way to create an account; the owner of the deployment is the
one exception, set by an environment variable.

**Start a campaign.** Pick a Chapter 1 campaign (The Path to Carcosa, a standalone, a Return to
box), name it, and set the taboo list on or off for it. The app lists its scenarios in play
order, by their published names only.

**Invite.** The campaign's page has an invite link to copy and send. Whoever opens it, signs in
and accepts becomes a member. Members can be removed; the link can be replaced, which ends the
old one.

**Lock in decks.** Each player seat gets an investigator and a deck: from an ArkhamDB link, a deck
from the index, or by talking it through in chat ("lock in this list"). From then on the app
holds the list. A seat is not the same as an account: one person can play two investigators,
and a seat can belong to someone without an account.

**Play a scenario.** Before it: "how should we prepare for the next one?" uses the campaign
prep counts for that scenario, spoiler-light as today.

**After a scenario.** "We won Curtain Call, 3 XP each, Roland took a mental trauma." The chat
proposes the change as a card: the scenario result, XP earned per seat, trauma. A member clicks
Apply, or Discard. Nothing is written without that click.

**Upgrade.** "I keep failing willpower tests, what should I buy?" The XP advisor answers from the
seat's actual list and unspent XP. Agreeing on a swap ("take out Machete, put in Lightning Gun")
proposes a deck change, priced by the advisor's rules (levels, exceptional, myriad,
customizations, taboo). Applying it makes a new version of the deck and spends the XP.

**Look back.** The campaign page shows each seat's deck and its versions, the XP ledger, trauma,
the scenario log and the campaign's chats. Everything the chat can change can also be changed by
hand there.

**See others' changes.** By refreshing. There is no live sync: when a change is applied, other
members see it the next time they load the page or send a message.

Open: none.

## 3. Not in scope

- **Live sync** between members' screens.
- **Old chats.** They were test chats; they are not moved over.
- **Writing to ArkhamDB.** Decks are exported as text that ArkhamDB imports; the app never logs
  in to ArkhamDB.
- **A rules engine for the campaign log.** The app does not work out XP or trauma from a
  scenario's resolution; the players say what they got, as they would write it on the log.
- **Chapter 2.** Unchanged: out of scope on purpose.

## 4. What a campaign holds

| Thing | Holds | Notes |
|---|---|---|
| Campaign | Which Chapter 1 campaign, a name, taboo on or off, its owner | |
| Member | An account's place in a campaign: owner or member | Owners invite and remove; members do everything else |
| Invite | A secret link token, who made it, when it ends | Replacing the link ends the old token |
| Seat | A player in the campaign: a display name, the account playing it (optional), the investigator, killed or insane | One account can hold two seats |
| Deck version | A seat's list at one point: cards, customizations, parallel sides, the taboo list it was built under | Each applied change makes a new version; the newest is the deck |
| XP entry | A seat's XP earned (from a scenario) or spent (by a deck change) | A ledger, not a total: unspent XP is the sum, and every entry says where it came from |
| Trauma entry | Physical or mental, per seat, per scenario | Also a ledger |
| Scenario entry | A scenario played: result in the players' words, the date, a note | Scenarios come from the campaign's list (section 9) |
| Log note | Free text the players add: the campaign log as they keep it | Only what they write; the app adds nothing from the box |
| Chaos bag | The tokens, as the players set them | |
| Chat | A conversation, in a campaign or personal | Campaign chats are shared by its members |
| Change | Every applied change: what it was, who applied it, when, from which chat | Lets the campaign page show history and undo the last change |

Open: whether undo goes further back than the last change.

## 5. How chat uses the campaign

**Every turn carries the state.** As the taboo setting and saved decks do today, the campaign's
state goes into the note on the newest user message, never into the system prompt, whose bytes
stay pinned. The note holds the summary: campaign, next scenario, each seat's investigator,
unspent XP, trauma and deck size. Full lists are read with a tool when needed, so a long
campaign does not grow every turn.

**Text the players wrote is untrusted.** Seat names, log notes and scenario notes go through
`untrusted()`, as deck names do now.

**Changes are proposals.** A new tool, `proposeChange`, takes a typed change (scenario result,
XP, trauma, deck swap, killed or insane, chaos bag, log note) and returns a card with Apply and
Discard; the tool itself writes nothing. Apply goes to the server, which checks it again: the
member is in the campaign, the deck stays legal (`deckViolation`), the XP is affordable and
priced by the advisor's rules. Each campaign has a version number: a change proposed before
someone else's change was applied says so and asks for a fresh proposal, so two members can't
overwrite each other.

**The existing tools learn the campaign.** The XP advisor and replacement tools take a seat
instead of a deck id when a campaign is open; campaign prep looks at the next scenario.

Open: whether a member can apply a change to someone else's seat (proposed: yes, the table plays
together, and the change history shows who did it).

## 6. Hosting and accounts

**Where it runs: Vercel, as now.** It is free, needs no upkeep, and every branch gets its own
preview link for screenshot reviews. A chat answer can run 300 seconds, which the agent's
budgets already fit.

**The database: Postgres on Neon's free plan,** added through Vercel's marketplace. Campaigns are
tiny next to its 0.5 GB. It sleeps after five idle minutes and wakes in about a second, which
only the first request after a quiet spell notices. Queries go through Drizzle, with the schema
in code and migrations committed.

**Accounts: Better Auth,** with its tables in the same database. Sign in with Google, and with a
one-time email link for anyone without Google (sent with a free email service, such as Resend).
Sessions are cookies; every API route checks the session and, for campaign data, membership.

**Vercel Authentication goes.** The app's own sign-in replaces it, which also lifts the Hobby
plan's one-outside-user limit. Invite-only sign-up keeps strangers off the API key, and a daily
per-account message cap bounds what any account can spend.

**Assistant Cloud goes.** Chats are stored in our database, through assistant-ui's thread-list
adapter, so the chat interface itself stays as it is.

Rejected: *Supabase* (free projects pause after a week idle, and campaigns are played weeks
apart); *the home Pi* (a second production system to keep up, and down with the house's power or
internet); *keeping Assistant Cloud* (it stores chats per browser, anonymously, and cannot join a
chat to a campaign).

Open: whether email links are needed at first, or Google sign-in covers everyone for now.

## 7. Spoilers

The app names scenarios by their published titles and says nothing of what is in them beyond
what campaign prep says today. The campaign log is whatever the players write. Nothing about
resolutions, story choices or later scenarios' contents comes from the app.

## 8. Testing

- **Unit tests stay off the network.** The database in tests is PGlite, Postgres running in the
  test process, migrated from the same schema.
- **The ledgers are tested with known answers:** unspent XP after a run of purchases, upgrades,
  exceptional and myriad cards, customizations, and an undo.
- **Every change kind** is tested for the server's checks: not a member, illegal deck, XP short,
  stale campaign version.
- **End-to-end tests** run on the mock model with a test-only sign-in, from creating a campaign
  through an applied change.
- **Screenshots** of every new screen, desktop and phone, light and dark, before any of it
  counts as done.

## 9. Scenario lists

Each campaign gets its scenarios in play order, written by hand like the pack list, with the
encounter sets each uses. That fixes campaign prep's table: it shows one row per scenario
(Curtain Call and The Last King, not "The Path to Carcosa"), and campaign prep can size up the
next scenario of a campaign.

## 10. Build order

Each step is its own branch, reviewed and merged before the next. The current six branches are
merged first.

1. **Scenario lists**, and campaign prep by scenario.
2. **Database and accounts:** Neon, Drizzle, Better Auth, invite-only sign-up, sessions on every
   route, Vercel Authentication off.
3. **Chats in the database,** personal ones first; Assistant Cloud removed.
4. **Campaigns:** create, invite, seats, decks, ledgers, the campaign page with hand editing.
5. **Chat integration:** the state in every turn, `proposeChange` and its cards, the tools
   taking seats.
6. **Export** of a seat's deck for ArkhamDB, and undo.

What you would set up, once: Neon from Vercel's marketplace, a Google sign-in client (steps
written in `docs/deploying.md`), and an email service if email links are in.

## Open questions, all together

1. Undo: the last change only, or further back?
2. Can a member apply changes to someone else's seat?
3. Email-link sign-in from the start, or Google only for now?
