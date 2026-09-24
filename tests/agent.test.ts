import type { UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, test, vi } from "vitest";
import { anchorTurn, BUDGET, FINAL_NOTE, runAgent, TOOL_BUDGET_SPENT, toModelMessages, turnNote } from "@/lib/agent";
import { getJson } from "@/lib/arkhamdb";
import { OUT_OF_TIME } from "@/lib/deadline";
import { HISTORY_MESSAGES, trimHistory } from "@/lib/history";
import { mockArkhamDB } from "./helpers";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

type Script = (call: number) => unknown[];

function scripted(script: Script) {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const chunks = script(call++);
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
  return model;
}

const toolCall = (id: string, toolName: string, input: object) => [
  { type: "tool-call", toolCallId: id, toolName, input: JSON.stringify(input) },
  { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
];
const say = (text: string) => [
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
  { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
];

type Msg = {
  role: string;
  content: unknown;
  providerOptions?: { anthropic?: { cacheControl?: { type: string; ttl?: string } } };
};

describe("the agent loop", () => {
  test("calls a tool, reads its text, then answers", async () => {
    const model = scripted((n) =>
      n === 0 ? toolCall("c1", "cards", { query: "Ward of Protection" }) : say("It cancels a treachery."),
    );
    const result = runAgent({ model, messages: [{ role: "user", content: "What does Ward of Protection do?" }] });
    expect(await result.text).toBe("It cancels a treachery.");
    expect(model.doStreamCalls.length).toBe(2);

    const [first, second] = model.doStreamCalls.map((c) => c.prompt as Msg[]);
    expect(first[0].role).toBe("system");
    expect(String(first[0].content)).toMatch(/<rules_reference>/);
    expect(first[0].providerOptions?.anthropic?.cacheControl?.ttl).toBe("1h");
    const marked = (p: Msg[]) => p.slice(1).filter((m) => m.providerOptions?.anthropic?.cacheControl).length;
    expect(marked(first)).toBe(1);
    expect(marked(second)).toBe(1);
    expect(second[second.length - 1].providerOptions?.anthropic?.cacheControl).toBeTruthy();
    // the tool's text rendering, not its JSON
    expect(JSON.stringify(second[second.length - 1])).toMatch(/Ward of Protection \(2\)/);
    expect(second[0].content).toBe(first[0].content);
  });

  test("a wrong card code in the answer is corrected against the real card data", async () => {
    const model = scripted(() => say("Try [Shrivelling (3)](https://arkhamdb.com/card/60104) for the extra damage."));
    const result = runAgent({ model, messages: [{ role: "user", content: "What should I upgrade?" }] });
    expect(await result.text).toBe("Try [Shrivelling (3)](https://arkhamdb.com/card/02154) for the extra damage.");
  });

  test("the last step is reserved for the answer", async () => {
    let n = 0;
    const model = scripted(() => toolCall(`c${n++}`, "cards", { query: "Machete" }));
    const result = runAgent({ model, messages: [{ role: "user", content: "loop forever" }] });
    await result.consumeStream();
    const calls = model.doStreamCalls;
    const toolCalls = calls.length - 1;
    expect(calls.length).toBeLessThanOrEqual(BUDGET.maxSteps);
    expect(toolCalls).toBeLessThanOrEqual(BUDGET.maxToolCalls);
    const last = calls[calls.length - 1];
    expect(last.toolChoice).toEqual({ type: "none" });
    expect(JSON.stringify(last.prompt)).toContain(FINAL_NOTE.slice(1, 40));
    for (const c of calls.slice(0, -1)) expect(c.toolChoice?.type).not.toBe("none");
  });

  test("one step's parallel calls are capped as they run, past the cap without doing work", async () => {
    const many = Array.from({ length: BUDGET.maxToolCalls + 6 }, (_, i) => ({
      type: "tool-call",
      toolCallId: `p${i}`,
      toolName: "deck",
      input: JSON.stringify({ ref: "33170" }),
    }));
    const model = scripted((n) =>
      n === 0 ? [...many, { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage }] : say("done"),
    );
    const fetched = mockArkhamDB();
    const result = runAgent({ model, messages: [{ role: "user", content: "read it twenty times" }] });
    await result.consumeStream();
    const results = (await result.steps)[0].toolResults.map((r) => JSON.stringify(r.output));
    expect(results.length).toBe(BUDGET.maxToolCalls + 6);
    expect(results.filter((r) => r.includes(TOOL_BUDGET_SPENT)).length).toBe(6);
    expect(fetched.length).toBe(BUDGET.maxToolCalls);
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain(`ERROR: ${TOOL_BUDGET_SPENT}`);
    expect(model.doStreamCalls[1].toolChoice).toEqual({ type: "none" });
  });

  test("tools stop when the deadline is near, leaving a tool step and the answer room", async () => {
    let t = 0;
    const lastToolStep = BUDGET.deadlineMs - BUDGET.answerReserveMs - BUDGET.toolStepMs;
    const model = scripted((n) => {
      // step 0 ends just before the last moment a tool step may start, step 1 just after
      t = n === 0 ? lastToolStep : lastToolStep + 1;
      return toolCall(`c${n}`, "cards", { query: "Machete" });
    });
    const result = runAgent({ model, messages: [{ role: "user", content: "slow" }], now: () => t });
    await result.consumeStream();
    expect(model.doStreamCalls.map((c) => c.toolChoice?.type)).toEqual(["auto", "auto", "none"]);
  });

  test("tool fetches carry the answer's signal, and stop when the player leaves", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      if (init.signal) signals.push(init.signal);
      return new Response("", { status: 200 });
    });
    const leave = new AbortController();
    const model = scripted((n) => (n === 0 ? toolCall("c1", "deck", { ref: "404404" }) : say("not found")));
    const result = runAgent({ model, messages: [{ role: "user", content: "deck 404404" }], abortSignal: leave.signal });
    await result.consumeStream();
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.aborted)).toBe(false);
    leave.abort();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  test("a fetch cut by the answer's signal says it ran out of time, as an ERROR", async () => {
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    });
    const r = getJson("/api/public/deck/1", 20_000, AbortSignal.timeout(10));
    expect(await r).toEqual({
      ok: false,
      status: "error",
      message: `https://arkhamdb.com/api/public/deck/1 failed: ${OUT_OF_TIME}`,
    });
  });
});

