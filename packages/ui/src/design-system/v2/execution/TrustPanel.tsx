"use client";

import { V2AuditEvent, V2PermissionState, V2TrustEvidence } from "./AgentExecution";

export function TrustPanel({
  title = "Trust and audit",
  detail = "Policy verified",
  resource = "current run",
}: {
  title?: string;
  detail?: string;
  resource?: string;
}) {
  return (
    <aside aria-label={title} className="space-y-3 rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--v2-text-tertiary)]">{title}</p>
      <V2TrustEvidence state="verified" detail={detail} />
      <V2PermissionState access="execute" resource={resource} scope="current run only" state="granted" />
      <V2AuditEvent actor="Ethen" event="policy check" detail={detail} time="now" />
    </aside>
  );
}
