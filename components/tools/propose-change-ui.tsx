"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ProposeInput, ProposeResult } from "@/lib/tools/propose-change";
import { DONE, FailureRow, Pending, Tool, ToolBoundary } from "./parts";

type State = "checking" | "open" | "applying" | "applied" | "discarded" | { error: string };

const discardKey = (id: string) => `arkham:discarded:${id}`;

/** A proposed campaign change: what it does, and Apply or Discard. Applied is read back from the
 *  campaign, so every member's chat shows it; Discard is this browser's alone. */
export const ProposeChangeUI: ToolCallMessagePartComponent<Partial<ProposeInput>, ProposeResult> = ({ result, status }) => {
  const [state, setState] = useState<State>("checking");
  const proposal = result?.ok ? result : null;

  useEffect(() => {
    if (!proposal) return;
    if (localStorage.getItem(discardKey(proposal.proposalId))) return setState("discarded");
    fetch(`/api/campaigns/${proposal.campaignId}/proposals/${proposal.proposalId}`)
      .then((r) => r.json() as Promise<{ changeId: string | null }>)
      .then((r) => setState(r.changeId ? "applied" : "open"))
      .catch(() => setState("open"));
  }, [proposal]);

  if (!result) return <Pending status={status} label="Preparing a change" />;
  if (!proposal)
    return <FailureRow failure={result as never} notFound="Nothing to change" error="Couldn't propose that change" />;

  const apply = async () => {
    setState("applying");
    const res = await fetch(`/api/campaigns/${proposal.campaignId}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.proposalId, version: proposal.version, change: proposal.change }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setState(body.ok ? "applied" : { error: body.error ?? "Couldn't apply it. Try again." });
  };
  const discard = () => {
    localStorage.setItem(discardKey(proposal.proposalId), "1");
    setState("discarded");
  };

  const meta = state === "applied" ? "Applied" : state === "discarded" ? "Discarded" : "Not applied yet";
  return (
    <ToolBoundary label="A campaign change">
      <Tool status={DONE} label="A campaign change" meta={meta} defaultOpen>
        <div className="flex flex-col gap-3 text-sm">
          <ul className={`flex flex-col gap-1 ${state === "discarded" ? "text-muted-foreground line-through" : ""}`}>
            {proposal.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {typeof state === "object" ? (
            <p role="alert" className="text-destructive">
              {state.error}
            </p>
          ) : null}
          {state === "applied" ? (
            <p className="text-muted-foreground inline-flex items-center gap-1">
              <CheckIcon className="size-4" /> Applied.{" "}
              <a href={`/campaigns/${proposal.campaignId}`} className="underline underline-offset-2">
                See the campaign
              </a>
            </p>
          ) : state === "open" || typeof state === "object" ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={apply}>
                Apply
              </Button>
              <Button size="sm" variant="ghost" onClick={discard}>
                Discard
              </Button>
            </div>
          ) : state === "applying" ? (
            <p className="text-muted-foreground">Applying…</p>
          ) : null}
        </div>
      </Tool>
    </ToolBoundary>
  );
};
