import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { GET } from "@/app/api/card/[code]/route";
import { cardCode } from "@/components/cards/card-link";
import { RichText } from "@/components/cards/rich-text";
import { cardDetail } from "@/lib/card-detail";
import { getCards } from "@/lib/cards";
import { getTaboos, latest } from "@/lib/taboo";

const store = await getCards();

describe("the card dialog's card", () => {
  test("names each owned printing once (98004, a hidden promo copy of 01001, is not a second Core Set #1)", () => {
    const roland = cardDetail(store, "01001");
    expect(roland?.prints.map((p) => [p.pack, p.position])).toEqual([
      ["Core Set", 1],
      ["Revised Core Set", 1],
    ]);
  });

  test("lists every version, a parallel investigator under its own pack", () => {
    expect(cardDetail(store, "01001")?.versions.map((v) => [v.code, v.pack])).toEqual([
      ["01001", "Core Set"],
      ["90024", "By the Book"],
    ]);
    expect(cardDetail(store, "01060")?.versions.map((v) => v.level)).toEqual([0, 3, 5]);
  });

  test("opens a reprint as its original (Revised Core 01560 is Shrivelling 01060)", () => {
    expect(cardDetail(store, "01560")?.code).toBe("01060");
  });

  test("keeps ArkhamDB's markup for the dialog and the scan's address", () => {
    const shrivelling = cardDetail(store, "01060");
    expect(shrivelling?.rich.text).toContain("<b>Fight.</b>");
    expect(shrivelling?.image).toBe("https://arkhamdb.com/bundles/cards/01060.png");
    expect(shrivelling?.illustrator).toBe("Brian Valenzuela");
  });

  test("applies the taboo list only when given one (Rex Murphy, 02002)", async () => {
    expect(cardDetail(store, "02002")?.taboo).toBeUndefined();
    const taboo = latest(await getTaboos());
    expect(cardDetail(store, "02002", taboo)?.taboo?.change).toMatch(/Limit once per round/);
  });

  test("has no card for an unknown code", () => {
    expect(cardDetail(store, "zz999")).toBeUndefined();
  });
});

describe("GET /api/card/[code]", () => {
  const get = (code: string, query = "") =>
    GET(new Request(`http://localhost/api/card/${code}${query}`), { params: Promise.resolve({ code }) });

  test("answers with the card, with the taboo change only when the switch is on", async () => {
    const off = await get("02002");
    expect(off.status).toBe(200);
    expect((await off.json()).taboo).toBeUndefined();
    const on = await get("02002", "?taboo=1");
    expect((await on.json()).taboo.list).toBe("010");
  });

  test("404s an unknown code and 400s something that isn't a code", async () => {
    expect((await get("zz999")).status).toBe(404);
    expect((await get("../x")).status).toBe(400);
  });
});

describe("card links", () => {
  test("only ArkhamDB card pages are card links", () => {
    expect(cardCode("https://arkhamdb.com/card/01060")).toBe("01060");
    expect(cardCode("https://arkhamdb.com/card/11068a/")).toBe("11068a");
    expect(cardCode("https://arkhamdb.com/decklist/view/33170")).toBeUndefined();
    expect(cardCode("https://evil.example/arkhamdb.com/card/01060")).toBeUndefined();
    expect(cardCode(undefined)).toBeUndefined();
  });
});

describe("card text", () => {
  const html = (text: string) => renderToStaticMarkup(createElement(RichText, { text }));

  test("renders ArkhamDB's tags, traits and symbols", () => {
    const out = html("[action] Spend 1 charge: <b>Fight.</b> [[Spell]].\nNext line");
    expect(out).toContain('aria-label="Action"');
    expect(out).toMatch(/<b class="font-semibold">Fight\.<\/b>/);
    expect(out).toMatch(/<b class="font-semibold italic">Spell<\/b>/);
    expect(out).toContain("<br/>");
  });

  test("never passes other markup through, and closes what the text leaves open", () => {
    const out = html("<script>alert(1)</script><img src=x onerror=alert(1)><i>open");
    expect(out).not.toMatch(/<script|<img|onerror=/);
    expect(out).toContain("alert(1)");
    expect(out).toMatch(/<i>open<\/i>/);
  });

  test("keeps an unknown [token] as text", () => {
    expect(html("[not_a_symbol]")).toContain("[not_a_symbol]");
  });
});
