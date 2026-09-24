"use client";

/**
 * D15-J03 — EDS surface scope for migrated flagship routes.
 *
 * Every EDS component inherits its theme from a [data-eds] ancestor and
 * deliberately declares none itself. This scope is that ancestor.
 * `theme="auto"` follows the viewer's stored preference through the same
 * resolution the rest of the app uses; F-03 passes `"dark"` for its
 * approved dark-only direction (paired with the J02 route lock, which pins
 * the document theme so V2 chrome inside the route agrees).
 */
import * as React from "react";
import {
  SSR_RESOLVED_THEME,
  readResolvedThemeFromDocument,
  readThemePreference,
  resolveTheme,
  subscribeThemePreference,
  type ResolvedTheme,
} from "../../../theme/theme-store";

/**
 * Resolved theme on the client. Mirrors ThemeToggle: an explicit preference
 * resolves directly, and "system" reads the value the pre-hydration bootstrap
 * already applied to <html>, so the scope agrees with the document rather than
 * racing whoever updates it.
 */
function readResolvedTheme(): ResolvedTheme {
  const preference = readThemePreference();
  return preference === "system" ? readResolvedThemeFromDocument() : resolveTheme(preference);
}

export interface EdsScopeProps {
  theme?: ResolvedTheme | "auto" | "system";
  children?: React.ReactNode;
  className?: string;
}

export function EdsScope({ theme = "auto", children, className }: EdsScopeProps) {
  // D15-J11B6 — subscribe to the theme as an external store. The server
  // snapshot is SSR_RESOLVED_THEME so the hydrating tree matches the server
  // HTML; React then adopts the client snapshot, which is the contract
  // theme-store documents for every client component.
  //
  // Previously the initializer called readResolvedThemeFromDocument() during
  // render — it returns "dark" with no document — and the effect only
  // subscribed. subscribeThemePreference emits no initial value, so `resolved`
  // stayed "dark" until the viewer toggled the theme by hand, and
  // `theme="auto"` never actually followed the document. Every EDS surface
  // rendered its dark palette inside a light document, leaving dark islands in
  // the light shell (an unreadable Method/Source strip on /local-models at
  // 1.84:1) and the mixed palettes axe flagged on /ai-gateway.
  const resolved = React.useSyncExternalStore(
    subscribeThemePreference,
    readResolvedTheme,
    () => SSR_RESOLVED_THEME,
  );
  return (
    <div
      data-eds
      data-eds-theme={theme === "auto" ? resolved : theme}
      className={className}
    >
      {children}
    </div>
  );
}
