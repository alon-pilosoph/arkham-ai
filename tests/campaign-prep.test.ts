import { describe, expect, test } from "vitest";
import { CAMPAIGNS, encounterCards, findCampaign, profile, scenarios } from "@/lib/campaigns";
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

  test("breaks a campaign down by scenario in play order, the deluxe box's two apart, shared sets counted once", async () => {
    const ptc = await prep("Carcosa");
    expect(ptc.scenarios.map((s) => s.name)).toEqual([
      "Curtain Call",
      "The Last King",
      "Echoes of the Past",
      "The Unspeakable Oath",
      "A Phantom of Truth",
      "The Pallid Mask",
      "Black Stars Rise",
      "Dim Carcosa",
    ]);
    const parts = [...ptc.scenarios.map((s) => s.profile.cards), ptc.shared?.cards ?? 0];
    expect(parts.reduce((a, b) => a + b, 0)).toBe(ptc.profile.cards);
    expect((await prep("Edge of the Earth")).scenarios.map((s) => s.name)).toEqual([
      "Ice and Death",
      "Fatal Mirage",
      "To the Forbidden Peaks",
      "City of the Elder Things",
      "The Heart of Madness",
    ]);
    expect((await prep("Night of the Zealot")).scenarios.map((s) => s.name)).toEqual([
      "The Gathering",
      "The Midnight Masks",
      "The Devourer Below",
    ]);
  });

  test("a standalone is one scenario, with no breakdown", async () => {
    const r = await prep("Carnevale of Horrors");
    expect(r.scenarios).toEqual([]);
    expect(r.shared).toBeNull();
  });

  test("every campaign lists its scenarios", () => {
    for (const c of CAMPAIGNS) expect(scenarios(store, c).length, c.code).toBeGreaterThan(0);
  });

  test("counts each copy, and never counts a reprint twice", () => {
    const core = encounterCards(store, ["core"]);
    expect(core.every((c) => !store.isReprint(c.code))).toBe(true);
    expect(profile(core).cards).toBe(core.reduce((n, c) => n + (c.quantity ?? 1), 0));
  });

  test("names no encounter card, so it spoils nothing", async () => {
    const text = campaignPrepText(await prep("Carcosa"));
    const ptc = CAMPAIGNS.find((c) => c.code === "ptc");
    // scenario titles are published, so they may appear; any other card name may not
    const titles = ptc ? scenarios(store, ptc).map((x) => x.name.toLowerCase()) : [];
    const names = encounterCards(store, ptc?.packs ?? [])
      .map((c) => c.name)
      .filter((n) => n.length > 6 && !titles.some((t) => t.includes(n.toLowerCase())))
      .filter((n) => !/carcosa|pallid|mask|oath|phantom|truth|echoes|past|black stars|rise|dim/i.test(n));
    for (const n of names) expect(text, n).not.toContain(n);
  });

  test("reports an unknown campaign as not found, listing the real ones", async () => {
    const r = await campaignPrep("zorblax");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Edge of the Earth/);
  });
});
