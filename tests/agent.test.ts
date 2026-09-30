import type { UIMessage } from "ai";
import { describe, expect, test, vi } from "vitest";
import { anchorTurn, BUDGET, FINAL_NOTE, runAgent, TOOL_BUDGET_SPENT, toModelMessages, turnNote } from "@/lib/agent";
import { getJson } from "@/lib/arkhamdb";
import { OUT_OF_TIME } from "@/lib/deadline";
import { HISTORY_MESSAGES, trimHistory } from "@/lib/history";
import { answer, callTools, DECK, mockArkhamDB, scriptedModel, toolResultsSent } from "./helpers";

type Msg = {
  role: string;
  content: unknown;
  providerOptions?: { anthropic?: { cacheControl?: { type: string; ttl?: string } } };
};

const ask = (content: string) => [{ role: "user" as const, content }];
const lookUp = (query: string) => callTools({ toolName: "cards", input: { query } });

describe("runAgent", () => {
  test("calls a tool, sends the model the tool's text rendering, then answers", async () => {
    const model = scriptedModel((step) => (step === 0 ? lookUp("Ward of Protection") : answer("It cancels a treachery.")));
    const result = runAgent({ model, messages: ask("What does Ward of Protection do?") });
    expect(await result.text).toBe("It cancels a treachery.");
    expect(model.doStreamCalls.length).toBe(2);
    expect(toolResultsSent(model, 1).cards).toMatch(/^1 card name match "Ward of Protection"[\s\S]*Ward of Protection \(2\)/);
  });

  test("sends the same system prompt on every step, with a 1h cache mark, and marks the newest message 5m", async () => {
    const model = scriptedModel((step) => (step === 0 ? lookUp("Machete") : answer("done")));
    await runAgent({ model, messages: ask("Machete?") }).consumeStream();
    const [first, second] = model.doStreamCalls.map((c) => c.prompt as Msg[]);
    expect(first[0].role).toBe("system");
    expect(String(first[0].content)).toContain("<rules_reference>");
    expect(second[0].content).toBe(first[0].content);
    for (const prompt of [first, second]) {
      expect(prompt[0].providerOptions?.anthropic?.cacheControl).toEqual({ type: "ephemeral", ttl: "1h" });
      const marked = prompt.slice(1).filter((m) => m.providerOptions?.anthropic?.cacheControl);
      expect(marked).toEqual([prompt.at(-1)]);
      expect(prompt.at(-1)?.providerOptions?.anthropic?.cacheControl).toEqual({ type: "ephemeral" });
    }
  });

  test("corrects a card link whose code is wrong against the card set", async () => {
    // 60104 is Self-Destructive; Shrivelling (3) is 02154
    const model = scriptedModel(() => answer("Try [Shrivelling (3)](https://arkhamdb.com/card/60104) for the extra damage."));
    const result = runAgent({ model, messages: ask("What should I upgrade?") });
    expect(await result.text).toBe("Try [Shrivelling (3)](https://arkhamdb.com/card/02154) for the extra damage.");
  });

  test("hands the players' settings to the tools", async () => {
    // list 010 adds a once-per-round limit to Rex Murphy
    const rexWith = async (taboo: boolean) => {
      const model = scriptedModel((step) =>
        step === 0 ? callTools({ toolName: "cards", input: { code: "02002" } }) : answer("done"),
      );
      await runAgent({ model, messages: ask("Rex?"), settings: { taboo } }).consumeStream();
      return toolResultsSent(model, 1).cards;
    };
    expect(await rexWith(true)).toContain("taboo: taboo list 010");
    expect(await rexWith(false)).not.toMatch(/taboo/i);
  });
});

