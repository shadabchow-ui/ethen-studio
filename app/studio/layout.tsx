import { EdsScope } from "@/components/design-system/eds/flagship";
import { V2ProductionScope } from "@/components/shell/V2ProductionScope";
import { edsFontVariables } from "@ethen/ui/design-tokens/typography/fonts";
import type { ReactNode } from "react";
import "@/components/design-system/eds/flagship/flagship-surface.css";

/**
 * Studio V2 Job 13 — studio segment layout (scopes only).
 *
 * Theme/scope activation only. The production frame moved to the
 * `(workbench)` group layout (canonical AppShell → ConsoleShell →
 * StudioShell stack); public review routes under `(public)` inherit just
 * these scopes and no authenticated chrome.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <V2ProductionScope>
      <EdsScope className={edsFontVariables}>{children}</EdsScope>
    </V2ProductionScope>
  );
}
