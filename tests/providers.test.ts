import { createOpenAI } from "@ai-sdk/openai";
import { describe, expect, test } from "vitest";
import { BUDGET, runAgent } from "@/lib/agent";
import { anthropicModel, openaiModel } from "@/lib/model";

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

describe("anthropic request", () => {
  test("the system prompt carries a 1h breakpoint and the newest message a 5m one", async () => {
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
    expect((body.tools as unknown[]).length).toBe(4);
    // non-strict is Anthropic's default, so no strict field: the cached tool bytes stay unchanged
    expect((body.tools as Record<string, unknown>[]).some((t) => "strict" in t)).toBe(false);
    expect(JSON.stringify(body)).toMatch(/"effort":"high"/);
  });
});

describe("anthropic answer step", () => {
  test("tools stay (the cached prefix) and tool_choice is Anthropic's own none", async () => {
    const { bodies, fetch } = capture();
    const model = anthropicModel("claude-opus-5-5", { apiKey: "test", fetch });
    let t = 0;
    // the deadline has passed before the first step, so step one is the answer step
    const r = runAgent({ model, messages: [{ role: "user", content: "hi" }], now: () => (t += BUDGET.deadlineMs) });
    await r.consumeStream({ onError: () => {} });
    const body = bodies[0];
    expect((body.tools as unknown[]).length).toBe(4);
    expect(body.tool_choice).toEqual({ type: "none" });
  });
});

describe("openai request", () => {
  test("the same loop is a valid Responses call with the four tools", async () => {
    const { bodies, fetch } = capture();
    const model = openaiModel("gpt-6-sol", createOpenAI({ apiKey: "test", fetch }));
    const r = runAgent({ model, messages: [{ role: "user", content: "hi" }] });
    await r.consumeStream({ onError: () => {} });
    const body = bodies[0];
    expect(Array.isArray(body.input)).toBe(true);
    expect((body.tools as unknown[]).length).toBe(4);
    expect(JSON.stringify(body)).toContain("<rules_reference>");
    expect(JSON.stringify(body)).not.toContain("cache_control");
    // strict mode would make every optional filter required
    expect((body.tools as { strict?: boolean }[]).every((t) => t.strict === false)).toBe(true);
    expect(JSON.stringify(body)).toMatch(/"effort":"medium"/);
  });
});
