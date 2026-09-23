import {
  APICallError,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { OUT_OF_TIME_ANSWER, runAgent, toModelMessages } from "@/lib/agent";
import { getCards } from "@/lib/cards";
import { errorMessage } from "@/lib/format";
import { languageModel } from "@/lib/model";
import { DEFAULT_SETTINGS, SettingsSchema } from "@/lib/settings";

// Vercel Hobby's max. Segment config must be a literal, so tests/route.test.ts keeps it above BUDGET.deadlineMs.
export const maxDuration = 300;

// Warm the card cache at module load, but not while `next build` only analyses the module.
if (process.env.NEXT_PHASE !== "phase-production-build") getCards().catch(() => {});

const LIMITS = { messages: 100, textChars: 8_000 };

// No system role, so a client can't inject instructions. Assistant parts are validated later by
// convertToModelMessages.
const UserMessage = z.looseObject({
  role: z.literal("user"),
  parts: z.array(z.looseObject({ type: z.literal("text"), text: z.string().min(1).max(LIMITS.textChars) })).min(1),
});
const AssistantMessage = z.looseObject({ role: z.literal("assistant"), parts: z.array(z.unknown()).min(1) });

const RequestSchema = z.object({
  messages: z
    .array(z.discriminatedUnion("role", [UserMessage, AssistantMessage]))
    .min(1)
    .max(LIMITS.messages),
  // partial, so a tab opened before a setting was added still gets answers
  settings: SettingsSchema.partial().optional(),
});

// Provider messages (billing, keys, quotas) stay in the server log, never the chat.
function errorText(error: unknown): string {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  if (status === 429) return "The model is busy right now. Try again in a minute.";
  if (status === 401 || status === 403) return "The assistant can't reach its model. Its API key needs attention.";
  if (status !== undefined && status >= 500) return "The model's service had a problem. Try again.";
  return "Something went wrong while answering. Try again.";
}

export async function POST(req: Request) {
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (at ${issue.path.join(".")})` : "";
    return new Response(`Bad request: ${issue?.message ?? "invalid body"}${where}`, { status: 400 });
  }
  const settings = { ...DEFAULT_SETTINGS, ...parsed.data.settings };

  let model: LanguageModel;
  try {
    model = await languageModel();
  } catch (e) {
    return new Response(errorMessage(e), { status: 500 });
  }

  let messages: ModelMessage[];
  try {
    messages = await toModelMessages(parsed.data.messages as unknown as UIMessage[], settings);
  } catch (e) {
    return new Response(`Bad request: ${errorMessage(e)}`, { status: 400 });
  }
  if (!messages.length) return new Response("Bad request: no question to answer", { status: 400 });
  let timedOut = false;
  const result = runAgent({
    model,
    messages,
    settings,
    abortSignal: req.signal,
    onDeadline: () => {
      timedOut = true;
    },
  });
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const done = new Promise<void>((resolve) => {
        writer.merge(
          result.toUIMessageStream({
            sendReasoning: true,
            onError: (error) => {
              console.error("chat: answer failed", error);
              return errorText(error);
            },
            onFinish: () => resolve(),
          }),
        );
      });
      await done;
      // an answer cut off at the deadline would otherwise end silently, with no text
      if (timedOut) writer.write({ type: "error", errorText: OUT_OF_TIME_ANSWER });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
