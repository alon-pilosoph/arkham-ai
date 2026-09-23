"use client";

import { useSyncExternalStore } from "react";

const DESKTOP = "(min-width: 768px) and (pointer: fine)";

// False on the server and until hydration. Autofocus is desktop-only: on a phone it raises the keyboard.
export function useDesktopPointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const q = matchMedia(DESKTOP);
      q.addEventListener("change", onChange);
      return () => q.removeEventListener("change", onChange);
    },
    () => matchMedia(DESKTOP).matches,
    () => false,
  );
}
