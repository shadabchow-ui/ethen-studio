"use client";

import { useLayoutEffect } from "react";
import { applyThemePreference, readThemePreference } from "./theme-store";

/**
 * Post-hydration theme sync (M3).
 *
 * The pre-hydration bootstrap in app/layout.tsx resolves the unified
 * `ethen-theme` preference onto <html> before first paint. React 19 hydration
 * then patches the <html> element's attributes back to the client-rendered
 * values, which on heavy pages (e.g. the Design Lab) strips `data-theme` /
 * `.dark` / `colorScheme` after the initial paint.
 *
 * This component re-applies the SAME resolved theme inside useLayoutEffect —
 * synchronously in the hydration commit, before the browser paints — so the
 * bootstrap state is restored with zero visible flash and zero geometry
 * change. Re-applying an identical value is idempotent.
 */
export function ThemeHydrationSync() {
  useLayoutEffect(() => {
    applyThemePreference(readThemePreference());
  }, []);
  return null;
}
