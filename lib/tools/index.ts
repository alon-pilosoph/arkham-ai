import { cardsTool } from "./cards";
import { deckTool } from "./deck";
import { recommendDecksTool } from "./recommend-decks";
import { replaceCardTool } from "./replace-card";

// Order matters: tool definitions are the first bytes of the cached prompt.
export const tools = {
  cards: cardsTool,
  deck: deckTool,
  recommendDecks: recommendDecksTool,
  replaceCard: replaceCardTool,
};

export type ToolName = keyof typeof tools;
