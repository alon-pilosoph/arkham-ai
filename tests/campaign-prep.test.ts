import { describe, expect, test } from "vitest";
import { CAMPAIGNS, encounterCards, findCampaign, profile } from "@/lib/campaigns";
import { getCards } from "@/lib/cards";
import { campaignPrep, campaignPrepText } from "@/lib/tools/campaign-prep";
import { expectOk } from "./helpers";

const store = await getCards();
const prep = async (name: string) => expectOk(await campaignPrep(name));

describe("campaign prep", () => {
  test("finds a campaign by part of its name or its code, and a Return to box only when asked for", () => {
    expect(findCampaign("Carcosa").map((c) => c.code)).toEqual(["ptc"]);
    expect(findCampaign("return to carcosa").map((c) => c.code)).toEqual(["rtptc"]);
    expect(findCampaign("EotE").map((c) => c.code)).toEqual(["eote"]);
    expect(findCampaign("the Scarlet Keys campaign").map((c) => c.code)).toEqual(["tsk"]);
    expect(findCampaign("zorblax")).toEqual([]);
  });

  test("every campaign's packs have encounter cards in the card set", () => {
    for (const c of CAMPAIGNS)
      for (const p of c.packs) expect(encounterCards(store, [p]).length, `${c.code} ${p}`).toBeGreaterThan(0);
  });

  test("shows Carcosa's treacheries dealing horror more often than damage", async () => {
    const t = (await prep("The Path to Carcosa")).profile.treacheries;
    expect(t.horror).toBeGreaterThan(t.damage);
  });

  test("shows the frost tokens of Edge of the Earth, and none in Carcosa", async () => {
    expect((await prep("Edge of the Earth")).profile.tokens.frost).toBeGreaterThan(0);
    expect((await prep("Carcosa")).profile.tokens.frost).toBe(0);
  });

  test("breaks an older cycle down by pack in play order, deluxe box first; a campaign box has none", async () => {
    const ptc = await prep("Carcosa");
    expect(ptc.stages.map((s) => s.pack)).toEqual(["ptc", "eotp", "tuo", "apot", "tpm", "bsr", "dca"]);
    expect((await prep("Edge of the Earth")).stages).toEqual([]);
  });

  test("counts each copy, and never counts a reprint twice", () => {
    const core = encounterCards(store, ["core"]);
    expect(core.every((c) => !store.isReprint(c.code))).toBe(true);
    expect(profile(core).cards).toBe(core.reduce((n, c) => n + (c.quantity ?? 1), 0));
  });

  test("names no encounter card, so it spoils nothing", async () => {
    const text = campaignPrepText(await prep("Carcosa"));
    const names = encounterCards(store, CAMPAIGNS.find((c) => c.code === "ptc")?.packs ?? [])
      .map((c) => c.name)
      .filter((n) => n.length > 6 && !/carcosa|pallid|mask|oath|phantom|truth|echoes|past|black stars|rise|dim/i.test(n));
    for (const n of names) expect(text, n).not.toContain(n);
  });

  test("reports an unknown campaign as not found, listing the real ones", async () => {
    const r = await campaignPrep("zorblax");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Edge of the Earth/);
  });
});
