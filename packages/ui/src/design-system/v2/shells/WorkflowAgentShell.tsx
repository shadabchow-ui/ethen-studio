"use client";

import * as React from "react";
import { V2Composer } from "../Composer";
import { V2Badge } from "../Badge";
import { V2Button } from "../Button";
import { V2SegmentedControl } from "../SegmentedControl";
import { V2DataTable, type V2TableColumn } from "../DataTable";
import {
  V2ApprovalRequest,
  V2TrustEvidence,
  V2AuditEvent,
} from "../execution/AgentExecution";
import { V2MonoCell, V2StatusCell } from "../DataTable";

const QUICK_STARTS = [
  { id: "workflow", label: "Workflow", desc: "Draft from a prompt", icon: "↯", selected: true },
  { id: "integration", label: "Integration", desc: "Link an app account", icon: "⌁" },
  { id: "ai-access", label: "AI Access", desc: "Expose tools to AI", icon: "◌" },
  { id: "approval", label: "Approval Flow", desc: "Add a human gate", icon: "✓" },
  { id: "template", label: "Template", desc: "Start from a recipe", icon: "▧" },
] as const;

const RECOMMENDATIONS = [
  { title: "Create daily categorized email records for project triage", route: "Gmail → Sheets", meta: "Approval required before activation", status: "Approval required" as const },
  { title: "Create summarized research records from AI feed items", route: "OpenAI / Web Parser → Notion", meta: "Simulation can run after review", status: "Simulation ready" as const },
  { title: "Send daily market alert emails to managers", route: "Gmail → Slack", meta: "Draft saved locally", status: "Draft" as const },
];

const APP_SUGGESTIONS = [
  { title: "Publish new page posts to visual networks and blogs", route: "Instagram for Business → Pinterest", meta: "Credential check required", status: "Approval required" as const },
  { title: "Publish new photo posts to microblogs and boards", route: "Instagram for Business → Pinterest", meta: "Simulation ready", status: "Simulation ready" as const },
  { title: "Publish repurposed blog posts across channels daily", route: "RSS → Pinterest → Slack", meta: "Draft workflow", status: "Draft" as const },
];

const DRAFTS = [
  { title: "Daily Gmail digest", edited: "Edited 10 days ago", action: "Add a connection", apps: ["G", "S"] },
  { title: "Pinterest publisher", edited: "Edited 11 days ago", action: "Review and publish", apps: ["I", "P"] },
  { title: "Market alert flow", edited: "Edited 31 days ago", action: "Set up flow", apps: ["G", "Sl"] },
  { title: "Research collector", edited: "Edited 2 years ago", action: "Simulation ready", apps: ["AI", "N"] },
];

type Conn = { id: string; name: string; detail: string; app: string; status: "Connected" | "Expired" | "Needs test"; workflows: number; modified: string; access: string };
const CONNECTIONS: Conn[] = [
  { id: "c1", name: "Instagram jetcubeinc", detail: "jetcubeinc", app: "Instagram Basic CLI 1.0.6", status: "Expired", workflows: 0, modified: "May 22, 2025", access: "sha" },
  { id: "c2", name: "Instagram for Business", detail: "user@example.com", app: "Instagram for Business 1.2.5", status: "Connected", workflows: 1, modified: "Aug 24, 2024", access: "sha" },
  { id: "c3", name: "LinkedIn shadab chow", detail: "shadab chow", app: "LinkedIn 1.13.5", status: "Connected", workflows: 0, modified: "Aug 24, 2024", access: "sha" },
  { id: "c4", name: "Pinterest jetcubebrand", detail: "jetcubebrand", app: "Pinterest 1.0.6", status: "Connected", workflows: 1, modified: "Aug 24, 2024", access: "sha" },
  { id: "c5", name: "Google Sheets", detail: "workspace@example.com", app: "Google Sheets 2.11.2", status: "Needs test", workflows: 0, modified: "Aug 24, 2024", access: "sha" },
];

const ATTENTION = [
  { title: "Instagram credentials expired", desc: "Reconnect before activation" },
  { title: "Approval gate incomplete", desc: "Select reviewer" },
  { title: "Sheets access not tested", desc: "Run test connection" },
];

function StatusPill({ status }: { status: string }) {
  const tone = status === "Approval required" ? "warning" : status === "Simulation ready" ? "info" : "neutral";
  return <V2Badge tone={tone as never} size="sm">{status}</V2Badge>;
}

/**
 * Workflow Agent product shell — interior workspace specialization for /workflow-agent.
 * Compatible with global frame (left 256 sidebar, 56 topbar, optional 320/404 rail).
 * Rows/dividers, 6px base, 12px transient, pilot Light hierarchy, no giant cards.
 * Connections uses shared V2DataTable, approvals via trust primitives, Composer/model/file shared.
 */
