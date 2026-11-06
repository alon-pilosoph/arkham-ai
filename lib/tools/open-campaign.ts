import { tool } from "ai";
import { z } from "zod";
import { currentInvite } from "../campaign/invites";
import { listCampaigns } from "../campaign/store";
import { type Failure, failureText, notFound, safely, toolError, toolText, untrusted } from "../format";
import { type ToolContext, ToolContextSchema } from "../tool-context";

export type OpenCampaignResult = { ok: true; campaigns: { id: string; name: string; invite?: string }[] } | Failure;

const inputSchema = z.object({
  name: z.string().optional().describe("The campaign the players mean; left out, this chat's campaign, or all of theirs"),
});

export type OpenCampaignInput = z.infer<typeof inputSchema>;

export async function openCampaign(input: OpenCampaignInput, context?: ToolContext): Promise<OpenCampaignResult> {
  if (!context?.userId) return toolError("Who is asking isn't known here.");
  const userId = context.userId;
  const theirs = await listCampaigns(userId);
  if (!theirs.length) return notFound("The players have no campaigns yet.");
  const wanted = input.name?.trim().toLowerCase();
  const here = context.campaign?.id;
  const found = theirs.filter((c) => (wanted ? c.name.toLowerCase().includes(wanted) : !here || c.id === here));
  if (!found.length) return notFound(`No campaign called "${input.name}". Theirs: ${theirs.map((c) => c.name).join(", ")}.`);
  const invite = found.length === 1 ? `/invite/${await currentInvite(found[0].id, userId)}` : undefined;
  return { ok: true, campaigns: found.map((c) => ({ id: c.id, name: c.name, ...(invite ? { invite } : {}) })) };
}

export const openCampaignTool = tool({
  description:
    "Show a card with links to a campaign: its chats, its page and, for one campaign, its invite link. Use it when the " +
    "players want to go to a campaign, start a chat in one, or invite someone, from any chat.",
  inputSchema,
  contextSchema: ToolContextSchema,
  execute: (input, { context }): Promise<OpenCampaignResult> => safely(() => openCampaign(input, context)),
  toModelOutput: ({ output }) =>
    toolText(
      output.ok
        ? `The players see a card with links to ${output.campaigns.map((c) => untrusted("campaign name", c.name)).join(", ")}.`
        : failureText(output),
    ),
});
