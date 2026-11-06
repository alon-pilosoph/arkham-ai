// A campaign under way for the evals, built in memory: the tools read it from the context, and
// proposals write nothing, so no database is needed.

import fs from "node:fs";
import path from "node:path";
import type { DeckListJson } from "@/lib/campaign/store";
import type { CampaignContext } from "@/lib/tool-context";

export function evalCampaign(): CampaignContext {
  const deck = JSON.parse(fs.readFileSync(path.join("tests", "fixtures", "decklist-33170.json"), "utf8"));
  const list: DeckListJson = {
    investigator_code: deck.investigator_code,
    slots: deck.slots,
    meta: deck.meta,
    taboo_id: deck.taboo_id,
    description_md: deck.description_md,
  };
  const version = { id: "v1", number: 1, name: deck.name, at: "2026-11-01T18:00:00.000Z", list, campaignCards: {} };
  return {
    id: "eval",
    name: "Tuesday Carcosa",
    code: "ptc",
    campaignName: "The Path to Carcosa",
    difficulty: "standard",
    taboo: false,
    ownerId: "eval-user",
    askerId: "eval-user",
    version: 4,
    scenarios: ["Curtain Call", "The Last King", "Echoes of the Past", "The Unspeakable Oath"],
    nextScenario: 1,
    members: [{ userId: "eval-user", name: "Alon", email: "alon@example.com", role: "owner" }],
    seats: [
      {
        id: "s1",
        name: "Lily",
        userId: "eval-user",
        investigatorCode: deck.investigator_code,
        status: "active",
        deck: { ...version, source: "decklist:33170" },
        target: null,
        direction: "a fighter who can also clue",
        versions: [version],
        xp: { earned: 5, spent: 0, unspent: 5 },
        trauma: { physical: 0, mental: 1 },
      },
    ],
    changes: [
      {
        id: "c1",
        kind: "record",
        summary: "Lily: +5 XP, +1 mental trauma",
        by: "Alon",
        at: "2026-11-01T21:00:00.000Z",
        revertOf: null,
        revertedBy: null,
      },
    ],
  };
}
