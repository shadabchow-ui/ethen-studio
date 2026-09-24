"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import styles from "../v2.module.css";
import { V2Badge } from "../Badge";
import { V2Button } from "../Button";

// ── Shared types ────────────────────────────────────────────────────────
export type V2RunState = "idle" | "running" | "waiting" | "approval" | "paused" | "failed" | "completed" | "denied";
export type V2RiskLevel = "low" | "medium" | "high" | "critical";

const runStateMeta: Record<V2RunState, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  idle: { label: "Idle", tone: "neutral" },
  running: { label: "Running", tone: "info" },
  waiting: { label: "Waiting", tone: "warning" },
  approval: { label: "Approval required", tone: "warning" },
  paused: { label: "Paused", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  completed: { label: "Completed", tone: "success" },
  denied: { label: "Denied", tone: "danger" },
};

const riskMeta: Record<V2RiskLevel, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  low: { label: "Low risk", tone: "success" },
  medium: { label: "Medium", tone: "warning" },
  high: { label: "High risk", tone: "danger" },
  critical: { label: "Critical", tone: "danger" },
};

// ── RunState — pill/badge primitive ────────────────────────────────────
export function V2RunState({ state, label, className }: { state: V2RunState; label?: string; className?: string }) {
  const meta = runStateMeta[state];
  return <V2Badge tone={meta.tone} size="sm" className={className}>{label ?? meta.label}</V2Badge>;
}

// ── ToolActivity — row + divider, no card ───────────────────────────────
export function V2ToolActivity({
  tool,
  summary,
  state = "running",
  risk,
  input,
  output,
  className,
}: {
  tool: string;
  summary: string;
  state?: V2RunState | "tool-result";
  risk?: V2RiskLevel;
  input?: string;
  output?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const meta = state === "tool-result" ? { tone: "success" as const, label: "Result" } : runStateMeta[state as V2RunState];
  return (
    <section className={cn(styles.v2ToolActivity, className)} aria-label={`${tool} activity`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={styles.v2ToolActivityHead}>
        <span className={styles.v2MonoSmall}>{tool}</span>
        <span className={styles.v2ToolActivitySummary}>{summary}</span>
        <V2Badge tone={meta.tone} size="sm">{meta.label}</V2Badge>
        <span className={styles.v2Disclosure} aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className={styles.v2ToolActivityBody}>
          {risk ? <V2Badge tone={riskMeta[risk].tone} size="sm">{riskMeta[risk].label}</V2Badge> : null}
          {input ? <pre className={styles.v2CodeBlock}>{input}</pre> : null}
          {output ? <div className={styles.v2ToolOutput} role="status"><p className={styles.v2ToolOutputTitle}>Output</p><p className={styles.v2MonoSmall}>{output}</p></div> : null}
        </div>
      ) : null}
    </section>
  );
}

