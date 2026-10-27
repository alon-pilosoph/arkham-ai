"use client";

import type { ToolCallMessagePartStatus } from "@assistant-ui/react";
import { InfoIcon, type LucideIcon, SearchXIcon, TriangleAlertIcon } from "lucide-react";
import { Children, Component, type FC, Fragment, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import { useCardClick } from "@/components/cards/card-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { ItemDescription } from "@/components/ui/item";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type CardFace, type TabooChange, tabooChangeText } from "@/lib/card-text";
import type { Failure } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CLASS_TOKENS, KEYCAP, SYMBOL_PUNCT, symbolLabel, symbolsToCode } from "./symbols";

const CLASS_COLOR: Record<string, string> = {
  guardian: "bg-sky-600 dark:bg-sky-500",
  seeker: "bg-amber-500 dark:bg-amber-400",
  rogue: "bg-emerald-600",
  mystic: "bg-violet-600 dark:bg-violet-500",
  survivor: "bg-red-600 dark:bg-red-500",
  neutral: "bg-zinc-500 dark:bg-zinc-400",
};

export const Dot: FC<{ cls: string }> = ({ cls }) => (
  <span
    role="img"
    aria-label={cls}
    title={cls}
    className={cn("inline-block size-2 shrink-0 rounded-full", CLASS_COLOR[cls] ?? "bg-zinc-400")}
  />
);

export const Dots: FC<{ classes: string[] }> = ({ classes }) => (
  <span className="flex w-2 shrink-0 flex-col gap-0.5 pt-1.5">
    {classes.map((c) => (
      <Dot key={c} cls={c} />
    ))}
  </span>
);

export const Link: FC<{ href: string; children: ReactNode; className?: string }> = ({ href, children, className }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    onClick={useCardClick(href)}
    className={cn("underline decoration-dotted underline-offset-2 hover:decoration-solid", className)}
  >
    {children}
  </a>
);

export const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

export const GameText: FC<{ text: string; className?: string }> = ({ text, className }) => {
  // U+2060 word joiner keeps an opening quote on the line with what it quotes
  const src = text.replaceAll(" | ", "\n").replace(/(^|\s)"(?=\S)/g, '$1"\u2060');
  const parts: ReactNode[] = [];
  let at = 0;
  for (const m of src.matchAll(SYMBOL_PUNCT)) {
    if (m.index > at) parts.push(<Fragment key={at}>{src.slice(at, m.index)}</Fragment>);
    parts.push(
      CLASS_TOKENS.has(m[1]) ? (
        <Fragment key={m.index}>{capital(m[1]) + m[2]}</Fragment>
      ) : (
        <span key={m.index} className="whitespace-nowrap">
          <Kbd className={KEYCAP}>{symbolLabel(m[1])}</Kbd>
          {m[2]}
        </span>
      ),
    );
    at = m.index + m[0].length;
  }
  if (at < src.length) parts.push(<Fragment key={at}>{src.slice(at)}</Fragment>);
  return <p className={cn("whitespace-pre-line", className)}>{parts}</p>;
};

// ArkhamDB rulings link to its own relative /rules/ pages, which don't resolve here: keep the text.
export const RulingsText: FC<{ text: string }> = ({ text }) => {
  const md = symbolsToCode(text.replace(/\[([^\]]+)\]\(\/rules\/[^)]*\)/g, "$1"), SYMBOL_PUNCT);
  return (
    <div className="text-foreground/80 text-sm [&_li]:mt-1 [&_ul]:list-disc [&_ul]:ps-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ children }) => <Kbd className={KEYCAP}>{children}</Kbd>,
          a: ({ href, children }) => (href ? <Link href={href}>{children}</Link> : children),
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  );
};

export const TabooNote: FC<{ taboo: TabooChange }> = ({ taboo }) => (
  <div className="text-sm">
    <Badge variant="secondary" className="me-1.5">
      Taboo {taboo.list}
    </Badge>
    <GameText className="inline" text={tabooChangeText(taboo)} />
  </div>
);

