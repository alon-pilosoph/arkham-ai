import { describe, expect, test } from "vitest";
import { symbolsToCode } from "@/components/tools/symbols";

// keeps punctuation on its symbol's line
const WORD_JOINER = "⁠";

describe("symbolsToCode", () => {
  test("turns a game symbol into a keycap, joining the punctuation after it", () => {
    expect(symbolsToCode("On [elder_sign], draw.")).toBe(`On \`Elder Sign\`${WORD_JOINER}, draw.`);
    expect(symbolsToCode("[reaction] After you win")).toBe("`Reaction` After you win");
  });

  test("turns a class token into its word, since classes are words on the card", () => {
    expect(symbolsToCode("any [guardian] card")).toBe("any Guardian card");
  });

  test("leaves a markdown link and an unknown bracket alone", () => {
    expect(symbolsToCode("[action](https://arkhamdb.com/card/01000)")).toBe("[action](https://arkhamdb.com/card/01000)");
    expect(symbolsToCode("see [note] and [02002]")).toBe("see [note] and [02002]");
  });
});