// ── ExecutionTimeline — flat ordered list with divider + rail ──────────
export interface V2TimelineEvent {
  id: string;
  title: string;
  detail?: string;
  time?: string;
  state?: V2RunState;
}
export function V2ExecutionTimeline({ events, className }: { events: V2TimelineEvent[]; className?: string }) {
  return (
    <ol className={cn(styles.v2Timeline, className)} aria-label="Execution timeline">
      {events.map((ev, i) => (
        <li key={ev.id} className={styles.v2TimelineRow}>
          <span className={cn(styles.v2TimelineDot, styles[`v2TimelineDot_${ev.state ?? "completed"}` as never])} aria-hidden />
          {i < events.length - 1 ? <span className={styles.v2TimelineLine} aria-hidden /> : null}
          <div className={styles.v2TimelineContent}>
            <div className={styles.v2TimelineHead}>
              <span className={styles.v2TimelineTitle}>{ev.title}</span>
              {ev.time ? <time className={styles.v2TimelineTime}>{ev.time}</time> : null}
            </div>
            {ev.detail ? <p className={styles.v2TimelineDetail}>{ev.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── ApprovalRequest + decision controls ─────────────────────────────────
export function V2ApprovalRequest({
  title,
  action,
  resource,
  risk = "high",
  state = "approval",
  note,
  onApprove,
  onDeny,
  onRevoke,
  className,
}: {
  title: string;
  action: string;
  resource: string;
  risk?: V2RiskLevel;
  state?: "approval" | "approved" | "denied";
  note?: string;
  onApprove?: () => void;
  onDeny?: () => void;
  onRevoke?: () => void;
  className?: string;
}) {
  const pending = state === "approval";
  return (
    <section className={cn(styles.v2Approval, pending ? styles.v2ApprovalPending : styles.v2ApprovalDecided, className)} aria-label={`Approval: ${title}`}>
      <div className={styles.v2ApprovalHead}>
        <div>
          <p className={styles.v2Eyebrow}>{pending ? "Approval required" : state === "approved" ? "Approved" : "Denied"}</p>
          <h3 className={styles.v2ApprovalTitle}>{title}</h3>
        </div>
        <V2RunState state={pending ? "approval" : state === "approved" ? "completed" : "denied"} />
      </div>
      <dl className={styles.v2ApprovalMeta}>
        <div><dt className={styles.v2MetaLabel}>Proposed action</dt><dd className={styles.v2MetaValue}>{action}</dd></div>
        <div><dt className={styles.v2MetaLabel}>Resource</dt><dd className={styles.v2MonoSmall} style={{ wordBreak: "break-all" }}>{resource}</dd></div>
        <div><dt className={styles.v2MetaLabel}>Risk</dt><dd><V2Badge tone={riskMeta[risk].tone} size="sm">{riskMeta[risk].label}</V2Badge></dd></div>
      </dl>
      {note ? <p className={styles.v2ApprovalNote} role="status">{note}</p> : null}
      {pending ? (
        <div className={styles.v2ApprovalActions}>
          <V2Button variant="ghost" size="sm" onClick={onDeny}>Deny</V2Button>
          <V2Button variant="primary" size="sm" onClick={onApprove}>Approve</V2Button>
        </div>
      ) : (
        <div className={styles.v2ApprovalActions}>
          <V2Button variant="ghost" size="sm" onClick={onRevoke}>Revoke decision (lab only)</V2Button>
        </div>
      )}
      <p className={styles.v2ApprovalFootnote}>Lab-only specimen. No runtime permission is granted.</p>
    </section>
  );
}

export function V2ApprovalDecision({
  value,
  onChange,
  className,
}: {
  value?: "approved" | "denied";
  onChange?: (v: "approved" | "denied") => void;
  className?: string;
}) {
  return (
    <div className={cn(styles.v2DecisionGroup, className)} role="group" aria-label="Approval decision">
      <button type="button" aria-pressed={value === "denied"} onClick={() => onChange?.("denied")} className={cn(styles.v2DecisionButton, value === "denied" && styles.v2DecisionButtonActive)}>Deny</button>
      <button type="button" aria-pressed={value === "approved"} onClick={() => onChange?.("approved")} className={cn(styles.v2DecisionButton, value === "approved" && styles.v2DecisionButtonActive)}>Approve</button>
    </div>
  );
}

// ── PermissionState — scope + resource row ──────────────────────────────
export function V2PermissionState({
  access,
  resource,
  scope,
  state = "requested",
  className,
}: {
  access: "read" | "write" | "execute";
  resource: string;
  scope: string;
  state?: "requested" | "granted" | "denied";
  className?: string;
}) {
  const tone = state === "granted" ? "success" : state === "denied" ? "danger" : "warning";
  return (
    <div className={cn(styles.v2Permission, className)}>
      <div className={styles.v2PermissionHead}>
        <p className={styles.v2Eyebrow}>Permission {state}</p>
        <V2Badge tone={tone as never} size="sm">{state}</V2Badge>
      </div>
      <p className={styles.v2PermissionTitle}>{access} · {resource}</p>
      <p className={styles.v2MonoSmall}>Scope: {scope}</p>
    </div>
  );
}

// ── TrustEvidence / AuditEvent / ArtifactState ───────────────────────────
export function V2TrustEvidence({
  state = "verified",
  detail,
  className,
}: {
  state?: "verified" | "unverified" | "restricted" | "expired";
  detail?: string;
  className?: string;
}) {
  const tone = state === "verified" ? "success" : state === "restricted" ? "warning" : state === "expired" ? "danger" : "neutral";
  const label = state === "verified" ? "Verified" : state === "restricted" ? "Restricted" : state === "expired" ? "Expired" : "Unverified";
  return (
    <span className={cn(styles.v2Trust, className)}>
      <V2Badge tone={tone as never} size="sm">{label}</V2Badge>
      {detail ? <span className={styles.v2TrustDetail}>{detail}</span> : null}
    </span>
  );
}

export function V2AuditEvent({
  actor,
  event,
  time,
  detail,
  className,
}: {
  actor: string;
  event: string;
  time: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn(styles.v2AuditRow, className)}>
      <span className={styles.v2AuditDot} aria-hidden />
      <div className={styles.v2AuditContent}>
        <p className={styles.v2AuditTitle}><span className={styles.v2AuditActor}>{actor}</span> {event}</p>
        {detail ? <p className={styles.v2AuditDetail}>{detail}</p> : null}
      </div>
      <time className={styles.v2AuditTime}>{time}</time>
    </div>
  );
}

export function V2ArtifactState({
  name,
  version,
  type = "MD",
  updatedAt,
  status = "ready",
  className,
}: {
  name: string;
  version: string;
  type?: string;
  updatedAt?: string;
  status?: "ready" | "error" | "pending";
  className?: string;
}) {
  const tone = status === "error" ? "danger" : status === "pending" ? "warning" : "success";
  return (
    <div className={cn(styles.v2ArtifactRow, className)}>
      <span className={styles.v2MonoSmall}>{type}</span>
      <span className={styles.v2ArtifactName}>{name}</span>
      <span className={styles.v2MonoSmall}>v{version}</span>
      {updatedAt ? <span className={styles.v2ArtifactTime}>{updatedAt}</span> : null}
      <V2Badge tone={tone as never} size="sm">{status}</V2Badge>
    </div>
  );
}

export function V2Provenance({
  source,
  locator,
  capturedAt,
  verified,
  className,
}: {
  source: string;
  locator?: string;
  capturedAt?: string;
  verified?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(styles.v2Provenance, className)}>
      <div className={styles.v2ProvenanceHead}>
        <p className={styles.v2Eyebrow}>Provenance</p>
        <V2TrustEvidence state={verified ? "verified" : "unverified"} />
      </div>
      <p className={styles.v2ProvenanceSource}>{source}</p>
      <div className={styles.v2ProvenanceMeta}>
        {locator ? <p className={styles.v2MonoSmall} style={{ wordBreak: "break-all" }}>{locator}</p> : null}
        {capturedAt ? <p className={styles.v2MonoSmall}>Captured {capturedAt}</p> : null}
      </div>
    </div>
  );
}

// ── Activity row — flat operational row used in right rail ─────────────
export function V2ActivityRow({
  title,
  detail,
  time,
  state,
  icon,
  className,
}: {
  title: string;
  detail?: string;
  time?: string;
  state?: V2RunState;
  icon?: string;
  className?: string;
}) {
  return (
    <div className={cn(styles.v2ActivityRow, className)}>
      <span className={styles.v2ActivityIcon} aria-hidden>{icon ?? "•"}</span>
      <div className={styles.v2ActivityContent}>
        <div className={styles.v2ActivityHead}>
          <span className={styles.v2ActivityTitle}>{title}</span>
          {state ? <V2RunState state={state} /> : null}
        </div>
        {detail ? <p className={styles.v2ActivityDetail}>{detail}</p> : null}
      </div>
      {time ? <time className={styles.v2ActivityTime}>{time}</time> : null}
    </div>
  );
}
