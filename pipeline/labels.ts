import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { IndexRowSchema } from "@/lib/index/schema";
import { ROOT } from "./cache";

export const LABEL_DIR = path.join(ROOT, "data", "deck-labels");

export const DeckLabelSchema = z
  .object({ id: z.number().int().positive() })
  .extend(IndexRowSchema.pick({ role: true, secondaryRole: true, archetypes: true, summary: true }).shape)
  .strict()
  .refine((l) => l.secondaryRole !== l.role, { message: "secondaryRole repeats role" })
  .refine((l) => new Set(l.archetypes).size === l.archetypes.length, { message: "an archetype is listed twice" })
  .refine((l) => !l.summary.includes("\n"), { message: "summary is more than one line" });

export type DeckLabel = z.infer<typeof DeckLabelSchema>;

export const LabelFileSchema = z.object({ investigator: z.string().min(1), decks: z.array(DeckLabelSchema) }).strict();

export type LabelFile = z.infer<typeof LabelFileSchema>;

export function labelFileName(code: string, name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${code}-${slug}.json`;
}

export function readLabels(): Map<number, DeckLabel & { filedUnder: string }> {
  const labels = new Map<number, DeckLabel & { filedUnder: string }>();
  if (!fs.existsSync(LABEL_DIR)) return labels;
  for (const file of fs
    .readdirSync(LABEL_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const parsed = LabelFileSchema.safeParse(JSON.parse(fs.readFileSync(path.join(LABEL_DIR, file), "utf8")));
    if (!parsed.success) throw new Error(`data/deck-labels/${file}: ${z.prettifyError(parsed.error)}`);
    const filedUnder = file.split("-")[0];
    for (const label of parsed.data.decks) {
      const earlier = labels.get(label.id);
      if (earlier) throw new Error(`deck ${label.id} is labeled in both ${earlier.filedUnder} and ${file}`);
      labels.set(label.id, { ...label, filedUnder });
    }
  }
  return labels;
}
