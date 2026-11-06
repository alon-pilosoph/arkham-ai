# Plan: chat first

Status: **approved.** Steps 1 and 2 are done; step 3 is next. Asking about a linked version from the chat, rather than the campaign page, comes with the lock-in card in step 7.

## 1. The goal

You land on the chat, and you can do everything from it. The chat is proactive: it asks for what
it needs, offers the next thing to do, and shows cards that update the campaign or take you to the
right place. The campaign pages stay: they are where the state is seen at a glance, and anything
can still be done there by hand.

**Nothing changes without a click.** The model proposes, a card shows it, and a player applies it.
That holds for every card below, undo included.

## 2. What the chat does

- **Starting a campaign.** "I'm starting a new campaign" gets a card with two buttons: set it up
  in chat, or set it up by hand. In chat it asks for the campaign, the difficulty, taboo, who is
  playing and their decks, then shows a Create campaign card. Details given up front skip the
  two-button card. Creating it opens a new chat inside the campaign, with a welcome and the invite
  link. The setup chat stays in personal chats.
- **Joining a campaign already under way.** "We're in the middle of Carcosa, about to play Echoes
  of the Past" works too. The chat asks for what it is missing: the next scenario, the difficulty,
  each seat's deck as it stands now, unspent XP and trauma, anyone killed or driven insane. The
  Create campaign card shows all of it, and the campaign starts from there rather than from the
  first scenario: the numbers go in as opening entries in the ledgers, so they can be corrected
  and reverted like any other change. The chat then goes straight to advice for that scenario.
- **After a scenario.** Told a scenario is finished, it asks for what it needs: XP earned, trauma,
  anyone killed or driven insane. Once it has them it proposes the change, and offers to look at
  upgrades.
- **Upgrading a deck.** It reads the deck's guide, which often lays out an upgrade path, and
  follows it. It also looks at alternatives, and flags what the guide wants that is illegal or
  unaffordable.
- **Remembering.** It knows each seat's earlier upgrades and what the players said about a deck's
  direction ("a flex mystic, not a battle mage"), in every chat of the campaign.
- **Everything else, as cards.** Add a seat, lock in a deck, undo a change, change settings, show
  the invite link, go to the campaign, start a chat in it.

## 3. Starting decks and target decks

The deck on ArkhamDB is often the finished one, and its description links the version to start
from ("this is the 0 XP version"). When a deck is locked in or comes up in chat, its description
is checked for such a link, and a card asks which to play from; nothing switches on its own,
since a description can link several decks. The seat keeps both: the starting deck is what is
played, and the finished deck is the target, which sets the theme and the direction of upgrades.

## 4. Deck slots

Personal chats lose the saved "my deck" and "partner's deck": they become plain questions, with a
deck pasted or named. Locked decks belong to campaigns, which take any number of seats.

## 5. Steps

1. Keep each deck's guide when it is locked in, and base XP advice on it and on alternatives.
2. Starting decks and target decks.
3. Memory per seat: earlier upgrades, and a deck's direction.
4. The proactive flows: asking for a scenario's results, offering upgrades.
5. Remove the deck slots.
6. Campaign setup in chat, from the start or from the middle of a campaign.
7. The remaining cards.
8. Evals against the real model, which so far has only been tested through a mock. They run once,
   here, because the prompt and tools change at every step before it.
