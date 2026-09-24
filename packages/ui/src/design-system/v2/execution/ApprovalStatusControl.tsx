"use client";

import { V2ApprovalDecision } from "./AgentExecution";

export type ApprovalStatusValue = "approved" | "denied" | "approval";

export function ApprovalStatusControl({
  value = "approval",
  onChange,
}: {
  value?: ApprovalStatusValue;
  onChange?: (status: Exclude<ApprovalStatusValue, "approval">) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--v2-text-tertiary)]">State</span>
      <V2ApprovalDecision
        value={value === "approval" ? undefined : value}
        onChange={onChange}
      />
    </div>
  );
}
