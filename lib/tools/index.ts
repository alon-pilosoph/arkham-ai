import { cardsTool } from "./cards";
import { deckTool } from "./deck";
import { findDeckTool } from "./find-deck";
import { recommendDecksTool } from "./recommend-decks";
import { replaceCardTool } from "./replace-card";
import { upgradesTool } from "./upgrades";

// Order matters: tool definitions are the first bytes of the cached prompt.
export const tools = {
  cards: cardsTool,
  deck: deckTool,
  findDeck: findDeckTool,
  recommendDecks: recommendDecksTool,
  replaceCard: replaceCardTool,
  upgrades: upgradesTool,
};

export type ToolName = keyof typeof tools;
