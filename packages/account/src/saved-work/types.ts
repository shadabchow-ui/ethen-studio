export type SavedWorkCategory =
  | "session"
  | "project"
  | "run"
  | "artifact"
  | "asset"
  | "approval"
  | "event"
  | "evidence"
  | "provider_receipt"
  | "export";

export type Durability =
  | "durable"
  | "local_file"
  | "local_storage"
  | "in_memory"
  | "mock"
  | "not_saved";

export interface DurabilityInfo {
  durability: Durability;
  label: string;
  shortLabel: string;
  description: string;
  isDurable: boolean;
  isPersistent: boolean;
}

export type ResumeAction = "resume" | "rerun" | "export" | "reuse" | "view";

export interface SavedWorkAction {
  type: ResumeAction;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  href?: string;
}

export interface SavedWorkSummary {
  id: string;
  category: SavedWorkCategory;
  title: string;
  subtitle: string;
  durability: Durability;
  updatedAt: string;
  preview: string | null;
  actions: SavedWorkAction[];
  metadata: Record<string, unknown> | null;
}
