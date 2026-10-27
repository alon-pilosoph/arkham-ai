"use client";

import { AssistantChatTransport } from "@assistant-ui/ai-sdk";
import { AssistantRuntimeProvider, ThreadListPrimitive, ThreadPrimitive } from "@assistant-ui/react";
import { SquarePenIcon } from "lucide-react";
import { useState } from "react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ThreadListSidebar } from "@/components/assistant-ui/elements/threadlist-sidebar.aui";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { CardDialogProvider } from "@/components/cards/card-dialog";
import { DeckSlots } from "@/components/settings/deck-slots";
import { TabooSwitch } from "@/components/settings/taboo-switch";
import { useArkhamTools } from "@/components/tools/tool-ui";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useChatName } from "@/hooks/use-chat-name";
import { useStoredChatRuntime } from "@/hooks/use-chat-runtime";
import { useDesktopPointer } from "@/hooks/use-desktop-pointer";
import { readSettings, useSettings } from "@/hooks/use-settings";
import { trimHistory } from "@/lib/history";

const EXAMPLES: { title: string; prompt: string }[] = [
  { title: "A rules question", prompt: "Does doom on an enemy count toward the agenda's doom threshold?" },
  { title: "What a card does", prompt: "What does Ward of Protection do at each level?" },
  { title: "How to run a deck", prompt: "How do I play Lily Chen's Boom Chakra Lacka deck?" },
  {
    title: "Replace a card",
    prompt: "In the Carolyn Fern Destroys Carcosa deck, what could replace Archive of Conduits with something cheaper?",
  },
  { title: "Find a deck", prompt: "Suggest a mystic cluever deck." },
  { title: "Find a partner", prompt: "My partner plays Lily Chen's Boom Chakra Lacka. What should I play with them?" },
];

// Disables attachments: overrides the AI SDK's default adapter.
const ADAPTERS = { attachments: undefined };

const Welcome = () => (
  <div className="mb-6 flex min-w-0 flex-col">
    <h1 className="text-2xl font-medium tracking-tight text-balance">What are you playing tonight?</h1>
    <p className="text-muted-foreground mt-1">
      Ask about a rule, a card or a deck. Answers come from the Rules Reference and ArkhamDB.
    </p>
    <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {EXAMPLES.map((e, i) => (
        <ThreadPrimitive.Suggestion
          key={e.title}
          prompt={e.prompt}
          send
          render={
            <button
              type="button"
              className={`bg-muted/50 hover:bg-muted focus-visible:ring-ring/50 flex cursor-pointer flex-col gap-1 rounded-xl p-4 text-start text-sm transition-colors outline-none focus-visible:ring-[3px] ${i >= 4 ? "max-sm:hidden" : ""}`}
            />
          }
        >
          <span className="font-medium">{e.title}</span>
          <span className="text-muted-foreground line-clamp-2">{e.prompt}</span>
        </ThreadPrimitive.Suggestion>
      ))}
    </div>
  </div>
);

const Header = ({ taboo, onTaboo }: { taboo: boolean; onTaboo: (on: boolean) => void }) => {
  const { state, isMobile } = useSidebar();
  const sidebarHidden = isMobile || state === "collapsed";
  const name = useChatName() || (sidebarHidden ? "Arkham assistant" : "");
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 max-md:h-14 max-md:px-2">
      <SidebarTrigger className="max-md:size-10" />
      {sidebarHidden ? (
        <ThreadListPrimitive.New
          render={<TooltipIconButton tooltip="New chat" variant="ghost" className="size-9 max-md:size-10" />}
        >
          <SquarePenIcon />
        </ThreadListPrimitive.New>
      ) : null}
      {name ? (
        <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto max-md:hidden" />
      ) : null}
      <span className="min-w-0 truncate font-medium">{name}</span>
      <div className="ms-auto flex shrink-0 items-center gap-2">
        <DeckSlots />
        <TabooSwitch on={taboo} onChange={onTaboo} />
      </div>
    </header>
  );
};

export const Assistant = () => {
  const { settings, update } = useSettings();
  const [transport] = useState(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        body: () => ({ settings: readSettings() }),
        // the server trims too; this keeps old tool results off the wire
        prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId, requestMetadata }) => ({
          body: { ...body, id, messages: trimHistory(messages), trigger, messageId, metadata: requestMetadata },
        }),
      }),
  );
  const runtime = useStoredChatRuntime(transport, ADAPTERS);
  const aui = useArkhamTools();
  const autoFocus = useDesktopPointer();

  return (
    <AssistantRuntimeProvider runtime={runtime} aui={aui}>
      <SidebarProvider>
        <CardDialogProvider>
          <div className="flex h-dvh w-full md:pr-0.5">
            <ThreadListSidebar />
            <SidebarInset>
              <Header taboo={settings.taboo} onTaboo={(taboo) => update({ taboo })} />
              <div className="flex-1 overflow-hidden">
                <Thread welcome={<Welcome />} autoFocus={autoFocus} />
              </div>
            </SidebarInset>
          </div>
        </CardDialogProvider>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
};
