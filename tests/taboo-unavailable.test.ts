// Its own file: the taboo lists load once per module graph, and here that load fails.
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { runAgent } from "@/lib/agent";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { answer, callTools, DECK, scriptedModel, toolResultsSent } from "./helpers";

beforeAll(() => {
  // an unreadable taboo file stands in for ArkhamDB being down with no copy on disk
  vi.stubEnv("ARKHAM_TABOOS_FILE", "/nonexistent/taboos.json");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function toolTexts(taboo: boolean) {
  const model = scriptedModel((step) =>
    step === 0
      ? callTools(
          { toolName: "cards", input: { code: "02002" } }, // Rex Murphy, whom list 010 changes
          { toolName: "deck", input: { ref: DECK.luciusGalloway } },
          { toolName: "replaceCard", input: { deck: DECK.skids, card: "Machete", goal: "same_job" } },
          { toolName: "recommendDecks", input: { class: "rogue" } },
        )
      : answer("done"),
  );
  await runAgent({ model, messages: [{ role: "user", content: "?" }], settings: { ...DEFAULT_SETTINGS, taboo } }).consumeStream();
  return toolResultsSent(model, 1);
}

describe("the taboo list switched on but unavailable", () => {
  test("is an error in every tool, never an untabooed answer passed off as tabooed", async () => {
    const text = await toolTexts(true);
    expect(text.cards).toMatch(/^ERROR loading the taboo list, which is on: .*\. Card text below is untabooed\./);
    expect(text.deck).toMatch(/\nERROR loading the taboo list, which is on: .*\. Card text below is untabooed\.\n/);
    expect(text.replaceCard).toMatch(/^ERROR: The taboo list is on but could not be loaded .*legality cannot be checked\./);
    expect(text.recommendDecks).toMatch(/\nThe index checks taboo list 010; the current list could not be loaded /);
  });

  test("is never needed while the switch is off", async () => {
    const text = await toolTexts(false);
    for (const t of Object.values(text)) expect(t).not.toMatch(/ERROR/);
    expect(text.deck).toContain("Taboo list: off.");
    expect(text.replaceCard).toMatch(/^Replacing /);
  });
});
