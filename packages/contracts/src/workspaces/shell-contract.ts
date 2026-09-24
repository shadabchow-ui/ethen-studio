export type ComposerSendState =
  | { type: "send"; canSend: boolean }
  | { type: "stop" }
  | { type: "disabled"; reason: string };

export type ShellStatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export interface ShellStatusLabel {
  label: string;
  tone?: ShellStatusTone;
  detail?: string;
}

export interface ShellRightRailConfig {
  enabled: boolean;
  defaultOpen?: boolean;
  label?: string;
}

export interface ShellContract {
  topbarStatus?: ShellStatusLabel[];
  composerState: ComposerSendState;
  rightRail?: ShellRightRailConfig;
  disabledReason?: string;
}

export function deriveComposerSendState(opts: {
  isLoading?: boolean;
  canSend?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}): ComposerSendState {
  if (opts.disabled) {
    return { type: "disabled", reason: opts.disabledReason ?? "Not available" };
  }
  if (opts.isLoading) {
    return { type: "stop" };
  }
  return { type: "send", canSend: opts.canSend ?? true };
}
