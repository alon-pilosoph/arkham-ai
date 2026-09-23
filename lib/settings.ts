import { z } from "zod";

export const SettingsSchema = z.object({
  taboo: z.boolean(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = { taboo: false };
