import { expect, test } from "vitest";
import { route } from "@/lib/mock-model";
import { tools } from "@/lib/tools";

test("the scripted model only calls tools that exist", () => {
  const questions = [
    "What does Shrivelling do?",
    "How do I play deck 33170?",
    "Who partners deck 33170?",
    "Deck 33170: replace Azure Flame?",
    "Suggest a mystic cluever deck.",
  ];
  for (const q of questions) expect(Object.keys(tools)).toContain(route(q).toolName);
});
