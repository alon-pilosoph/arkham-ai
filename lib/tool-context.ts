// What every tool call knows besides its input: the players' settings, and, in a campaign's chat,
// the campaign as the chat route loaded it for a member. The route builds the campaign part
// itself; it never comes from the client.

import { z } from "zod";
import type { CampaignView } from "./campaign/store";
import { DEFAULT_SETTINGS, SettingsSchema } from "./settings";

export type CampaignContext = CampaignView & { askerId: string };

export const ToolContextSchema = SettingsSchema.extend({
  campaign: z
    .custom<CampaignContext>((v) => v === undefined || v === null || typeof v === "object")
    .nullable()
    .optional(),
});

export type ToolContext = z.infer<typeof ToolContextSchema>;

export const DEFAULT_CONTEXT: ToolContext = { ...DEFAULT_SETTINGS, campaign: null };
