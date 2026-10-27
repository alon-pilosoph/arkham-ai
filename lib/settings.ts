import { z } from "zod";

/** A deck a player saved as theirs or their partner's, with what the UI shows for it. The name
 *  is its author's, so it reaches the model only as untrusted text. */
export const SavedDeckSchema = z.object({
  id: z.number().int().positive(),
  kind: z.enum(["decklist", "deck"]),
  name: z.string().max(200),
  investigator: z.string().max(100),
});

export type SavedDeck = z.infer<typeof SavedDeckSchema>;

export const SettingsSchema = z.object({
  taboo: z.boolean(),
  myDeck: SavedDeckSchema.nullable(),
  partnerDeck: SavedDeckSchema.nullable(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = { taboo: false, myDeck: null, partnerDeck: null };
