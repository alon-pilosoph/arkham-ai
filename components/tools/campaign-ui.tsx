"use client";

import { type ToolCallMessagePartComponent, useAui } from "@assistant-ui/react";
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ProposeCampaignInput, ProposeCampaignResult } from "@/lib/tools/propose-campaign";
import { DONE, FailureRow, Pending, Tool, ToolBoundary } from "./parts";

/** The question a new campaign's first chat asks, left here for the page it opens. */
export const firstQuestionKey = (campaignId: string) => `arkham:first-question:${campaignId}`;

/** The two ways to start a campaign. */
export const OfferCampaignSetupUI: ToolCallMessagePartComponent<Record<string, never>, { ok: true }> = () => {
  const aui = useAui();
  const [chose, setChose] = useState(false);
  return (
    <ToolBoundary label="Start a campaign">
      <Tool status={DONE} label="Start a campaign" defaultOpen>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={chose}
            onClick={() => {
              setChose(true);
              aui.thread().append("Let's set it up here in the chat.");
            }}
          >
            Set it up in chat
          </Button>
          <a href="/campaigns" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Set it up myself
          </a>
        </div>
      </Tool>
    </ToolBoundary>
  );
};

type State = "checking" | "open" | "creating" | "discarded" | { campaignId: string } | { error: string };

const discardKey = (id: string) => `arkham:discarded:${id}`;

/** A campaign ready to create. Creating opens a chat inside it; a card already used links there. */
export const ProposeCampaignUI: ToolCallMessagePartComponent<ProposeCampaignInput, ProposeCampaignResult> = ({
  result,
  status,
}) => {
  const [state, setState] = useState<State>("checking");
  const proposal = result?.ok ? result : null;

  useEffect(() => {
    if (!proposal) return;
    const id = proposal.start.proposalId;
    if (localStorage.getItem(discardKey(id))) return setState("discarded");
    fetch(`/api/campaigns?proposal=${encodeURIComponent(id)}`)
      .then((r) => r.json() as Promise<{ campaignId: string | null }>)
      .then((r) => setState(r.campaignId ? { campaignId: r.campaignId } : "open"))
      .catch(() => setState("open"));
  }, [proposal]);

  if (!result) return <Pending status={status} label="Preparing a campaign" />;
  if (!proposal)
    return <FailureRow failure={result as never} notFound="Nothing to create" error="Couldn't propose that campaign" />;

  const create = async () => {
    setState("creating");
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proposal.start),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; campaignId?: string; error?: string };
    if (!body.ok || !body.campaignId) return setState({ error: body.error ?? "Couldn't create it. Try again." });
    if (proposal.ask) sessionStorage.setItem(firstQuestionKey(body.campaignId), proposal.ask);
    window.location.assign(`/?campaign=${encodeURIComponent(body.campaignId)}`);
  };
  const discard = () => {
    localStorage.setItem(discardKey(proposal.start.proposalId), "1");
    setState("discarded");
  };

  const created = typeof state === "object" && "campaignId" in state ? state.campaignId : null;
  const failed = typeof state === "object" && "error" in state ? state.error : null;
  const meta = created ? "Created" : state === "discarded" ? "Discarded" : "Not created yet";
  return (
    <ToolBoundary label="A new campaign">
      <Tool status={DONE} label="A new campaign" meta={meta} defaultOpen>
        <div className="flex flex-col gap-3 text-sm">
          <ul className={`flex flex-col gap-1 ${state === "discarded" ? "text-muted-foreground line-through" : ""}`}>
            {proposal.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {failed ? (
            <p role="alert" className="text-destructive">
              {failed}
            </p>
          ) : null}
          {created ? (
            <p className="text-muted-foreground inline-flex items-center gap-1">
              <CheckIcon className="size-4" /> Created.{" "}
              <a href={`/?campaign=${created}`} className="underline underline-offset-2">
                Open its chats
              </a>
            </p>
          ) : state === "open" || failed ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={create}>
                Create campaign
              </Button>
              <Button size="sm" variant="ghost" onClick={discard}>
                Discard
              </Button>
            </div>
          ) : state === "creating" ? (
            <p className="text-muted-foreground">Creating…</p>
          ) : null}
        </div>
      </Tool>
    </ToolBoundary>
  );
};
