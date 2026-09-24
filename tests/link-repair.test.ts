import { describe, expect, test } from "vitest";
import { getCards } from "@/lib/cards";
import { repairLinks } from "@/lib/link-repair";

describe("repairLinks", () => {
  test("leaves a link whose code matches its name alone", async () => {
    const store = await getCards();
    const text = "[Ward of Protection](https://arkhamdb.com/card/01065) cancels a treachery.";
    expect(repairLinks(text, store)).toBe(text);
  });

  test("swaps in the right code when a level pins the name to one version", async () => {
    const store = await getCards();
    const text = "Play [Shrivelling (3)](https://arkhamdb.com/card/60104) for the extra damage.";
    expect(repairLinks(text, store)).toBe("Play [Shrivelling (3)](https://arkhamdb.com/card/02154) for the extra damage.");
  });

  test("strips the link when the name has more than one version and no level to pick one", async () => {
    const store = await getCards();
    const text = "Recharge with [Archaic Glyphs](https://arkhamdb.com/card/09021).";
    expect(repairLinks(text, store)).toBe("Recharge with Archaic Glyphs.");
  });

  test("strips the link when the name matches no card at all", async () => {
    const store = await getCards();
    const text = "See [Not A Real Card](https://arkhamdb.com/card/00000).";
    expect(repairLinks(text, store)).toBe("See Not A Real Card.");
  });
});
