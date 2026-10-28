"use client";

import { defineToolkit, Tools, useAui } from "@assistant-ui/react";
import { CampaignPrepUI } from "./campaign-prep-ui";
import { CardsUI } from "./cards-ui";
import { DeckUI } from "./deck-ui";
import { FindDeckUI } from "./find-deck-ui";
import { ProposeChangeUI } from "./propose-change-ui";
import { RecommendUI } from "./recommend-decks-ui";
import { ReplaceUI } from "./replace-card-ui";
import { UpgradesUI } from "./upgrades-ui";

const arkhamToolkit = defineToolkit({
  cards: { type: "backend", render: CardsUI },
  deck: { type: "backend", render: DeckUI },
  findDeck: { type: "backend", render: FindDeckUI },
  recommendDecks: { type: "backend", render: RecommendUI },
  replaceCard: { type: "backend", render: ReplaceUI },
  upgrades: { type: "backend", render: UpgradesUI },
  campaignPrep: { type: "backend", render: CampaignPrepUI },
  proposeChange: { type: "backend", render: ProposeChangeUI },
});

export function useArkhamTools() {
  return useAui({ tools: Tools({ toolkit: arkhamToolkit }) });
}
