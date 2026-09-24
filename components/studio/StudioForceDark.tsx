"use client";

import { useLayoutEffect } from "react";

/**
 * V5 M1 — Studio is always the dark creative console (Owner Lock C).
 *
 * The shared theme bootstrap and ThemeHydrationSync resolve the viewer's
 * stored/OS preference onto <html>. Studio pins the RENDERED theme to dark
 * without touching the stored preference (Chat and Platform keep theirs):
 * the pre-paint script below runs first in <body>, and this guard re-applies
 * dark after hydration and whenever something flips <html> back to light
 * (e.g. an OS theme change handled by the shared bootstrap listener).
 */
export const STUDIO_FORCE_DARK_SCRIPT = `try{var r=document.documentElement;r.dataset.theme="dark";r.classList.add("dark");r.style.colorScheme="dark";r.dataset.studioTheme="dark";}catch(e){}`;

function applyDark(root: HTMLElement): void {
  if (root.dataset.theme !== "dark") root.dataset.theme = "dark";
  if (!root.classList.contains("dark")) root.classList.add("dark");
  if (root.style.colorScheme !== "dark") root.style.colorScheme = "dark";
  root.dataset.studioTheme = "dark";
}

export function StudioForceDark() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    applyDark(root);
    const observer = new MutationObserver(() => applyDark(root));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
