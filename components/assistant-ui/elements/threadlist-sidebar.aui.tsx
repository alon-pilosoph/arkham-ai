import { ExternalLinkIcon, MessagesSquare } from "lucide-react";
import type * as React from "react";
import { AccountMenu } from "@/components/account/account-menu";
import { ThreadList } from "@/components/assistant-ui/elements/thread-list.aui";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export function ThreadListSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader className="aui-sidebar-header border-b">
        <div className="aui-sidebar-header-content flex items-center justify-between">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<a href="/" />}>
                <div className="aui-sidebar-header-icon-wrapper bg-sidebar-primary text-sidebar-primary-foreground dark:bg-sidebar-accent dark:text-sidebar-accent-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <MessagesSquare className="aui-sidebar-header-icon size-4" />
                </div>
                <div className="aui-sidebar-header-heading me-6 flex flex-col gap-0.5 leading-none">
                  <span className="aui-sidebar-header-title font-semibold">Arkham assistant</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>
      <SidebarContent className="aui-sidebar-content px-2 pt-2">
        <ThreadList />
      </SidebarContent>
      {props.collapsible !== "none" && <SidebarRail />}
      <SidebarFooter className="aui-sidebar-footer border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<a href="https://arkhamdb.com" target="_blank" rel="noopener noreferrer" />}
              className="text-muted-foreground"
            >
              <ExternalLinkIcon />
              <span>ArkhamDB</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <AccountMenu />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