export function WorkflowAgentShell({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [composerValue, setComposerValue] = React.useState("");
  const [quickId, setQuickId] = React.useState("workflow");
  const [approvalState, setApprovalState] = React.useState<"approval" | "approved" | "denied">("approval");
  const [selectedRec, setSelectedRec] = React.useState<string | null>(null);

  const connCols: V2TableColumn<Conn>[] = [
    {
      id: "name",
      header: "Connection",
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-[var(--v2-text-primary)]">{r.name}</div>
          <div className="truncate font-mono text-[11px] text-[var(--v2-text-tertiary)]">{r.detail}</div>
        </div>
      ),
      minWidth: 220,
    },
    { id: "app", header: "App", cell: (r) => <V2MonoCell>{r.app}</V2MonoCell>, minWidth: 180 },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <V2Badge tone={r.status === "Connected" ? "success" : r.status === "Expired" ? "danger" : "warning"} size="sm">
          {r.status}
        </V2Badge>
      ),
      minWidth: 120,
    },
    { id: "workflows", header: "Workflows", cell: (r) => <span className="text-[12px] text-[var(--v2-text-secondary)]">{r.workflows}</span>, minWidth: 90, align: "right" as const },
    { id: "modified", header: "Modified", cell: (r) => <V2MonoCell>{r.modified}</V2MonoCell>, minWidth: 120 },
    { id: "access", header: "Access", cell: (r) => <V2MonoCell>{r.access}</V2MonoCell>, minWidth: 80 },
  ];

  if (children) {
    return (
      <div className={className ?? "flex min-w-0 flex-col gap-6"} data-testid="workflow-agent-shell">
        <header data-v2-pattern="page-header">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--v2-text-tertiary)]">Flow</p>
          <h1 className="text-[20px] font-medium tracking-tight text-[var(--v2-text-primary)]">Flow</h1>
        </header>
        <nav data-v2-pattern="family-navigation" aria-label="Flow" className="flex flex-wrap gap-2">
          {[
            ["/workflow-agent", "Home"],
            ["/workflow-agent/workflows", "Workflows"],
            ["/workflow-agent/runs", "Runs"],
            ["/workflow-agent/apps", "Apps"],
            ["/workflow-agent/approvals", "Approvals"],
            ["/workflow-agent/build", "Build"],
            ["/workflow-agent/integrations", "Integrations"],
            ["/workflow-agent/templates", "Templates"],
            ["/workflow-agent/webhooks", "Webhooks"],
            ["/workflow-agent/settings", "Settings"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-md border border-[var(--v2-border-default)] px-2.5 py-1 text-[12px] text-[var(--v2-text-secondary)] hover:bg-[var(--v2-hover)]"
            >
              {label}
            </a>
          ))}
        </nav>
        <div data-v2-pattern="composer-surface">
          <V2Composer placeholder="Describe a workflow, app pair, or business process…" />
        </div>
        <div data-v2-pattern="data-surface">{children}</div>
      </div>
    );
  }

  return (
    <div className={className ?? "flex min-w-0 flex-col gap-6"} data-testid="workflow-agent-shell">
      {/* Composer — shared V2Composer, 12px raised, no blue focus ring */}
      <section aria-label="Workflow composer">
        <V2Composer
          value={composerValue}
          onValueChange={setComposerValue}
          placeholder="Describe a workflow, app pair, or business process…"
          onSend={(v) => setComposerValue(`Drafting: ${v}`)}
          statusText="Drafts stay local until you simulate and review approvals."
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {["Gmail → Sheets", "Stripe → Slack", "New lead follow-up", "Daily digest"].map((pill) => (
            <button
              key={pill}
              type="button"
              onClick={() => setComposerValue(pill)}
              className="h-7 rounded-[var(--v2-radius-base)] border border-[var(--v2-border-default)] bg-[var(--v2-surface)] px-3 text-[12px] text-[var(--v2-text-secondary)] hover:bg-[var(--v2-hover)] hover:text-[var(--v2-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-focus)] focus-visible:outline-offset-2"
            >
              {pill}
            </button>
          ))}
        </div>
      </section>

      {/* Product navigation — 36px rows pattern but as segmented control */}
      <V2SegmentedControl
        value={quickId}
        onValueChange={setQuickId}
        options={QUICK_STARTS.map((q) => ({ id: q.id, label: q.label }))}
        aria-label="Workflow quick start"
      />

      {/* Quick starts — V2 small bordered, 6px, not 16px cards */}
      <section aria-label="Quick starts">
        <p className="mb-2 font-mono text-[12px] text-[var(--v2-text-tertiary)]">Start from scratch</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {QUICK_STARTS.map((q) => (
            <button
              key={q.id}
              type="button"
              aria-pressed={q.id === quickId}
              onClick={() => setQuickId(q.id)}
              className="text-left rounded-[var(--v2-radius-base)] border bg-[var(--v2-surface)] p-3 transition-colors hover:bg-[var(--v2-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-focus)] focus-visible:outline-offset-2"
              style={{ borderColor: q.id === quickId ? "var(--v2-border-strong)" : "var(--v2-border-subtle)", background: q.id === quickId ? "var(--v2-selected)" : "var(--v2-surface)" }}
            >
              <span className="mb-2 grid h-8 w-8 place-items-center rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] text-[13px] text-[var(--v2-text-tertiary)]" aria-hidden>
                {q.icon}
              </span>
              <span className="block text-[13px] font-medium text-[var(--v2-text-primary)]">{q.label}</span>
              <span className="mt-1 block text-[13px] leading-[18px] text-[var(--v2-text-tertiary)]">{q.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Two-column: recommendations + attention/inspector */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_308px]">
        <div className="min-w-0 space-y-6">
          {/* Recommendations */}
          <section aria-label="Recommended workflows">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[14px] font-semibold text-[var(--v2-text-primary)]">Recommended for you</h3>
              <span className="font-mono text-[length:var(--v2-type-metadata-size)] text-[var(--v2-text-tertiary)]">Static · no backend</span>
            </div>
            <div className="overflow-hidden rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)]">
              <div className="border-b border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] p-3">
                <p className="text-[12px] font-medium text-[var(--v2-text-primary)]">Top recommendation</p>
                <p className="mt-1 text-[13px] font-medium text-[var(--v2-text-primary)]">Send daily categorized Gmail digest</p>
                <p className="text-[13px] text-[var(--v2-text-tertiary)]">Works with Gmail, Sheets, and approval gates.</p>
                <div className="mt-2 flex gap-2"><StatusPill status="Simulation ready" /><StatusPill status="Approval required" /></div>
              </div>
              <div className="divide-y divide-[var(--v2-border-subtle)]">
                {RECOMMENDATIONS.map((r) => (
                  <button
                    key={r.title}
                    type="button"
                    aria-pressed={selectedRec === r.title}
                    onClick={() => setSelectedRec(r.title)}
                    className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-[var(--v2-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-focus)] focus-visible:outline-offset-2"
                    style={{ background: selectedRec === r.title ? "var(--v2-selected)" : "transparent" }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-[var(--v2-text-primary)]">{r.title}</span>
                      <span className="mt-1 block text-[12px] text-[var(--v2-text-tertiary)]">{r.route} · {r.meta}</span>
                    </span>
                    <StatusPill status={r.status} />
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Compatible apps */}
          <section aria-label="Works well with">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[var(--v2-text-primary)]">Works well with · Pinterest</h3>
              <button type="button" className="text-[13px] text-[var(--v2-text-tertiary)] hover:text-[var(--v2-text-primary)]">Change app</button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {APP_SUGGESTIONS.map((r) => (
                <div key={r.title} className="rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-3">
                  <p className="truncate text-[12px] font-medium text-[var(--v2-text-primary)]">{r.title}</p>
                  <p className="mt-1 text-[12px] text-[var(--v2-text-tertiary)]">{r.route}</p>
                  <div className="mt-2"><StatusPill status={r.status} /></div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Needs-attention + selected inspector (right rail 308, ~320) */}
        <div className="space-y-4">
          <section aria-label="Needs attention" className="rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)]">
            <div className="border-b border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] px-3 py-2">
              <h4 className="text-[12px] font-semibold text-[var(--v2-text-primary)]">Needs attention</h4>
              <p className="text-[12px] text-[var(--v2-text-tertiary)]">Static list · no auto-fix calls</p>
            </div>
            <div className="divide-y divide-[var(--v2-border-subtle)]">
              {ATTENTION.map((a) => (
                <div key={a.title} className="flex items-start gap-3 px-3 py-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--v2-status-warning)]" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-[var(--v2-text-primary)]">{a.title}</p>
                    <p className="text-[13px] text-[var(--v2-text-tertiary)]">{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--v2-border-subtle)] p-2">
              <V2Button size="sm" variant="ghost" className="w-full">View all</V2Button>
            </div>
          </section>

          <section aria-label="Selected workflow inspector" className="rounded-[var(--v2-radius-base)] border border-[var(--v2-border-default)] bg-[var(--v2-raised)] p-3">
            <p className="font-mono text-[12px] text-[var(--v2-text-tertiary)]">Inspector · 308</p>
            <h4 className="mt-1 text-[13px] font-semibold text-[var(--v2-text-primary)]">{selectedRec ?? "Select a recommendation"}</h4>
            <p className="mt-1 text-[12px] leading-[18px] text-[var(--v2-text-secondary)]">Readable Light boundaries: subtle #E5E5E5 row dividers, default #DCDCDC controls, strong #D2D2D2 rail. Inspector uses shared V2Badge + audit.</p>
            <div className="mt-3 flex flex-wrap gap-2"><V2Badge tone="info">Sheets</V2Badge><V2Badge tone="success">Approval gate</V2Badge></div>
            <div className="mt-3 rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-2">
              <V2AuditEvent actor="Ethen agent" event="simulated trigger" time="09:40" detail="Gmail → Sheets · 12 rows · 0 writes" />
              <V2TrustEvidence state="verified" detail="Simulation verified — 8ms" />
            </div>
          </section>
        </div>
      </div>

      {/* Unfinished drafts — row/divider list */}
      <section aria-label="Unfinished drafts" className="rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] px-3 py-2">
          <h3 className="text-[12px] font-semibold text-[var(--v2-text-primary)]">Unfinished drafts</h3>
          <span className="font-mono text-[length:var(--v2-type-metadata-size)] text-[var(--v2-text-tertiary)]">{DRAFTS.length} · local only</span>
        </div>
        <div className="divide-y divide-[var(--v2-border-subtle)]">
          {DRAFTS.map((d) => (
            <div key={d.title} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-[var(--v2-hover)]">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-[var(--v2-text-primary)]">{d.title}</p>
                <p className="font-mono text-[11px] text-[var(--v2-text-tertiary)]">{d.edited} · {d.apps.join(" → ")}</p>
              </div>
              <V2Button size="sm" variant="secondary">{d.action}</V2Button>
            </div>
          ))}
        </div>
      </section>

      {/* Connections — shared DataTable */}
      <section aria-label="Connections dense table">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[13px] font-semibold text-[var(--v2-text-primary)]">Connections</h3>
          <p className="font-mono text-[length:var(--v2-type-metadata-size)] text-[var(--v2-text-tertiary)]">Dense · V2DataTable · sticky header</p>
        </div>
        <V2DataTable columns={connCols} rows={CONNECTIONS} rowKey={(r) => r.id} caption="Workflow connections" />
        <p className="mt-2 font-mono text-[length:var(--v2-type-metadata-size)] text-[var(--v2-text-tertiary)]">Shared DataTable column chooser / sorting-ready · no redundant local table styles.</p>
      </section>

      {/* Approval / simulation — trust primitives */}
      <section aria-label="Approval and simulation" className="grid gap-4 md:grid-cols-2">
        <V2ApprovalRequest
          title="Activate Gmail → Sheets triage"
          action="Create workflow schedule"
          resource="workflows/gmail-sheets"
          risk="high"
          state={approvalState}
          note={
            approvalState === "approved"
              ? "Approved — simulation may run (lab only, no schedule created)."
              : approvalState === "denied"
                ? "Denied — workflow remains draft."
                : "Approval required before activation · simulation is allowed."
          }
          onApprove={() => setApprovalState("approved")}
          onDeny={() => setApprovalState("denied")}
          onRevoke={() => setApprovalState("approval")}
        />
        <div className="grid gap-3">
          <div className="rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] p-3">
            <p className="font-mono text-[12px] text-[var(--v2-text-tertiary)]">Simulation</p>
            <p className="mt-1 text-[12px] text-[var(--v2-text-secondary)]">Dry run produces 12 rows previewed, 0 writes, 8ms. Trust evidence stays verified before human gate.</p>
            <V2AuditEvent actor="Workflow agent" event="simulated 12 rows" time="09:40" />
          </div>
          <div className="rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-3">
            <p className="font-mono text-[12px] text-[var(--v2-text-tertiary)]">Credential health</p>
            <div className="mt-2 grid gap-2">
              <div className="flex items-center justify-between"><span className="text-[12px] text-[var(--v2-text-primary)]">Instagram for Business</span><V2Badge tone="success" size="sm">Healthy</V2Badge></div>
              <div className="flex items-center justify-between"><span className="text-[12px] text-[var(--v2-text-primary)]">Gmail</span><V2Badge tone="danger" size="sm">Expired</V2Badge></div>
              <div className="flex items-center justify-between"><span className="text-[12px] text-[var(--v2-text-primary)]">Google Sheets</span><V2Badge tone="warning" size="sm">Needs test</V2Badge></div>
            </div>
            <p className="mt-2 font-mono text-[12px] text-[var(--v2-text-tertiary)]">Credentials are masked · no live provider check.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
