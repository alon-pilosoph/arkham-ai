"use client";

import { type ReasoningMessagePartComponent, useScrollLock } from "@assistant-ui/react";
import { memo, useCallback, useRef } from "react";
import { MarkdownText } from "@/components/assistant-ui/elements/markdown-text";
import {
  ANIMATION_DURATION,
  ReasoningContent,
  ReasoningRoot as ReasoningRootBase,
  type ReasoningRootProps,
  ReasoningText,
  ReasoningTrigger,
} from "./reasoning";

function ReasoningRoot({ ref, onAnimationStart, ...props }: ReasoningRootProps) {
  const collapsibleRef = useRef<HTMLDivElement | null>(null);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const handleAnimationStart = useCallback(() => {
    lockScroll();
    onAnimationStart?.();
  }, [lockScroll, onAnimationStart]);

  const composedRef = useCallback(
    (node: HTMLDivElement | null) => {
      collapsibleRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  return <ReasoningRootBase ref={composedRef} onAnimationStart={handleAnimationStart} {...props} />;
}

const ReasoningImpl: ReasoningMessagePartComponent = () => <MarkdownText />;

const Reasoning = memo(ReasoningImpl);
Reasoning.displayName = "Reasoning";

export { Reasoning, ReasoningContent, ReasoningRoot, ReasoningText, ReasoningTrigger };
