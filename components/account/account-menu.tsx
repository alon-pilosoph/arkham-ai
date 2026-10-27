"use client";

import { LogOutIcon } from "lucide-react";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

/** Who is signed in, and signing out, at the foot of the sidebar. */
export function AccountMenu() {
  const { data } = authClient.useSession();
  const signOut = async () => {
    await authClient.signOut();
    window.location.assign("/sign-in");
  };
  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={signOut} className="text-muted-foreground" tooltip="Sign out">
        <LogOutIcon />
        <span className="min-w-0 truncate">{data ? `Sign out ${data.user.email}` : "Sign out"}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
