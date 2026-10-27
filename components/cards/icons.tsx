// Imported by the client.

import type { FC } from "react";
import { symbolLabel } from "@/components/tools/symbols";
import { cn } from "@/lib/utils";

// ArkhamDB's arkham-icons font (app/fonts): one letter per game symbol. Its own CSS draws the
// class symbols from PNGs, but the font has them too, as d to h.
const GLYPH: Record<string, string> = {
  action: "i",
  reaction: "!",
  free: "j",
  fast: "j",
  lightning: "j",
  elder_sign: "o",
  eldersign: "o",
  elder_thing: "n",
  willpower: "p",
  intellect: "b",
  combat: "c",
  agility: "a",
  skull: "k",
  cultist: "l",
  tablet: "q",
  auto_fail: "m",
  bless: "v",
  curse: "w",
  frost: "x",
  null: "t",
  seal_a: "1",
  seal_b: "2",
  seal_c: "3",
  seal_d: "4",
  seal_e: "5",
  per_investigator: "u",
  unique: "s",
  rogue: "d",
  survivor: "e",
  guardian: "f",
  mystic: "g",
  seeker: "h",
};

export function hasGlyph(token: string): boolean {
  return token in GLYPH || token === "wild";
}

/** A game symbol; the wild icon is not in the font, so it is a bold "?" as on ArkhamDB. */
export const GameIcon: FC<{ token: string; className?: string }> = ({ token, className }) => {
  const glyph = GLYPH[token];
  const label = symbolLabel(token);
  if (!glyph)
    return (
      <span role="img" aria-label={label} title={label} className={cn("font-bold", className)}>
        ?
      </span>
    );
  return (
    <span role="img" aria-label={label} title={label} className={cn("font-icons leading-none not-italic", className)}>
      {glyph}
    </span>
  );
};

/** As in the ArkhamCards app; multiclass cards are gold. */
export const CLASS_HEX: Record<string, string> = {
  guardian: "#2b80c5",
  seeker: "#ec8426",
  rogue: "#107116",
  mystic: "#4331b9",
  survivor: "#cc3038",
  neutral: "#606060",
  multi: "#a38a2c",
  mythos: "#44403c",
};

export function classColor(classes: string[], encounter?: boolean): string {
  if (encounter) return CLASS_HEX.mythos;
  if (classes.length > 1) return CLASS_HEX.multi;
  return CLASS_HEX[classes[0]] ?? CLASS_HEX.neutral;
}
