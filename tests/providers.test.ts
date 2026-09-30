import { createOpenAI } from "@ai-sdk/openai";
import { describe, expect, test } from "vitest";
import { BUDGET, runAgent } from "@/lib/agent";
import { anthropicModel, openaiModel } from "@/lib/model";
import { tools } from "@/lib/tools";

type Body = Record<string, unknown> & {
  system?: { cache_control?: unknown }[];
  messages?: { content: { cache_control?: unknown }[] }[];
};

function capture() {
  const bodies: Body[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "captured" } }), { status: 400 });
  };
  return { bodies, fetch: fetch as typeof globalThis.fetch };
}

describe("the Anthropic request", () => {
  test("marks the system prompt with a 1h cache breakpoint and only the newest message with a 5m one", async () => {
    const { bodies, fetch } = capture();
    const model = anthropicModel("claude-opus-5-5", { apiKey: "test", fetch });
    const r = runAgent({
      model,
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "again" },
      ],
    });
    await r.consumeStream({ onError: () => {} });
    const body = bodies[0];
    expect(body.system?.at(-1)?.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    const marks = (body.messages ?? []).flatMap((m) => m.content.filter((c) => c.cache_control));
    expect(marks.length).toBe(1);
    expect(body.messages?.at(-1)?.content.at(-1)?.cache_control).toEqual({ type: "ephemeral" });
    expect(body.tools).toHaveLength(Object.keys(tools).length);
    // non-strict is Anthropic's default, so no strict field: the cached tool bytes stay unchanged
    expect((body.tools as Record<string, unknown>[]).some((t) => "strict" in t)).toBe(false);
    expect(JSON.stringify(body)).toMatch(/"effort":"high"/);
  });
});

describe("the Anthropic answer step", () => {
  test("keeps the tools, part of the cached prefix, and sets Anthropic's own tool_choice none", async () => {
    const { bodies, fetch } = capture();
    const model = anthropicModel("claude-opus-5-5", { apiKey: "test", fetch });
    let t = 0;
    // the deadline has passed before the first step, so step one is the answer step
    const r = runAgent({ model, messages: [{ role: "user", content: "hi" }], now: () => (t += BUDGET.deadlineMs) });
    await r.consumeStream({ onError: () => {} });
    const body = bodies[0];
    expect(body.tools).toHaveLength(Object.keys(tools).length);
    expect(body.tool_choice).toEqual({ type: "none" });
  });
});

describe("the OpenAI request", () => {
  test("is a Responses call with every tool, non-strict, and no cache markers", async () => {
    const { bodies, fetch } = capture();
    const model = openaiModel("gpt-6-sol", createOpenAI({ apiKey: "test", fetch }));
    const r = runAgent({ model, messages: [{ role: "user", content: "hi" }] });
    await r.consumeStream({ onError: () => {} });
    const body = bodies[0];
    expect(Array.isArray(body.input)).toBe(true);
    expect(body.tools).toHaveLength(Object.keys(tools).length);
    expect(JSON.stringify(body)).toContain("<rules_reference>");
    expect(JSON.stringify(body)).not.toContain("cache_control");
    // strict mode would make every optional filter required
    expect((body.tools as { strict?: boolean }[]).every((t) => t.strict === false)).toBe(true);
    expect(JSON.stringify(body)).toMatch(/"effort":"medium"/);
  });
});
