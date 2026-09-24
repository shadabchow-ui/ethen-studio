/**
 * STUDIO_16 — realtime session inspector (client-safe).
 * Session metadata: agent config, epoch, spend cap, metering and tool scope.
 * Adapted from the Voice session inspector composition; Ethen shell tokens.
 */
"use client";

import { formatDuration, formatIcu, type RealtimeMeteringView, type RealtimeSessionView } from "./types";

export function RealtimeSessionInspector({
  session,
  metering,
}: {
  session: RealtimeSessionView;
  metering: RealtimeMeteringView | null;
}) {
  const properties: { label: string; value: string }[] = [
    { label: "Session", value: session.sessionId.slice(0, 8) },
    { label: "Status", value: session.status },
    { label: "Epoch", value: String(session.epoch) },
    { label: "Agent", value: session.agentName },
    { label: "Mode", value: session.transportMode },
    { label: "Cap", value: formatIcu(session.spendCapIcu) },
    { label: "Reserved", value: formatIcu(session.reservedIcu) },
    { label: "Settled", value: formatIcu(session.spentIcu) },
    { label: "Connected", value: metering ? formatDuration(metering.connectedSeconds) : "—" },
    { label: "Projected", value: metering ? formatIcu(metering.projectedIcu) : "—" },
    { label: "Tool scopes", value: session.toolScopeIds.length > 0 ? session.toolScopeIds.join(", ") : "none" },
    { label: "Recording", value: session.recordingRetention },
  ];
  return (
    <section aria-label="Session inspector" className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Session inspector</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {properties.map((prop) => (
          <div key={prop.label} className="min-w-0">
            <dt className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{prop.label}</dt>
            <dd className="mt-0.5 truncate text-[12px] text-[var(--text-secondary)]" title={prop.value}>
              {prop.value}
            </dd>
          </div>
        ))}
      </dl>
      {session.revokedScopeIds.length > 0 && (
        <p role="alert" className="mt-3 rounded-[8px] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)]">
          Revoked scopes: {session.revokedScopeIds.join(", ")} — the session stopped.
        </p>
      )}
    </section>
  );
}
