"use client";

/**
 * D15-J08 — EDS system shell entry point.
 *
 * Level-2 system frame for the 49 `D15_SYSTEM` internal rows, over
 * `EdsManagedShell`. Sidebar and launcher entries reuse the flagship
 * builders (single portfolio authority, never hard-coded); system pages are
 * not launcher products so no item is marked active. The page title feeds the
 * workspace label and the section label only — migrated pages keep their own
 * in-page headers, so the frame adds no duplicate heading.
 */
import * as React from "react";
import { EdsManagedShell } from "@ethen/ui/design-system/eds/shell";
import { EdsScope } from "@ethen/ui/design-system/eds/flagship";
import { buildEdsLauncherProducts, buildEdsSidebarItems } from "./EdsFlagshipShell";
import "@ethen/ui/design-system/eds/flagship/flagship-surface.css";

export function EdsSystemShell({
  title,
  hideSidebarOnNarrow = true,
  children,
}: {
  title: string;
  /**
   * The shell narrow-viewport convention (same contract as
   * EdsFlagshipShell): at or below 900px the inline sidebar leaves the
   * layout and the drawer becomes the single navigation presentation.
   * On by default (D15-J11B6) — a 256px inline sidebar against a 390px
   * viewport left system pages with a 134px content column and clipped
   * text. Pass `false` only for a surface that genuinely needs the
   * inline sidebar at narrow widths.
   */
  hideSidebarOnNarrow?: boolean;
  children: React.ReactNode;
}) {
  const launcherProducts = React.useMemo(() => buildEdsLauncherProducts(), []);
  const sidebarItems = React.useMemo(() => buildEdsSidebarItems(), []);
  return (
    <EdsScope>
      <EdsManagedShell
        sidebarItems={sidebarItems}
        launcherProducts={launcherProducts}
        workspaceLabel={title}
        hideSidebarOnNarrow={hideSidebarOnNarrow}
      >
        <section aria-label={title}>{children}</section>
      </EdsManagedShell>
    </EdsScope>
  );
}
