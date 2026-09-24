export type CommandScope = "global" | "code" | "files" | "settings";

export type CommandRunSafety = "safe" | "needs-approval" | "blocked";

export interface CommandKitItem {
  id: string;
  label: string;
  group: string;
  detail?: string;
  badge?: string;
  disabled?: boolean;
  disabledReason?: string;
}
