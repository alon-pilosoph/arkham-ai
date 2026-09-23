// ArkhamDB writes game symbols as [reaction], [elder_sign], [willpower]: in card text, rulings,
// and whatever a model copies from them into an answer.

const LABELS: Record<string, string> = {
  action: "Action",
  reaction: "Reaction",
  free: "Fast",
  fast: "Fast",
  elder_sign: "Elder Sign",
  elder_thing: "Elder Thing",
  auto_fail: "Auto-fail",
  per_investigator: "per investigator",
  wild: "Wild",
};

/** Class tokens are words on the card, not icons. */
export const CLASS_TOKENS = new Set(["guardian", "seeker", "rogue", "mystic", "survivor", "neutral"]);

const KNOWN = [
  ...Object.keys(LABELS),
  ..."willpower intellect combat agility skull cultist tablet bless curse frost".split(" "),
  ...CLASS_TOKENS,
];

// trailing punctuation is captured so it never wraps away from its symbol
export const SYMBOL_PUNCT = /\[([a-z_]+)\]([.,:;!?)"]*)/g;
// only known tokens, and never a markdown link's text: [deck](url)
const ANSWER_SYMBOL = new RegExp(`\\[(${KNOWN.join("|")})\\](?!\\()([.,:;!?)"]*)`, "g");

export function symbolLabel(token: string): string {
  return LABELS[token] ?? token.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export const SYMBOL_NAMES = new Set(KNOWN.filter((t) => !CLASS_TOKENS.has(t)).map(symbolLabel));

const capitalize = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** Markdown with each symbol as inline code, which the renderer draws as a keycap; U+2060 keeps
 *  punctuation on the symbol's line. */
export function symbolsToCode(md: string, pattern: RegExp = ANSWER_SYMBOL): string {
  return md.replace(pattern, (_, t: string, punct: string) =>
    CLASS_TOKENS.has(t) ? capitalize(t) + punct : `\`${symbolLabel(t)}\`${punct ? `⁠${punct}` : ""}`,
  );
}

export const KEYCAP = "text-foreground/80 align-baseline ring-1 ring-inset ring-border";
