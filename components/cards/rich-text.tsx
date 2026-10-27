"use client";

import { createElement, type FC, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GameIcon, hasGlyph } from "./icons";

// ArkhamDB writes card text as a little HTML (<b>, <i>, <blockquote>...), [[Trait]] for a trait
// in bold italics, and [icon] for a game symbol. Only these become elements; any other tag is
// dropped and its text kept, and nothing is ever set as HTML.
const TOKEN =
  /<(\/?)(b|strong|i|em|u|cite|blockquote|span)\b[^>]*>|<br\s*\/?>|<hr\s*\/?>|<[^>]*>|\[\[([^\]]+)\]\]|\[([a-z_]+)\]|\n/g;

const ELEMENT: Record<string, { tag: string; className?: string }> = {
  b: { tag: "b", className: "font-semibold" },
  strong: { tag: "b", className: "font-semibold" },
  i: { tag: "i" },
  em: { tag: "i" },
  u: { tag: "span" },
  span: { tag: "span" },
  cite: { tag: "cite", className: "block text-end not-italic before:content-['—_']" },
  blockquote: { tag: "blockquote", className: "my-1 border-s-2 border-current/25 ps-3" },
};

type Frame = { name: string; children: ReactNode[] };

export function richNodes(src: string): ReactNode[] {
  const root: Frame = { name: "", children: [] };
  const stack: Frame[] = [root];
  const top = () => stack[stack.length - 1];
  let at = 0;
  let key = 0;
  const close = (frame: Frame) => {
    const el = ELEMENT[frame.name];
    top().children.push(createElement(el.tag, { key: key++, className: el.className }, ...frame.children));
  };
  for (const m of src.matchAll(TOKEN)) {
    if (m.index > at) top().children.push(src.slice(at, m.index));
    at = m.index + m[0].length;
    const [tok, slash, tag, trait, icon] = m;
    if (tag && !slash) stack.push({ name: tag, children: [] });
    else if (tag && slash) {
      // close up to the matching tag; a stray closing tag is ignored
      const i = stack.findLastIndex((f) => f.name === tag);
      if (i > 0) while (stack.length > i) close(stack.pop() as Frame);
    } else if (trait)
      top().children.push(
        <b key={key++} className="font-semibold italic">
          {trait}
        </b>,
      );
    else if (icon)
      top().children.push(hasGlyph(icon) ? <GameIcon key={key++} token={icon} className="mx-px align-[-0.1em]" /> : tok);
    else if (tok === "\n" || tok.startsWith("<br")) top().children.push(<br key={key++} />);
    else if (tok.startsWith("<hr")) top().children.push(<hr key={key++} className="my-2 border-current/20" />);
  }
  if (at < src.length) top().children.push(src.slice(at));
  while (stack.length > 1) close(stack.pop() as Frame);
  return root.children;
}

export const RichText: FC<{ text: string; className?: string }> = ({ text, className }) => (
  <div className={cn("leading-snug", className)}>{richNodes(text.trim())}</div>
);
