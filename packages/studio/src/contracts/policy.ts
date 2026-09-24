/** Studio V5 kernel — policy decisions and terminal receipts. */
import type { TaskName } from "./tasks";
import type { ProjectScope } from "./scope";
import type { IcuAmount } from "./money";

export type PolicyAction =
  | "generate"
  | "export"
  | "download"
  | "share"
  | "publish"
  | "protected_serve";

export interface PolicyDecision {
  decisionId: string;
  scope: ProjectScope;
  task: TaskName;
  action: PolicyAction;
  allowed: boolean;
  reasonCode: string;
  remediation: string | null;
  evidenceIds: readonly string[];
  policyVersion: string;
  decidedAt: string;
}

export interface ReceiptLine {
  label: string;
  chargedIcu: IcuAmount;
  releasedIcu: IcuAmount;
  reconciling: boolean;
}

export interface Receipt {
  receiptId: string;
  jobId: string;
  scope: ProjectScope;
  lines: readonly ReceiptLine[];
  totalChargedIcu: IcuAmount;
  totalReleasedIcu: IcuAmount;
  settledAt: string;
}
