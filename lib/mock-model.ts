import { MockLanguageModelV4 } from "ai/test";

type Chunk = Record<string, unknown>;

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

export function route(q: string): { toolName: string; input: Record<string, unknown> } {
  const deck = q.match(/(?:decklist\/view\/|deck\/view\/|deck\s+)(\d+)/i)?.[1] ?? q.match(/\b(\d{4,6})\b/)?.[1];
  if (deck && /partner|play with|pair|complement/i.test(q)) return { toolName: "recommendDecks", input: { pairWith: deck } };
  const replace = q.match(/replace\s+(.+?)(?:\s+with|\?|$)/i)?.[1];
  if (deck && replace)
    return { toolName: "replaceCard", input: { deck, card: replace.trim(), goal: /cheap/i.test(q) ? "cheaper" : "same_job" } };
  if (deck) return { toolName: "deck", input: { ref: deck } };
  const named = q.match(/how do i play (?:the )?(.+?)(?: deck)?\?/i)?.[1];
  if (named) return { toolName: "findDeck", input: { name: named } };
  if (/suggest|recommend|find me/i.test(q)) {
    const input: Record<string, unknown> = {};
    const cls = q.match(/guardian|seeker|rogue|mystic|survivor/i)?.[0];
    const role = q.match(/fighter|cluever|flex|support/i)?.[0];
    if (cls) input.class = cls.toLowerCase();
    if (role) input.role = role.toLowerCase();
    return { toolName: "recommendDecks", input };
  }
  const card = q.match(/does (.+?) do/i)?.[1] ?? q.replace(/[?.]$/, "");
  return { toolName: "cards", input: { query: card } };
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.map((p) => (p && typeof p === "object" && "text" in p ? String(p.text) : "")).join(" ");
  return "";
}

function stream(chunks: Chunk[]) {
  return {
    stream: new ReadableStream({
      start(c) {
        for (const x of chunks) c.enqueue(x as never);
        c.close();
      },
    }),
  };
}

export function mockModel() {
  return new MockLanguageModelV4({
    provider: "mock",
    modelId: "local",
    doStream: async ({ prompt }) => {
      const last = prompt[prompt.length - 1];
      if (last.role !== "tool") {
        const question = textOf(last.content).replace(/^\(Today is [\s\S]*?\.\)\s*/, "");
        const { toolName, input } = route(question);
        return stream([
          { type: "tool-call", toolCallId: `mock-${Date.now()}`, toolName, input: JSON.stringify(input) },
          { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
        ]);
      }
      const result = JSON.stringify(last.content);
      const text =
        "This is the local stand-in, not a model: it called one tool and did not read the result. " +
        `The tool returned ${result.length.toLocaleString()} characters, shown above. Set ANTHROPIC_API_KEY or OPENAI_API_KEY for real answers.`;
      return stream([
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: text },
        { type: "text-end", id: "t" },
        { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
      ]);
    },
  });
}
