// M3 — V2 theme unification: the Design Lab consumes the production theme
// store. Preference initializes SYNCHRONOUSLY from the unified `ethen-theme`
// key (with legacy key migration), so there is no useEffect-delayed flash:
// the pre-hydration bootstrap in app/layout.tsx has already applied the
// resolved theme to <html> before first paint, and the hook's initializer
// reads storage during the first client render.
"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  readThemePreference,
  subscribeThemePreference,
  writeThemePreference,
  type ThemePreference,
} from "./theme-store";

export type { ThemePreference };

export function useThemePreference(): [ThemePreference, (next: ThemePreference) => void] {
  // Deterministic first render: SSR has no storage and always produces
  // "system", so the first CLIENT render must produce "system" too. Reading
  // localStorage in the initializer instead makes the hydrating tree differ
  // from the server HTML, which React can only recover from by discarding and
  // regenerating the tree (detaching every mounted node). The layout effect
  // below restores the stored preference synchronously before the browser
  // paints, so there is still no visible flash.
  const [preference, setPreference] = useState<ThemePreference>("system");

  // Re-apply on mount: React hydration can strip the bootstrap's <html>
  // attributes. Re-applying the same resolved theme is idempotent and runs
  // in useLayoutEffect, before the browser paints the hydrated tree.
  // Also keep OS-change reactivity while the preference is `system`, and
  // stay in sync with any other mounted control on this page.
  useLayoutEffect(() => {
    const sync = (next: ThemePreference) => {
      setPreference(next);
      applyThemePreference(next);
    };
    sync(readThemePreference());
    const unsubscribe = subscribeThemePreference(sync);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onOsChange = () => {
      if (readThemePreference() === "system") applyThemePreference("system");
    };
    media.addEventListener("change", onOsChange);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      sync(readThemePreference());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      media.removeEventListener("change", onOsChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((next: ThemePreference) => {
    writeThemePreference(next);
    applyThemePreference(next);
    setPreference(next);
  }, []);

  return [preference, update];
}
