"use client";

import { useSidebar } from "@/components/ui/sidebar";

export function useCloseMobileSheet(): () => void {
  const { isMobile, setOpenMobile } = useSidebar();
  return () => {
    if (isMobile) setOpenMobile(false);
  };
}
