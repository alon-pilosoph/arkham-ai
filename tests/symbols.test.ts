import { expect, test } from "vitest";
import { symbolsToCode } from "@/components/tools/symbols";

test("game symbols in an answer become keycaps; links and unknown brackets are left alone", () => {
  expect(symbolsToCode("On [elder_sign], draw.")).toBe("On `Elder Sign`, draw.".replace("`,", "`⁠,"));
  expect(symbolsToCode("[reaction] After you win")).toBe("`Reaction` After you win");
  expect(symbolsToCode("any [guardian] card")).toBe("any Guardian card");
  expect(symbolsToCode("[action](https://arkhamdb.com/card/01000)")).toBe("[action](https://arkhamdb.com/card/01000)");
  expect(symbolsToCode("see [note] and [02002]")).toBe("see [note] and [02002]");
});
