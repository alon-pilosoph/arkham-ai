import { createAnthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { type LanguageModel, type LanguageModelMiddleware, wrapLanguageModel } from "ai";

export type Provider = "anthropic" | "openai" | "mock";

const DEFAULTS: Record<Provider, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-6-sol",
  mock: "local",
};

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

// Pinned at each provider's documented default, so a change of default can't silently change
// the answers (or make evals incomparable). ARKHAM_EFFORT overrides it.
export const EFFORT: Record<Exclude<Provider, "mock">, Effort> = { anthropic: "high", openai: "medium" };

type Spec = { provider: Provider; id: string; effort?: Effort };

function effortOf(env: NodeJS.ProcessEnv): Effort | undefined {
  const e = env.ARKHAM_EFFORT?.trim();
  if (!e) return undefined;
  if ((EFFORTS as readonly string[]).includes(e)) return e as Effort;
  throw new Error(`ARKHAM_EFFORT must be one of ${EFFORTS.join(", ")}, got "${e}"`);
}

export function modelSpec(env: NodeJS.ProcessEnv = process.env): Spec {
  const effort = effortOf(env);
  const spec = env.ARKHAM_MODEL?.trim();
  if (spec) {
    const [p, ...rest] = spec.split(":");
    if ((p === "anthropic" || p === "openai" || p === "mock") && rest.length) return { provider: p, id: rest.join(":"), effort };
    throw new Error(
      `ARKHAM_MODEL must look like "anthropic:${DEFAULTS.anthropic}" or "openai:${DEFAULTS.openai}", got "${spec}"`,
    );
  }
  if (env.ANTHROPIC_API_KEY) return { provider: "anthropic", id: DEFAULTS.anthropic, effort };
  if (env.OPENAI_API_KEY) return { provider: "openai", id: DEFAULTS.openai, effort };
  throw new Error("No model configured: set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local (and optionally ARKHAM_MODEL).");
}

const NO_TOOLS_HEADER = "x-arkham-tool-choice-none";

// The Anthropic AI SDK provider implements toolChoice "none" by dropping the tool list, which
// busts the cached prefix and makes Anthropic reject a history holding tool calls. Keep the
// tools and send Anthropic's own tool_choice {type: "none"} instead.
const keepToolsOnNone: LanguageModelMiddleware = {
  specificationVersion: "v4",
  transformParams: async ({ params }) =>
    params.toolChoice?.type === "none"
      ? { ...params, toolChoice: { type: "auto" }, headers: { ...params.headers, [NO_TOOLS_HEADER]: "1" } }
      : params,
};

function toolChoiceNoneFetch(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has(NO_TOOLS_HEADER) || typeof init?.body !== "string") return inner(input, init);
    headers.delete(NO_TOOLS_HEADER);
    const body = JSON.parse(init.body);
    body.tool_choice = { type: "none" };
    return inner(input, { ...init, headers, body: JSON.stringify(body) });
  };
}

function withEffort(provider: "anthropic" | "openai", effort: Effort): LanguageModelMiddleware {
  const options = provider === "anthropic" ? { effort } : { reasoningEffort: effort };
  return {
    specificationVersion: "v4",
    transformParams: async ({ params }) => ({
      ...params,
      providerOptions: { ...params.providerOptions, [provider]: { ...params.providerOptions?.[provider], ...options } },
    }),
  };
}

export function anthropicModel(id: string, opts: { apiKey?: string; fetch?: typeof fetch; effort?: Effort } = {}): LanguageModel {
  const provider = createAnthropic({
    ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
    fetch: toolChoiceNoneFetch(opts.fetch ?? fetch),
  });
  return wrapLanguageModel({
    model: provider(id),
    middleware: [keepToolsOnNone, withEffort("anthropic", opts.effort ?? EFFORT.anthropic)],
  });
}

// OpenAI's Responses API defaults function tools to strict, which makes every optional field
// required, so the model invents filters and searches come back empty. zod validates inputs anyway.
const nonStrictTools: LanguageModelMiddleware = {
  specificationVersion: "v4",
  transformParams: async ({ params }) => ({
    ...params,
    tools: params.tools?.map((t) => (t.type === "function" ? { ...t, strict: false } : t)),
  }),
};

export function openaiModel(id: string, provider = openai, effort: Effort = EFFORT.openai): LanguageModel {
  return wrapLanguageModel({ model: provider.responses(id), middleware: [nonStrictTools, withEffort("openai", effort)] });
}

/** Async so the mock's ai/test import stays out of the production bundle. */
export async function languageModel(spec = modelSpec()): Promise<LanguageModel> {
  if (spec.provider === "mock") return (await import("./mock-model")).mockModel();
  return spec.provider === "anthropic"
    ? anthropicModel(spec.id, { effort: spec.effort })
    : openaiModel(spec.id, openai, spec.effort);
}