export const TabooWarning: FC<{ error?: string }> = ({ error }) =>
  error ? (
    <Alert className="py-1.5">
      <TriangleAlertIcon />
      <AlertDescription className="text-xs">
        The taboo list is on but couldn't be loaded, so these cards are shown as printed.
      </AlertDescription>
    </Alert>
  ) : null;

export const NotOwned: FC = () => <Badge variant="secondary">Not owned</Badge>;

export const CardMeta: FC<{ card: Pick<CardFace, "type" | "cost" | "slot">; className?: string; children?: ReactNode }> = ({
  card,
  className,
  children,
}) => (
  <ItemDescription className={cn("text-xs", className)}>
    {[capital(card.type), card.cost != null ? `cost ${card.cost}` : "", card.slot ?? ""].filter(Boolean).join(", ")}
    {children}
  </ItemDescription>
);

export const ListItem: FC<{ children: ReactNode }> = ({ children }) => (
  // biome-ignore lint/a11y/useSemanticElements: ItemGroup is a div with role="list", where an <li> is invalid
  <div role="listitem">{children}</div>
);

// A popover, not a tooltip, so it opens on touch.
export const BadgePopover: FC<{ label: ReactNode; children: ReactNode }> = ({ label, children }) => (
  <Popover>
    <PopoverTrigger
      className={cn(
        badgeVariants({ variant: "outline" }),
        "relative cursor-pointer pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5",
      )}
    >
      {label}
    </PopoverTrigger>
    <PopoverContent className="w-80 text-sm">{children}</PopoverContent>
  </Popover>
);

const RUNNING: ToolCallMessagePartStatus = { type: "running" };
export const DONE: ToolCallMessagePartStatus = { type: "complete" };
const failed = (error?: string): ToolCallMessagePartStatus => ({ type: "incomplete", reason: "error", error });

export const Tool: FC<{
  status: ToolCallMessagePartStatus;
  label: ReactNode;
  meta?: ReactNode;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  children?: ReactNode;
}> = ({ status, label, meta, icon, defaultOpen, children }) => {
  const error = status.type === "incomplete" && status.error != null;
  const expandable = Children.toArray(children).length > 0 || error;
  return (
    <ToolFallback.Root defaultOpen={defaultOpen}>
      <ToolFallback.Trigger
        toolName=""
        status={status}
        label={label}
        meta={meta}
        icon={icon}
        expandable={expandable}
        className={expandable ? "w-full" : undefined}
      />
      {expandable ? (
        <ToolFallback.Content>
          <ToolFallback.Error status={status} />
          {children}
        </ToolFallback.Content>
      ) : null}
    </ToolFallback.Root>
  );
};

export const Pending: FC<{ status: ToolCallMessagePartStatus; label: string }> = ({ status, label }) =>
  status.type === "running" ? (
    <Tool status={RUNNING} label={label} />
  ) : (
    <Tool status={{ type: "incomplete", reason: "cancelled" }} label={label} meta="Stopped" />
  );

export const NotFound: FC<{ label: string; detail?: string; children?: ReactNode }> = ({ label, detail, children }) => {
  const inline = detail && detail.length <= 80 && !children;
  return (
    <Tool status={DONE} icon={SearchXIcon} label={label} meta={inline ? detail : undefined} defaultOpen>
      {detail && !inline ? <p className="text-muted-foreground">{detail}</p> : null}
      {children}
    </Tool>
  );
};

export const Info: FC<{ label: string; children?: ReactNode }> = ({ label, children }) => (
  <Tool status={DONE} icon={InfoIcon} label={label} defaultOpen>
    {children}
  </Tool>
);

export const FailureRow: FC<{ failure: Failure; notFound: string; error: string }> = ({ failure, notFound, error }) =>
  failure.kind === "not_found" ? (
    <NotFound label={notFound} detail={failure.message} />
  ) : (
    <Tool status={failed(failure.message)} label={error} />
  );

// Persisted threads can hold result shapes this build no longer renders.
export class ToolBoundary extends Component<{ label: string; children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    if (!this.state.broken) return this.props.children;
    return <Tool status={{ type: "incomplete", reason: "error" }} label={`${this.props.label}: this result can't be shown`} />;
  }
}
