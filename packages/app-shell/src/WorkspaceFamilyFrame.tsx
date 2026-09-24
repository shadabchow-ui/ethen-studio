"use client";

import type { ReactNode } from "react";
import { EdsSystemShell } from "./EdsSystemShell";
import { V2ProductionScope } from "./V2ProductionScope";

export function WorkspaceFamilyFrame({
  title,
  composer,
  children,
}: {
  title: string;
  composer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <EdsSystemShell title={title}>
      <h1 className="text-[20px] font-medium text-[var(--eds-ink)]">{title}</h1>
      {/* V2 composers resolve their token chain against the resolved
          production theme (dark/light/system) instead of inheriting
          whatever surrounds the frame — J11B light-contrast fix. */}
      {composer ? <V2ProductionScope>{composer}</V2ProductionScope> : null}
      {children}
    </EdsSystemShell>
  );
}
