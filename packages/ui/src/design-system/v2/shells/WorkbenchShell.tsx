import type { ConsoleContextRailWidth, ConsoleShellProps } from "./ConsoleShell";
import { ConsoleShell } from "./ConsoleShell";

export interface WorkbenchShellProps extends Omit<ConsoleShellProps, "contextRailWidth"> {
  contextRailWidth?: ConsoleContextRailWidth;
}

/** Canonical active-work shell; ConsoleShell remains the single geometry owner. */
export function WorkbenchShell({ contextRailWidth = 320, ...props }: WorkbenchShellProps) {
  return <ConsoleShell {...props} contextRailWidth={contextRailWidth} />;
}