describe("runAgent budgets", () => {
  test("reserves the last step for the answer, with tools off and the final note sent", async () => {
    const model = scriptedModel(() => lookUp("Machete"));
    await runAgent({ model, messages: ask("loop forever") }).consumeStream();
    const calls = model.doStreamCalls;
    expect(calls.length).toBe(BUDGET.maxSteps);
    expect(calls.slice(0, -1).map((c) => c.toolChoice?.type)).toEqual(Array(BUDGET.maxSteps - 1).fill("auto"));
    const last = calls[calls.length - 1];
    expect(last.toolChoice).toEqual({ type: "none" });
    expect(last.prompt.at(-1)).toMatchObject({ role: "user", content: [{ type: "text", text: FINAL_NOTE }] });
  });

  test("caps one step's parallel calls as they run: calls past the cap do no work and say so", async () => {
    const extra = 6;
    const reads = Array.from({ length: BUDGET.maxToolCalls + extra }, () => ({
      toolName: "deck",
      input: { ref: DECK.lilyChen },
    }));
    const model = scriptedModel((step) => (step === 0 ? callTools(...reads) : answer("done")));
    const fetched = mockArkhamDB();
    const result = runAgent({ model, messages: ask("read it twenty times") });
    await result.consumeStream();
    const outputs = (await result.steps)[0].toolResults.map((r) => JSON.stringify(r.output));
    expect(outputs.length).toBe(BUDGET.maxToolCalls + extra);
    expect(outputs.filter((r) => r.includes(TOOL_BUDGET_SPENT)).length).toBe(extra);
    expect(fetched.length).toBe(BUDGET.maxToolCalls);
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain(`ERROR: ${TOOL_BUDGET_SPENT}`);
    expect(model.doStreamCalls[1].toolChoice).toEqual({ type: "none" });
  });

  test("stops tools near the deadline, leaving room for one tool step and the answer", async () => {
    let t = 0;
    const lastToolStep = BUDGET.deadlineMs - BUDGET.answerReserveMs - BUDGET.toolStepMs;
    const model = scriptedModel((step) => {
      // step 0 ends just before the last moment a tool step may start, step 1 just after
      t = step === 0 ? lastToolStep : lastToolStep + 1;
      return lookUp("Machete");
    });
    await runAgent({ model, messages: ask("slow"), now: () => t }).consumeStream();
    expect(model.doStreamCalls.map((c) => c.toolChoice?.type)).toEqual(["auto", "auto", "none"]);
  });
});

describe("runAgent cancellation", () => {
  test("gives tool fetches the answer's signal, which aborts when the player leaves", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      if (init.signal) signals.push(init.signal);
      return new Response("", { status: 200 });
    });
    const leave = new AbortController();
    const model = scriptedModel((step) => (step === 0 ? callTools({ toolName: "deck", input: { ref: "404404" } }) : answer("")));
    await runAgent({ model, messages: ask("deck 404404"), abortSignal: leave.signal }).consumeStream();
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.aborted)).toBe(false);
    leave.abort();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});

describe("getJson", () => {
  test("reports a fetch cut by the answer's signal as an ERROR that ran out of time", async () => {
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    });
    expect(await getJson("/api/public/deck/1", 20_000, AbortSignal.timeout(10))).toEqual({
      ok: false,
      status: "error",
      message: `https://arkhamdb.com/api/public/deck/1 failed: ${OUT_OF_TIME}`,
    });
  });
});

const ui = (id: string, role: "user" | "assistant", parts: UIMessage["parts"]): UIMessage => ({ id, role, parts });
const text = (t: string) => [{ type: "text" as const, text: t }];

describe("trimHistory", () => {
  test("keeps earlier turns' words but drops their tool results", () => {
    const messages = [
      ui("1", "user", text("Read deck 33170")),
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
      ui("3", "user", text("And a partner?")),
    ];
    expect(trimHistory(messages).map((m) => m.parts)).toEqual([
      text("Read deck 33170"),
      text("It is a stance fighter."),
      text("And a partner?"),
    ]);
  });

  test("never starts the window on an answer whose question was cut", () => {
    // keeping the last HISTORY_MESSAGES would start on the first answer, m1
    const long = Array.from({ length: HISTORY_MESSAGES + 1 }, (_, i) =>
      ui(`${i}`, i % 2 === 0 ? "user" : "assistant", text(`m${i}`)),
    );
    const trimmed = trimHistory(long);
    expect(trimmed[0]).toMatchObject({ role: "user", parts: text("m2") });
    expect(trimmed.at(-1)?.parts).toEqual(text(`m${HISTORY_MESSAGES}`));
  });

  test("keeps nothing when no question is left", () => {
    expect(trimHistory([ui("a", "assistant", text("hello"))])).toEqual([]);
  });
});

describe("the per-turn note", () => {
  test("states the date and the taboo setting", () => {
    expect(turnNote("2026-09-22", { taboo: true })).toBe("(Today is 2026-09-22. Taboo list: on, the current list.)");
    expect(turnNote("2026-09-22", { taboo: false })).toBe("(Today is 2026-09-22. Taboo list: off.)");
  });

  test("goes on the newest user message only, so earlier turns keep their cached bytes", async () => {
    const messages = await toModelMessages(
      [ui("1", "user", text("first")), ui("2", "assistant", text("ok")), ui("3", "user", text("second"))],
      { taboo: true },
      "2026-09-22",
    );
    expect(JSON.stringify(messages.slice(0, 2))).not.toContain("2026-09-22");
    expect(messages[2].content).toEqual([
      { type: "text", text: "(Today is 2026-09-22. Taboo list: on, the current list.)" },
      { type: "text", text: "second" },
    ]);
    expect(anchorTurn([], "note")).toEqual([]);
  });
});
