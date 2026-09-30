import { describe, expect, test } from "vitest";
import { faqJson, parseFaqPage, rulingText } from "@/pipeline/faq";
import { rulesMarkdown } from "@/pipeline/rules";
import { parseSearchPage } from "@/pipeline/search";

describe("rulesMarkdown", () => {
  test("converts headings, nested lists, emphasis, icons and tables, and drops what is outside #rules", () => {
    const html = `<div id="nav">skip me</div><div id="rules">
      <h2>Slots</h2><p>An asset <b>may</b> take a <i>slot</i> <span class="icon-hand"></span>.</p>
      <ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul>
      <table><tr><td>a</td><td>b</td></tr></table>
      <script>ignored()</script><button>ignored</button></div>`;
    expect(rulesMarkdown(html)).toBe(
      "## Slots\n\nAn asset **may** take a *slot* [hand].\n\n- one\n  - nested\n- two\n\n| a | b |\n",
    );
  });

  test("a page without the rules column is an error, not an empty file", () => {
    expect(() => rulesMarkdown("<html><body><p>maintenance</p></body></html>")).toThrow(/#rules/);
  });
});

describe("parseFaqPage and faqJson", () => {
  const entry = (code: string, body: string) => `<div class="row"><div class="col-lg-12">
    <div class="review-header"><h4><a href="/card/${code}#review-1" data-code="${code}" class="card-name">Card ${code}</a></h4></div>
    <article class="review"><div class="review-text2">${body}</div></article>
    <div class="review-date"><time datetime="2024-05-06T10:00:00+00:00">May</time></div></div></div>`;

  test("read one ruling per card, with its date and text", () => {
    const page = parseFaqPage(
      entry("01060", "<ul><li><strong>Q:</strong> Can I? <strong>A:</strong> Yes &amp; no.</li></ul>") +
        entry("02002", '<p>Limit <span class="icon-reaction"></span></p>'),
    );
    expect([...page.keys()]).toEqual(["01060", "02002"]);
    expect(page.get("01060")).toEqual({ name: "Card 01060", updated: "2024-05-06", text: "- **Q:** Can I? **A:** Yes & no." });
    expect(page.get("02002")?.text).toBe("Limit [reaction]");
  });

  test("treat an entry missing its date as an error, never a silent gap", () => {
    expect(() => parseFaqPage(entry("01060", "x").replace(/<time[^>]*>May<\/time>/, ""))).toThrow(/ruling without/);
  });

  test("write the file in card code order, leading zeros included", () => {
    const r = { name: "x", updated: "2024-01-01", text: "t" };
    const json = faqJson(
      new Map([
        ["10002", r],
        ["01001", r],
      ]),
    );
    expect(json.indexOf('"01001"')).toBeLessThan(json.indexOf('"10002"'));
    expect(JSON.parse(json)).toEqual({ "01001": r, "10002": r });
  });

  test("keep a ruling's line breaks but not its blank runs", () => {
    expect(rulingText("a<br>b</p>\n\n\n<p>c")).toBe("a\nb\nc");
  });
});

describe("parseSearchPage", () => {
  const deckRow = (id: number, name: string, tags = "") => `<tr>
    <td class="decklist-hero-image"><div class="card-thumbnail-wide"></div></td>
    <td><div class="decklist-header">
      <h4><a href="/decklist/view/${id}/slug" class="decklist-name">${name}</a></h4>
      <div class="social">
        <span class="social-icon-like"><span class="fa fa-heart"></span> <span class="num">42</span></span>
        <span class="social-icon-favorite"><span class="fa fa-star"></span> <span class="num">7</span></span>
        <span class="social-icon-comment"><span class="fa fa-comment"></span> <span class="num">3</span></span>
      </div>
      <div class="username"><a href="/user/profile/1234/someone" class="fg-seeker">someone</a> <small class="reputation">567</small></div>
      <time datetime="2024-01-02T10:00:00+00:00">2 Jan 2024</time>
    </div>
    <div><a class="card card-tip" data-code="06002" href="/card/06002">Lily
      Chen</a> ${tags ? `<span>${tags}</span>` : ""}</div></td>
  </tr>`;
  const page = (...rows: string[]) =>
    `<table class="table"><thead><tr><th>Deck</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;

  test("reads one row per deck with every field, allowing a blank name and no tags", () => {
    const rows = parseSearchPage(page(deckRow(33170, "Lily Boom", "[solo, multiplayer]"), deckRow(45147, "")));
    expect(rows[0]).toEqual({
      id: 33170,
      name: "Lily Boom",
      likes: 42,
      favorites: 7,
      comments: 3,
      authorId: 1234,
      authorReputation: 567,
      date: "2024-01-02T10:00:00+00:00",
      investigatorCode: "06002",
      investigatorName: "Lily Chen",
      tags: ["solo", "multiplayer"],
    });
    expect(rows[1]).toMatchObject({ id: 45147, name: "", tags: [] });
  });

  test("reads a page past the last as an empty list", () => {
    expect(parseSearchPage(page())).toEqual([]);
  });

  test("treats a deck link the rows do not account for as an error, never a short list", () => {
    const stray = '<div class="featured"><a href="/decklist/view/47001/x" class="decklist-name">Featured</a></div>';
    expect(() => parseSearchPage(page(deckRow(33170, "Lily Boom")) + stray)).toThrow(/parsed 1 rows but the page links 2 decks/);
  });

  test("treats a row missing a required field as an error naming the field", () => {
    expect(() => parseSearchPage(page(deckRow(33170, "Lily Boom").replace(/<time[^>]*>[^<]*<\/time>/, "")))).toThrow(
      /row without date/,
    );
    expect(() =>
      parseSearchPage(page(deckRow(33170, "Lily Boom").replace('<span class="num">42</span>', '<span class="num">many</span>'))),
    ).toThrow(/non-integer likes/);
  });
});
