import {
  convertToModelMessages,
  isStepCount,
  type LanguageModel,
  type ModelMessage,
  type StreamTextTransform,
  streamText,
  type UIMessage,
} from "ai";
import { getCards } from "./cards";
import { withSignal } from "./deadline";
import { toolError } from "./format";
import { trimHistory } from "./history";
import { repairLinks } from "./link-repair";
import { SYSTEM_PROMPT } from "./prompt";
import { DEFAULT_SETTINGS, type Settings } from "./settings";
import { type ToolName, tools } from "./tools";

export const BUDGET = {
  maxSteps: 10,
  maxToolCalls: 14,
  /** Under the chat route's maxDuration (300 s), leaving room for startup and closing the stream. */
  deadlineMs: 270_000,
  answerReserveMs: 60_000,
  toolStepMs: 60_000,
};

export const TOOL_BUDGET_SPENT = "the tool budget for this answer is spent";
export const OUT_OF_TIME_ANSWER = "This answer ran out of time. Try again, or ask a narrower question.";
const TOOL_TIME_SPENT = "the time for tools in this answer is spent";

const CACHE = { anthropic: { cacheControl: { type: "ephemeral" as const } } };
const CACHE_LONG = { anthropic: { cacheControl: { type: "ephemeral" as const, ttl: "1h" as const } } };

export const FINAL_NOTE =
  "[The tool budget for this answer is spent. Answer now from what the tools returned, and say plainly what you could not check.]";

export function turnNote(today: string, settings: Settings): string {
  return `(Today is ${today}. Taboo list: ${settings.taboo ? "on, the current list" : "off"}.)`;
}

export function anchorTurn(messages: ModelMessage[], note: string): ModelMessage[] {
  const i = messages.findLastIndex((m) => m.role === "user");
  if (i < 0) return messages;
  const m = messages[i];
  const anchor = { type: "text" as const, text: note };
  const content = typeof m.content === "string" ? [anchor, { type: "text" as const, text: m.content }] : [anchor, ...m.content];
  return messages.map((x, j) => (j === i ? ({ ...m, content } as ModelMessage) : x));
}

function withCacheMarker(messages: ModelMessage[]): ModelMessage[] {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1];
  return [...messages.slice(0, -1), { ...last, providerOptions: { ...last.providerOptions, ...CACHE } } as ModelMessage];
}

export async function toModelMessages(
  ui: UIMessage[],
  settings: Settings = DEFAULT_SETTINGS,
  today = new Date().toISOString().slice(0, 10),
): Promise<ModelMessage[]> {
  return anchorTurn(await convertToModelMessages(trimHistory(ui)), turnNote(today, settings));
}

/** Wraps only execute: the tool definitions are cached prompt bytes and must stay unchanged. */
function budgetedTools(signal: AbortSignal) {
  let used = 0;
  const wrapped = Object.fromEntries(
    Object.entries(tools).map(([name, t]) => {
      const execute = t.execute as (input: unknown, options: { abortSignal?: AbortSignal }) => Promise<unknown>;
      return [
        name,
        {
          ...t,
          execute: async (input: unknown, options: { abortSignal?: AbortSignal }) => {
            used++;
            if (used > BUDGET.maxToolCalls) return toolError(TOOL_BUDGET_SPENT);
            if (signal.aborted) return toolError(TOOL_TIME_SPENT);
            return withSignal(signal, () => execute(input, { ...options, abortSignal: signal }));
          },
        },
      ];
    }),
  ) as unknown as typeof tools;
  return { tools: wrapped, used: () => used };
}

function linkRepairTransform(): StreamTextTransform<typeof tools> {
  return () => {
    const buffers = new Map<string, string>();
    let store: ReturnType<typeof getCards> | undefined;
    return new TransformStream({
      async transform(chunk, controller) {
        if (chunk.type === "text-start") {
          buffers.set(chunk.id, "");
          controller.enqueue(chunk);
          return;
        }
        if (chunk.type === "text-delta") {
          buffers.set(chunk.id, (buffers.get(chunk.id) ?? "") + chunk.text);
          return;
        }
        if (chunk.type === "text-end") {
          const text = buffers.get(chunk.id) ?? "";
          buffers.delete(chunk.id);
          let fixed = text;
          try {
            store ??= getCards();
            fixed = repairLinks(text, await store);
          } catch {
            fixed = text;
          }
          controller.enqueue({ type: "text-delta", id: chunk.id, text: fixed });
          controller.enqueue(chunk);
          return;
        }
        controller.enqueue(chunk);
      },
    });
  };
}

export function runAgent(opts: {
  model: LanguageModel;
  messages: ModelMessage[];
  settings?: Settings;
  abortSignal?: AbortSignal;
  now?: () => number;
  /** Called if the answer is cut off at the deadline (not when the player leaves). */
  onDeadline?: () => void;
  /** Called once per failure; without it the AI SDK logs the error itself. */
  onError?: (error: unknown) => void;
}) {
  const settings = opts.settings ?? DEFAULT_SETTINGS;
  const toolsContext = Object.fromEntries(Object.keys(tools).map((name) => [name, settings])) as Record<ToolName, Settings>;
  const now = opts.now ?? Date.now;
  const deadline = now() + BUDGET.deadlineMs;
  const remaining = () => deadline - now();
  // Real timers, even when a test injects now().
  const within = (ms: number) => AbortSignal.any([...(opts.abortSignal ? [opts.abortSignal] : []), AbortSignal.timeout(ms)]);
  const budgeted = budgetedTools(within(BUDGET.deadlineMs - BUDGET.answerReserveMs));
  const cutOff = within(BUDGET.deadlineMs);
  cutOff.addEventListener("abort", () => {
    if (!opts.abortSignal?.aborted) opts.onDeadline?.();
  });
  // Ends the loop after the answer step even if the model ignores toolChoice "none".
  let finalIssued = false;
  return streamText({
    model: opts.model,
    instructions: { role: "system", content: SYSTEM_PROMPT, providerOptions: CACHE_LONG },
    messages: opts.messages,
    tools: budgeted.tools,
    toolsContext,
    abortSignal: cutOff,
    onError: ({ error }) => opts.onError?.(error),
    experimental_transform: linkRepairTransform(),
    stopWhen: [isStepCount(BUDGET.maxSteps), () => finalIssued],
    prepareStep: ({ stepNumber, initialMessages, responseMessages }) => {
      const spent =
        stepNumber >= BUDGET.maxSteps - 1 ||
        budgeted.used() >= BUDGET.maxToolCalls ||
        remaining() < BUDGET.answerReserveMs + BUDGET.toolStepMs;
      const messages: ModelMessage[] = [...initialMessages, ...responseMessages];
      if (!spent) return { messages: withCacheMarker(messages) };
      finalIssued = true;
      return {
        messages: withCacheMarker([...messages, { role: "user", content: FINAL_NOTE }]),
        toolChoice: "none",
      };
    },
  });
}
