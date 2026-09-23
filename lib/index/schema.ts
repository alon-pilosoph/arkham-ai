// Kept apart from the index JSON so the pipeline can import it while those files are stale.

import { z } from "zod";
import { ARCHETYPE_NAMES } from "../archetypes";

export const ROLES = ["fighter", "cluever", "flex", "support"] as const;
export type Role = (typeof ROLES)[number];
const RoleSchema = z.enum(ROLES);

export const CLASSES = ["guardian", "seeker", "rogue", "mystic", "survivor", "neutral"] as const;

const SUMMARY_MAX_CHARS = 240;

export const IndexRowSchema = z.object({
  deckId: z.number().int().positive(),
  name: z.string(),
  investigator: z.string().min(1),
  investigatorCode: z.string().min(1),
  class: z.enum(CLASSES),
  published: z.iso.date(),
  xp: z.number().int().nonnegative(),
  xpTaboo: z.number().int().nonnegative(),
  tabooLegal: z.boolean(),
  tabooList: z.string().min(1),
  role: RoleSchema,
  secondaryRole: RoleSchema.nullable(),
  archetypes: z.array(z.enum(ARCHETYPE_NAMES)).max(3),
  summary: z.string().min(1).max(SUMMARY_MAX_CHARS),
  tags: z.array(z.string()),
  likes: z.number().int().nonnegative(),
  /** Original-printing codes (CardStore.canonical). */
  cards: z.array(z.string()).min(1),
});

export type IndexRow = z.infer<typeof IndexRowSchema>;

export function roleText(d: Pick<IndexRow, "role" | "secondaryRole">): string {
  return d.secondaryRole ? `${d.role}, also ${d.secondaryRole}` : d.role;
}

export type UsageCounts = { decks: number; cards: Record<string, number> };

export type CardUsage = {
  minLikes: number;
  investigators: Record<string, UsageCounts>;
  classes: Record<string, UsageCounts>;
};
