"use client";

/**
 * EDS AppShell — D09 candidate.
 *
 * One universal shell composed from caller-provided slots: sidebar, topbar,
 * workspace/main, optional complementary/evidence slot. Product names, routes
 * and lifecycle states arrive through caller-provided props sourced from the
 * portfolio authority — never hard-coded here. Use EdsManagedShell for the
 * data-driven convenience path (sidebar items + launcher products).
 */
import * as React from "react";

export interface EdsAppShellProps {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  drawer?: React.ReactNode;
  overlays?: React.ReactNode;
  evidenceRail?: React.ReactNode;
  evidenceLabel?: string;
  workspaceLabel?: string;
  children?: React.ReactNode;
  className?: string;
  id?: string;
}

export function EdsAppShell({
  sidebar,
  topbar,
  drawer,
  overlays,
  evidenceRail,
  evidenceLabel = "Evidence",
  workspaceLabel = "Workspace",
  children,
  className,
  id = "eds-workspace",
}: EdsAppShellProps) {
  return (
    // Inherits the containing EDS surface scope (theme + density). Do not add
    // data-eds here: a bare scope re-declares Dark values and traps the theme.
    <div className={["eds-appshell", className].filter(Boolean).join(" ")}>
      <a className="eds-appshell__skip" href={`#${id}`}>
        Skip to workspace
      </a>
      {topbar}
      <div className="eds-appshell__body">
        {sidebar}
        <main id={id} aria-label={workspaceLabel} tabIndex={-1} className="eds-appshell__main">
          {children}
        </main>
        {evidenceRail ? (
          <aside aria-label={evidenceLabel} className="eds-appshell__evidence">
            {evidenceRail}
          </aside>
        ) : null}
      </div>
      {drawer}
      {overlays}
    </div>
  );
}
