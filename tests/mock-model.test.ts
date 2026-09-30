import { expect, test } from "vitest";
import { route } from "@/lib/mock-model";
import { tools } from "@/lib/tools";

// e2e/smoke.spec.ts drives the app through these routes
test.each([
  ["What does Shrivelling do?", "cards", { query: "Shrivelling" }],
  ["How do I play deck 33170?", "deck", { ref: "33170" }],
  ["Who partners deck 33170?", "recommendDecks", { pairWith: "33170" }],
  ["Deck 33170: replace Azure Flame?", "replaceCard", { deck: "33170", card: "Azure Flame", goal: "same_job" }],
  ["Suggest a mystic cluever deck.", "recommendDecks", { class: "mystic", role: "cluever" }],
])("the scripted model routes %j to the %s tool", (question, toolName, input) => {
  expect(Object.keys(tools)).toContain(toolName);
  expect(route(question)).toEqual({ toolName, input });
});
