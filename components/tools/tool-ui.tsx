"use client";

import { defineToolkit, Tools, useAui } from "@assistant-ui/react";
import { CardsUI } from "./cards-ui";
import { DeckUI } from "./deck-ui";
import { RecommendUI } from "./recommend-decks-ui";
import { ReplaceUI } from "./replace-card-ui";

const arkhamToolkit = defineToolkit({
  cards: { type: "backend", render: CardsUI },
  deck: { type: "backend", render: DeckUI },
  recommendDecks: { type: "backend", render: RecommendUI },
  replaceCard: { type: "backend", render: ReplaceUI },
});

export function useArkhamTools() {
  return useAui({ tools: Tools({ toolkit: arkhamToolkit }) });
}
