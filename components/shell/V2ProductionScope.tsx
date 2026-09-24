import type { ReactNode } from "react";

/**
 * Production V2 visual scope (M4).
 *
 * Loads no CSS of its own — `styles/ethen-v2/production.css` is imported
 * from the root layout and is inert outside `[data-ethen-v2]`. This wrapper
 * activates the approved token/material chain for a product route while
 * leaving AppShell and all product internals as the functional owners.
 *
 * `data-v2-theme="system"` follows the production bootstrap's resolved
 * `html[data-theme]`, so Dark / Light / System stay flash-free.
 */
export function V2ProductionScope({ children }: { children: ReactNode }) {
  return (
    <div data-ethen-v2 data-v2-theme="system" className="h-full">
      {children}
    </div>
  );
}