describe("history", () => {
  const ui = (id: string, role: "user" | "assistant", parts: UIMessage["parts"]): UIMessage => ({ id, role, parts });

  test("earlier turns keep their words, not their evidence", () => {
    const messages = [
      ui("1", "user", [{ type: "text", text: "Read deck 33170" }]),
      ui("2", "assistant", [
        {
          type: "tool-deck",
          toolCallId: "x",
          state: "output-available",
          input: { ref: "33170" },
          output: { big: "result" },
        } as UIMessage["parts"][number],
        { type: "text", text: "It is a stance fighter." },
      ]),
      ui("3", "user", [{ type: "text", text: "And a partner?" }]),
    ];
    const trimmed = trimHistory(messages);
    expect(trimmed[1].parts.map((p) => p.type)).toEqual(["text"]);
    expect(trimmed[2].parts[0]).toEqual({ type: "text", text: "And a partner?" });
  });

  test("the window never starts on an answer whose question was cut", () => {
    const text = (t: string) => [{ type: "text" as const, text: t }];
    // keeping the last HISTORY_MESSAGES would start on the first answer
    const long = Array.from({ length: HISTORY_MESSAGES + 1 }, (_, i) =>
      ui(`${i}`, i % 2 === 0 ? "user" : "assistant", text(`m${i}`)),
    );
    const trimmed = trimHistory(long);
    expect(trimmed[0].role).toBe("user");
    expect(trimmed[0].parts).toEqual(text("m2"));
    expect(trimmed.at(-1)?.parts).toEqual(text(`m${HISTORY_MESSAGES}`));
    expect(trimHistory([ui("a", "assistant", text("hello"))])).toEqual([]);
  });

  test("the date and the settings go on the newest user message only", async () => {
    const messages = await toModelMessages(
      [
        ui("1", "user", [{ type: "text", text: "first" }]),
        ui("2", "assistant", [{ type: "text", text: "ok" }]),
        ui("3", "user", [{ type: "text", text: "second" }]),
      ],
      { taboo: true },
      "2026-09-22",
    );
    expect(JSON.stringify(messages[0])).not.toContain("2026-09-22");
    expect(JSON.stringify(messages[2])).toContain("(Today is 2026-09-22. Taboo list: on, the current list.)");
    expect(turnNote("2026-09-22", { taboo: false })).toBe("(Today is 2026-09-22. Taboo list: off.)");
    expect(anchorTurn([], "x")).toEqual([]);
  });

  test("the tools receive the players' settings", async () => {
    const model = scripted((n) => (n === 0 ? toolCall("c1", "cards", { code: "02002" }) : say("done")));
    const off = runAgent({ model, messages: [{ role: "user", content: "Rex?" }], settings: { taboo: false } });
    await off.consumeStream();
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).not.toContain("taboo list 010");

    const model2 = scripted((n) => (n === 0 ? toolCall("c1", "cards", { code: "02002" }) : say("done")));
    const on = runAgent({ model: model2, messages: [{ role: "user", content: "Rex?" }], settings: { taboo: true } });
    await on.consumeStream();
    expect(JSON.stringify(model2.doStreamCalls[1].prompt)).toContain("taboo list 010");
  });
});
