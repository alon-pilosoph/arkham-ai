import fs from "node:fs";
import path from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { expect, vi } from "vitest";
import type { DeckList } from "@/lib/decks";
import { type Failure, failureText } from "@/lib/format";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

/** The decks with a `decklist-<id>.json` fixture, so the deck tools can read them, and why each was picked. */
export const DECK = {
  /** Lily Chen: a long guide, two versions of Discipline, built under taboo list 004 */
  lilyChen: "33170",
  /** Carolyn Fern: runs Archive of Conduits, which has an official ruling */
  carolynFern: "45147",
  /** Lucius Galloway: a customized Raven Quill, and Quick Thinking, which taboo list 010 changes */
  luciusGalloway: "54593",
  /** "Skids" O'Toole: two copies of Physical Training, and signatures that must never be offered */
  skids: "130",
} as const;

/** ArkhamDB has no deck by this id: no fixture answers it. */
export const MISSING_DECK = "99999999";

type Route = { status: number; body: string };

/** Stubs fetch: a route whose key the URL contains wins, then deck fixtures; any other URL throws. */
export function mockArkhamDB(routes: Record<string, Route> = {}) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (hit) return new Response(hit[1].body, { status: hit[1].status });
    const m = url.match(/\/api\/public\/(decklist|deck)\/(\d+)/);
    if (m) {
      const f = path.join(FIXTURES, `${m[1]}-${m[2]}.json`);
      if (fs.existsSync(f)) return new Response(fs.readFileSync(f, "utf8"), { status: 200 });
      // ArkhamDB answers a missing decklist with 200 and an empty body
      return new Response("", { status: 200 });
    }
    throw new Error(`unexpected network call in a test: ${url}`);
  });
  return calls;
}

/** A decklist fixture as ArkhamDB serves it, for a test that changes one field. */
export function decklistFixture(id: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `decklist-${id}.json`), "utf8"));
}

// written by `npm run data:index`
export function indexedDecks(): DeckList[] {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, "indexed-decks.json"), "utf8"));
}

export function indexedDeck(id: number): DeckList {
  const deck = indexedDecks().find((d) => d.id === id);
  if (!deck) throw new Error(`deck ${id} is not in tests/fixtures/indexed-decks.json`);
  return deck;
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

/** A model that streams `script(step)`'s chunks on each call; `doStreamCalls` records what it was sent. */
export function scriptedModel(script: (step: number) => unknown[]) {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const chunks = script(step++);
      return {
        stream: new ReadableStream({
          start(c) {
            for (const x of chunks) c.enqueue(x as never);
            c.close();
          },
        }),
      };
    },
  });
}

type ToolCall = { toolName: string; input: object };

let callIds = 0;

/** A step that calls these tools, in parallel. */
export const callTools = (...calls: ToolCall[]) => [
  ...calls.map((c) => ({
    type: "tool-call",
    toolCallId: `call-${callIds++}`,
    toolName: c.toolName,
    input: JSON.stringify(c.input),
  })),
  { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
];

export const answer = (text: string) => [
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
  { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
];

/** The text of each tool result the model was sent on its `step`th call, by tool name. */
export function toolResultsSent(model: ReturnType<typeof scriptedModel>, step: number): Record<string, string> {
  const prompt = model.doStreamCalls[step].prompt;
  const results = prompt.flatMap((m) => (m.role === "tool" ? m.content : []));
  return Object.fromEntries(
    results.flatMap((r) => (r.type === "tool-result" && r.output.type === "text" ? [[r.toolName, r.output.value]] : [])),
  );
}

type Result = { ok: true; kind?: string } | Failure;

/** Narrows a tool result to its success (of `kind`, when given), failing the test with the tool's own message otherwise. */
export function expectOk<T extends Result>(r: T): Extract<T, { ok: true }>;
export function expectOk<T extends Result, K extends NonNullable<Extract<T, { ok: true }>["kind"]>>(
  r: T,
  kind: K,
): Extract<T, { ok: true; kind: K }>;
export function expectOk(r: Result, kind?: string) {
  if (!r.ok) throw new Error(failureText(r));
  if (kind !== undefined) expect(r.kind).toBe(kind);
  return r;
}

export function expectFail<T extends Result>(r: T, kind?: Failure["kind"]): Extract<T, { ok: false }> {
  if (r.ok) throw new Error(`expected a failure, got ${JSON.stringify(r).slice(0, 200)}`);
  if (kind !== undefined) expect(r.kind).toBe(kind);
  return r as Extract<T, { ok: false }>;
}
