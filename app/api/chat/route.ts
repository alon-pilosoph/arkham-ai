import {
  APICallError,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { campaignNote, OUT_OF_TIME_ANSWER, runAgent, toModelMessages } from "@/lib/agent";
import { loadCampaign } from "@/lib/campaign/store";
import { getCards } from "@/lib/cards";
import { errorMessage } from "@/lib/format";
import { languageModel } from "@/lib/model";
import { takeQuestion } from "@/lib/question-cap";
import { currentUser, SIGNED_OUT } from "@/lib/session";
import { DEFAULT_SETTINGS, SettingsSchema } from "@/lib/settings";
import type { CampaignContext, ToolContext } from "@/lib/tool-context";

// Vercel Hobby's max. Segment config must be a literal, so tests/route.test.ts keeps it above BUDGET.deadlineMs.
export const maxDuration = 300;

// Warm the card cache at module load, but not while `next build` only analyses the module.
if (process.env.NEXT_PHASE !== "phase-production-build") getCards().catch(() => {});

// The page sends a trimmed history (lib/history.ts): text only, at most HISTORY_MESSAGES
// messages, well under bodyBytes. The cap bounds what one request can make the model read.
const LIMITS = { bodyBytes: 512_000, messages: 100, textChars: 8_000 };

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
  /** The campaign the chat is in; loaded here, for a member only. */
  campaignId: z.string().max(100).optional(),
});

// Provider messages (billing, keys, quotas) stay in the server log, never the chat.
function errorText(error: unknown): string {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  if (status === 429) return "The model is busy right now. Try again in a minute.";
  if (status === 401 || status === 403) return "The assistant can't reach its model. Its API key needs attention.";
  if (status !== undefined && status >= 500) return "The model's service had a problem. Try again.";
  return "Something went wrong while answering. Try again.";
}

function parseJson(bytes: ArrayBuffer): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const user = await currentUser(req.headers);
  if (!user) return SIGNED_OUT();
  const tooLarge = () => new Response("This chat is too long to send. Start a new chat.", { status: 413 });
  if (Number(req.headers.get("content-length")) > LIMITS.bodyBytes) return tooLarge();
  const body = await req.arrayBuffer().catch(() => null);
  if (body && body.byteLength > LIMITS.bodyBytes) return tooLarge();
  const parsed = RequestSchema.safeParse(body && parseJson(body));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (at ${issue.path.join(".")})` : "";
    return new Response(`Bad request: ${issue?.message ?? "invalid body"}${where}`, { status: 400 });
  }
  // a campaign's own taboo switch wins over the page's
  let campaign: CampaignContext | null = null;
  if (parsed.data.campaignId) {
    const view = await loadCampaign(user.id, parsed.data.campaignId);
    if (!view) return new Response("You aren't in that campaign.", { status: 404 });
    campaign = { ...view, askerId: user.id };
  }
  const settings: ToolContext = {
    ...DEFAULT_SETTINGS,
    ...parsed.data.settings,
    ...(campaign ? { taboo: campaign.taboo } : {}),
    campaign,
  };
  if (!(await takeQuestion(user.id)))
    return new Response("That's today's questions used up for this account. Ask again tomorrow.", { status: 429 });

  let model: LanguageModel;
  try {
    model = await languageModel();
  } catch (e) {
    return new Response(errorMessage(e), { status: 500 });
  }

  let messages: ModelMessage[];
  try {
    const store = campaign ? await getCards() : null;
    const note = campaign && store ? campaignNote(campaign, (code) => store.get(code)?.name) : undefined;
    messages = await toModelMessages(parsed.data.messages as unknown as UIMessage[], settings, undefined, note);
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
    onError: (error) => console.error("chat: answer failed", error),
  });
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const done = new Promise<void>((resolve) => {
        writer.merge(
          result.toUIMessageStream({
            sendReasoning: true,
            // also called again with the text it returned, so it must not log
            onError: errorText,
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
