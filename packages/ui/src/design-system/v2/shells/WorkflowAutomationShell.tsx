"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import styles from "../v2.module.css";
import { V2Badge } from "../Badge";
import { V2Button } from "../Button";
import { V2Tabs, type V2TabItem } from "../Tabs";
import { V2DataTable, type V2TableColumn, V2FilterBar, V2FilterSelect, V2Pagination, V2EmptyState } from "../DataTable";
import { DetailShell, DetailAuditRow } from "../shells/DetailShell";
import { SettingsShell, SettingRow, SettingSection } from "../SettingsShell";
import { V2MonoCell } from "../DataTable";

// ── Shared static enterprise fixtures (deterministic, no live store) ──
type WfStatus = "active" | "running" | "completed" | "failed" | "blocked" | "paused" | "pending" | "healthy" | "degraded";

const RUNS = [
  { id: "run_01J8E7F9G2H5K8M1N3P6Q", employee: "Support Bot", status: "completed" as WfStatus, schedule: "Daily Support Triage", duration: "1m 42s", cost: "$0.34", createdAt: "2m ago" },
  { id: "run_01J8D5E2F8A1B4C7D0E3F", employee: "Sales Analyst", status: "running" as WfStatus, schedule: "Weekly Pipeline Report", duration: "43s", cost: "$0.18", createdAt: "6m ago" },
  { id: "run_01J8C3A6B9D2E5F8G1H4J", employee: "Finance Bot", status: "failed" as WfStatus, schedule: "Monthly Finance Review", duration: "2m 10s", cost: "$0.41", createdAt: "18m ago" },
  { id: "run_01J8B2C5D8E1F4G7H0J3K", employee: "Support Bot", status: "blocked" as WfStatus, schedule: "Customer Escalation Check", duration: "—", cost: "—", createdAt: "1h ago" },
];

const APPROVALS_PENDING = [
  { id: "appr_1", title: "Send customer reply — billing refund", employee: "Support Bot", risk: "High", createdAt: "4m ago" },
  { id: "appr_2", title: "Update CRM deal stage → Closed Won", employee: "Sales Analyst", risk: "Medium", createdAt: "18m ago" },
];

const SCHEDULES = [
  { id: "sched-1", name: "Daily Support Triage", employee: "Support Bot", cadence: "Every weekday at 8:00 AM", nextRun: "Jun 19, 08:00", status: "active" as WfStatus, timezone: "America/New_York" },
  { id: "sched-2", name: "Weekly Pipeline Report", employee: "Sales Analyst", cadence: "Every Monday at 9:00 AM", nextRun: "Jun 22, 09:00", status: "active" as WfStatus, timezone: "America/New_York" },
  { id: "sched-3", name: "Monthly Finance Review", employee: "Finance Bot", cadence: "First business day at 7:00 AM", nextRun: "Jul 01, 07:00", status: "paused" as WfStatus, timezone: "America/New_York" },
];

const APPS = [
  { id: "zendesk", name: "Zendesk", status: "connected" as WfStatus, tools: "4 / 5", lastCall: "2m ago", health: "healthy" as WfStatus },
  { id: "gmail", name: "Gmail", status: "connected" as WfStatus, tools: "3 / 4", lastCall: "5m ago", health: "healthy" as WfStatus },
  { id: "slack", name: "Slack", status: "expired" as WfStatus, tools: "0 / 2", lastCall: "3d ago", health: "degraded" as WfStatus },
  { id: "hubspot", name: "HubSpot", status: "connected" as WfStatus, tools: "2 / 6", lastCall: "1h ago", health: "healthy" as WfStatus },
];

const EMPLOYEES = [
  { id: "emp-support", name: "Support Bot", role: "customer_support", status: "active" as WfStatus, health: "healthy" as WfStatus, runs: 47, lastActive: "3m ago" },
  { id: "emp-sales", name: "Sales Analyst", role: "sales_operations", status: "active" as WfStatus, health: "healthy" as WfStatus, runs: 23, lastActive: "1h ago" },
  { id: "emp-finance", name: "Finance Bot", role: "finance_operations", status: "draft" as WfStatus, health: "degraded" as WfStatus, runs: 8, lastActive: "3d ago" },
];

const SKILL_PACKS = [
  { id: "customer-support-triage", name: "Customer Support Triage", version: "1.0.0", status: "available", employees: 0, schedules: 3 },
  { id: "research-report", name: "Research & Report Generation", version: "1.0.0", status: "installed", employees: 2, schedules: 1 },
  { id: "marketing-campaign", name: "Marketing Campaign Ops", version: "0.9.0", status: "setup_required", employees: 0, schedules: 2 },
];

const REPORTS = [
  { id: "rpt-1", title: "Weekly Support Summary", employee: "Support Bot", type: "Support Summary", generatedAt: "2026-06-18" },
  { id: "rpt-2", title: "Pipeline Health Report", employee: "Sales Analyst", type: "Sales Report", generatedAt: "2026-06-15" },
];

function toneForStatus(s: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (s === "completed" || s === "active" || s === "healthy" || s === "installed" || s === "available") return "success";
  if (s === "running") return "info";
  if (s === "blocked" || s === "failed" || s === "expired") return "danger";
  if (s === "pending" || s === "paused" || s === "degraded" || s === "setup_required") return "warning";
  return "neutral";
}

export type WorkflowAutomationView =
  | "overview"
  | "runs"
  | "run-detail"
  | "approvals"
  | "schedules"
  | "connected-apps"
  | "connected-app-detail"
  | "employees"
  | "employee-detail"
  | "skill-packs"
  | "skill-pack-detail"
  | "reports"
  | "usage"
  | "settings";

export interface WorkflowAutomationShellProps {
  activeView?: WorkflowAutomationView;
  onViewChange?: (view: WorkflowAutomationView) => void;
  className?: string;
  children?: React.ReactNode;
}

const VIEWS: Array<{ id: WorkflowAutomationView; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "runs", label: "Runs" },
  { id: "approvals", label: "Approvals" },
  { id: "schedules", label: "Schedules" },
  { id: "connected-apps", label: "Apps" },
  { id: "employees", label: "Employees" },
  { id: "skill-packs", label: "Skill Packs" },
  { id: "reports", label: "Reports" },
  { id: "usage", label: "Usage" },
  { id: "settings", label: "Settings" },
];

function StatRow({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "success" | "warning" | "danger" }) {
  return (
    <div className={cn(styles.wfaStatRow, tone === "warning" && styles.wfaStatRowWarning, tone === "danger" && styles.wfaStatRowDanger)}>
      <p className={styles.wfaStatLabel}>{label}</p>
      <p className={styles.wfaStatValue}>{value}</p>
      <p className={styles.wfaStatDetail}>{detail}</p>
    </div>
  );
}

function SectionHead({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className={styles.wfaSectionHead}>
      <div>
        <h3 className={styles.wfaSectionTitle}>{title}</h3>
        {desc ? <p className={styles.wfaSectionDesc}>{desc}</p> : null}
      </div>
      {action ? <div className={styles.wfaSectionAction}>{action}</div> : null}
    </div>
  );
}

/**
 * WorkflowAutomationShell — enterprise operations product shell.
 * Distinct from prompt-first Workflow Agent: emphasizes tables/rows, schedules/state,
 * approval queues, app health, reporting, usage, and auditability.
 * Reuses V2 Data/Detail/Settings shells; compatible with global Console frame (256/56 topbar/sidebar, 24 gutter).
 * No new visual language: rows/dividers, 6px base, 12px transient, pilot Light tokens, Geist.
 */
export function WorkflowAutomationShell({ activeView: controlledView, onViewChange, className, children }: WorkflowAutomationShellProps) {
  const [internalView, setInternalView] = React.useState<WorkflowAutomationView>(controlledView ?? "overview");
  const activeView = controlledView ?? internalView;
  const setView = (v: WorkflowAutomationView) => {
    if (onViewChange) onViewChange(v);
    else setInternalView(v);
  };
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  const tabItems: V2TabItem[] = VIEWS.map((v) => ({ id: v.id, label: v.label }));

  if (children) {
    return (
      <div className={cn("flex min-w-0 flex-col gap-4", className)} data-testid="workflow-automation-shell">
        <header data-v2-pattern="page-header">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--v2-text-tertiary)]">Flow</p>
          <h1 className="text-[20px] font-medium tracking-tight text-[var(--v2-text-primary)]">Workforce operations</h1>
        </header>
        <nav data-v2-pattern="family-navigation" aria-label="Flow" className="flex flex-wrap gap-2">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setView(view.id)}
              className="rounded-md border border-[var(--v2-border-default)] px-2.5 py-1 text-[12px] text-[var(--v2-text-secondary)] hover:bg-[var(--v2-hover)]"
            >
              {view.label}
            </button>
          ))}
        </nav>
        <div data-v2-pattern="data-surface">{children}</div>
      </div>
    );
  }

  // Filtered runs demo
  const filteredRuns = RUNS.filter((r) => {
    const q = query.toLowerCase();
    if (!q) return true;
    return r.id.toLowerCase().includes(q) || r.employee.toLowerCase().includes(q);
  });

  const runColumns: V2TableColumn<(typeof RUNS)[number]>[] = [
    { id: "run", header: "Run", cell: (r) => <div><div className={styles.wfaMonoSmall}>{r.id.slice(0, 18)}…</div><div className={styles.wfaCellPrimary}>{r.schedule}</div></div>, minWidth: 260 },
    { id: "employee", header: "Employee", cell: (r) => r.employee, minWidth: 140 },
    { id: "status", header: "Status", cell: (r) => <V2Badge tone={toneForStatus(r.status)} size="sm">{r.status}</V2Badge>, minWidth: 110 },
    { id: "duration", header: "Duration", cell: (r) => <V2MonoCell>{r.duration}</V2MonoCell>, minWidth: 100, align: "right" as const },
    { id: "cost", header: "Cost", cell: (r) => <V2MonoCell>{r.cost}</V2MonoCell>, minWidth: 90, align: "right" as const },
    { id: "created", header: "Created", cell: (r) => <V2MonoCell>{r.createdAt}</V2MonoCell>, minWidth: 110 },
  ];

  const scheduleColumns: V2TableColumn<(typeof SCHEDULES)[number]>[] = [
    { id: "name", header: "Schedule", cell: (r) => <span className={styles.wfaCellPrimary}>{r.name}</span>, minWidth: 220 },
    { id: "employee", header: "Employee", cell: (r) => r.employee, minWidth: 140 },
    { id: "cadence", header: "Cadence", cell: (r) => <span className={styles.wfaCellSecondary}>{r.cadence}</span>, minWidth: 200 },
    { id: "nextRun", header: "Next run", cell: (r) => <V2MonoCell>{r.nextRun}</V2MonoCell>, minWidth: 130 },
    { id: "status", header: "State", cell: (r) => <V2Badge tone={toneForStatus(r.status)} size="sm">{r.status}</V2Badge>, minWidth: 100 },
  ];

  const appColumns: V2TableColumn<(typeof APPS)[number]>[] = [
    { id: "name", header: "App", cell: (r) => <span className={styles.wfaCellPrimary}>{r.name}</span>, minWidth: 160 },
    { id: "status", header: "Connection", cell: (r) => <V2Badge tone={toneForStatus(r.status)} size="sm">{r.status}</V2Badge>, minWidth: 120 },
    { id: "tools", header: "Tools", cell: (r) => <V2MonoCell>{r.tools}</V2MonoCell>, minWidth: 90 },
    { id: "lastCall", header: "Last call", cell: (r) => <V2MonoCell>{r.lastCall}</V2MonoCell>, minWidth: 100 },
    { id: "health", header: "Health", cell: (r) => <V2Badge tone={toneForStatus(r.health)} size="sm">{r.health}</V2Badge>, minWidth: 110 },
  ];

  const employeeColumns: V2TableColumn<(typeof EMPLOYEES)[number]>[] = [
    { id: "name", header: "Employee", cell: (r) => <span className={styles.wfaCellPrimary}>{r.name}</span>, minWidth: 180 },
    { id: "role", header: "Role", cell: (r) => <V2MonoCell>{r.role}</V2MonoCell>, minWidth: 160 },
    { id: "status", header: "Status", cell: (r) => <V2Badge tone={toneForStatus(r.status)} size="sm">{r.status}</V2Badge>, minWidth: 100 },
    { id: "health", header: "Health", cell: (r) => <V2Badge tone={toneForStatus(r.health)} size="sm">{r.health}</V2Badge>, minWidth: 110 },
    { id: "runs", header: "Runs", cell: (r) => <V2MonoCell>{String(r.runs)}</V2MonoCell>, minWidth: 80, align: "right" as const },
    { id: "lastActive", header: "Active", cell: (r) => <V2MonoCell>{r.lastActive}</V2MonoCell>, minWidth: 100 },
  ];

  const skillColumns: V2TableColumn<(typeof SKILL_PACKS)[number]>[] = [
    { id: "name", header: "Skill pack", cell: (r) => <span className={styles.wfaCellPrimary}>{r.name}</span>, minWidth: 240 },
    { id: "version", header: "Version", cell: (r) => <V2MonoCell>{r.version}</V2MonoCell>, minWidth: 100 },
    { id: "status", header: "Status", cell: (r) => <V2Badge tone={toneForStatus(r.status as WfStatus)} size="sm">{r.status.replace("_", " ")}</V2Badge>, minWidth: 130 },
    { id: "employees", header: "Employees", cell: (r) => <V2MonoCell>{String(r.employees)}</V2MonoCell>, minWidth: 90, align: "right" as const },
    { id: "schedules", header: "Schedules", cell: (r) => <V2MonoCell>{String(r.schedules)}</V2MonoCell>, minWidth: 90, align: "right" as const },
  ];

  const renderOverview = () => (
    <div className={styles.wfaOverview}>
      <div className={styles.wfaStatGrid}>
        <StatRow label="Active Employees" value="2" detail="1 paused · 1 draft" />
        <StatRow label="Working Now" value="1" detail="Live preview runs" />
        <StatRow label="Pending Approvals" value="2" detail="Needs your review" tone="warning" />
        <StatRow label="Blocked / Failed" value="1" detail="Requires attention" tone="danger" />
        <StatRow label="Spend Today" value="$42.50" detail="$957.50 remaining" />
      </div>
      <SectionHead title="Missions in progress" desc="Static row list — no giant cards" action={<V2Button size="sm" variant="secondary">View all</V2Button>} />
      <div className={styles.wfaRowList}>
        {RUNS.slice(0, 3).map((r) => (
          <div key={r.id} className={styles.wfaRow}>
            <span className={styles.wfaRowDot} data-tone={toneForStatus(r.status)} aria-hidden />
            <div className={styles.wfaRowMain}>
              <p className={styles.wfaRowTitle}>{r.schedule} · {r.employee}</p>
              <p className={styles.wfaRowMeta}>{r.id.slice(0, 16)}… · {r.createdAt}</p>
            </div>
            <V2Badge tone={toneForStatus(r.status)} size="sm">{r.status}</V2Badge>
          </div>
        ))}
      </div>
      <SectionHead title="What changed · audit preview" desc="Digest uses same row/divider hierarchy" />
      <div className={styles.wfaRowList}>
        <div className={styles.wfaRow}><span className={styles.wfaRowIcon} aria-hidden>⊘</span><div className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Run failed — Monthly Finance Review</p><p className={styles.wfaRowMeta}>Finance Bot · 18m ago · schedule error</p></div><V2Badge tone="danger" size="sm">failed</V2Badge></div>
        <div className={styles.wfaRow}><span className={styles.wfaRowIcon} aria-hidden>◐</span><div className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Approval pending — billing refund</p><p className={styles.wfaRowMeta}>Support Bot · 4m ago · high risk</p></div><V2Badge tone="warning" size="sm">pending</V2Badge></div>
      </div>
    </div>
  );

  const renderRuns = () => (
    <div className={styles.wfaView}>
      <V2FilterBar query={query} onQueryChange={setQuery} placeholder="Search by employee or run ID…" filters={<V2FilterSelect label="Status" defaultValue="all"><option value="all">All statuses</option><option value="completed">Completed</option><option value="running">Running</option><option value="failed">Failed</option></V2FilterSelect>} />
      <V2DataTable columns={runColumns} rows={filteredRuns} rowKey={(r) => r.id} aria-label="Runs" density="comfortable" />
      <V2Pagination page={page} pageCount={1} onPageChange={setPage} totalLabel={`${filteredRuns.length} runs`} />
    </div>
  );

  const renderApprovals = () => (
    <div className={styles.wfaView}>
      <div className={styles.wfaApprovalQueue}>
        <h3 className={styles.wfaQueueTitle}>Pending Review · {APPROVALS_PENDING.length}</h3>
        <div className={styles.wfaRowList}>
          {APPROVALS_PENDING.map((a) => (
            <div key={a.id} className={styles.wfaApprovalRow}>
              <div className={styles.wfaRowMain}>
                <p className={styles.wfaRowTitle}>{a.title}</p>
                <p className={styles.wfaRowMeta}>{a.employee} · {a.createdAt} · risk {a.risk}</p>
              </div>
              <div className={styles.wfaApprovalActions}>
                <V2Button size="sm">Approve</V2Button>
                <V2Button size="sm" variant="secondary">Reject</V2Button>
                <V2Button size="sm" variant="ghost">Review</V2Button>
              </div>
            </div>
          ))}
        </div>
        <h3 className={styles.wfaQueueTitle}>History</h3>
        <div className={styles.wfaRowList}>
          <div className={styles.wfaRow}><span className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Send customer reply — approved</p><p className={styles.wfaRowMeta}>Support Bot · 2h ago · by sha</p></span><V2Badge tone="success" size="sm">approved</V2Badge></div>
        </div>
      </div>
    </div>
  );

  const renderRunDetail = () => {
    const run = RUNS.find((r) => r.id === detailId) ?? RUNS[0];
    return (
      <DetailShell
        breadcrumb={[{ id: "runs", label: "Runs", href: "#" }, { id: run.id, label: run.id.slice(0, 16) + "…", href: "#", current: true }]}
        title={run.schedule}
        status={{ label: run.status, tone: toneForStatus(run.status) }}
        actions={<><V2Button size="sm" variant="secondary">Rerun</V2Button><V2Button size="sm">View logs</V2Button></>}
        metadata={[{ label: "Employee", value: run.employee }, { label: "Schedule", value: run.schedule }, { label: "Duration", value: run.duration }, { label: "Cost", value: run.cost }]}
        tabs={[{ id: "timeline", label: "Timeline" }, { id: "evidence", label: "Evidence" }]}
        activeTab="timeline"
        onTabChange={() => {}}
        audit={<><DetailAuditRow actor="Support Bot" event="started run" time="2m ago" detail={run.id} /><DetailAuditRow actor="system" event="awaiting approval" time="1m ago" /></>}
      >
        <div className={styles.wfaRowList}>
          <div className={styles.wfaRow}><span className={styles.wfaRowIcon} aria-hidden>✓</span><div className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Step 1 · Fetch tickets</p><p className={styles.wfaRowMeta}>completed · 12s</p></div></div>
          <div className={styles.wfaRow}><span className={styles.wfaRowIcon} aria-hidden>◉</span><div className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Step 2 · Draft replies (approval gate)</p><p className={styles.wfaRowMeta}>pending approval</p></div><V2Badge tone="warning" size="sm">pending</V2Badge></div>
        </div>
      </DetailShell>
    );
  };

  const renderSettings = () => (
    <SettingsShell
      nav={[{ heading: "Workspace", items: [{ id: "business-profile", label: "Business Profile" }, { id: "default-policies", label: "Default Policies" }] }, { heading: "Operational", items: [{ id: "notifications", label: "Notifications" }, { id: "approvals", label: "Approvals" }] }]}
      activeId="business-profile"
      title="Settings"
      description="Business profile, default policies, and notification targets — V2 SettingsShell reused, no new visual language."
    >
      <SettingSection title="Organization" description="Business information shared with all employees.">
        <SettingRow label="Organization Name" value="Ethen Corp" actionLabel="Edit" />
        <SettingRow label="Default timezone" value="America/New_York" actionLabel="Edit" />
        <SettingRow label="Approval policy" value="High-risk requires human review" supporting="External sends, CRM updates, refunds gate on human decision." />
      </SettingSection>
      <SettingSection title="Notifications" description="Digest and escalation targets.">
        <SettingRow label="Digest cadence" value="Daily at 08:00" actionLabel="Edit" />
        <SettingRow label="Escalation channel" value="#ops-escalations" actionLabel="Edit" />
      </SettingSection>
    </SettingsShell>
  );

  const renderUsage = () => (
    <div className={styles.wfaView}>
      <div className={styles.wfaStatGrid}>
        <StatRow label="Total spend" value="$42.50" detail="This month" />
        <StatRow label="Budget remaining" value="$957.50" detail="Org monthly $1,000" tone="success" />
        <StatRow label="Runs today" value="18" detail="15 completed · 2 failed" />
        <StatRow label="Pending approvals" value="3" detail="Queue" tone="warning" />
      </div>
      <div className={styles.wfaTwoCol}>
        <section className={styles.wfaCardFlat}>
          <h3 className={styles.wfaCardTitle}>Cost by Employee</h3>
          <div className={styles.wfaRowList}>
            <div className={styles.wfaRow}><span className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Support Bot</p><p className={styles.wfaRowMeta}>18 runs</p></span><V2MonoCell>$18.20</V2MonoCell></div>
            <div className={styles.wfaRow}><span className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Sales Analyst</p><p className={styles.wfaRowMeta}>14 runs</p></span><V2MonoCell>$14.80</V2MonoCell></div>
            <div className={styles.wfaRow}><span className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Finance Bot</p><p className={styles.wfaRowMeta}>8 runs</p></span><V2MonoCell>$9.50</V2MonoCell></div>
          </div>
        </section>
        <section className={styles.wfaCardFlat}>
          <h3 className={styles.wfaCardTitle}>Budget caps</h3>
          <div className={styles.wfaRowList}>
            <div className={styles.wfaRow}><span className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Org Monthly Budget</p><p className={styles.wfaRowMeta}>$42.50 / $1,000</p></span><V2Badge tone="success" size="sm">healthy</V2Badge></div>
            <div className={styles.wfaRow}><span className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Support Bot Monthly</p><p className={styles.wfaRowMeta}>$18.20 / $200</p></span><V2Badge tone="success" size="sm">healthy</V2Badge></div>
          </div>
        </section>
      </div>
    </div>
  );

  let content: React.ReactNode = null;
  switch (activeView) {
    case "overview": content = renderOverview(); break;
    case "runs": content = renderRuns(); break;
    case "run-detail": content = renderRunDetail(); break;
    case "approvals": content = renderApprovals(); break;
    case "schedules": content = <div className={styles.wfaView}><V2DataTable columns={scheduleColumns} rows={SCHEDULES} rowKey={(r) => r.id} aria-label="Schedules" /><V2EmptyState title="No issues" description="All schedules healthy — flat row strip, not cards." /></div>; break;
    case "connected-apps": content = <div className={styles.wfaView}><V2DataTable columns={appColumns} rows={APPS} rowKey={(r) => r.id} aria-label="Connected apps" onToggleRow={(k) => setDetailId(k)} /><p className={styles.wfaHelper}>Tap a row to see detail — uses DetailShell pattern (see connected-app-detail).</p></div>; break;
    case "connected-app-detail": {
      const app = APPS.find((a) => a.id === detailId) ?? APPS[0];
      content = <DetailShell breadcrumb={[{ id: "apps", label: "Apps", href: "#" }, { id: app.id, label: app.name, href: "#", current: true }]} title={app.name} status={{ label: app.status, tone: toneForStatus(app.status) }} metadata={[{ label: "Tools", value: app.tools }, { label: "Last call", value: app.lastCall }, { label: "Health", value: app.health }]} audit={<DetailAuditRow actor="system" event={`checked ${app.name} health`} time="5m ago" />} > <div className={styles.wfaRowList}><div className={styles.wfaRow}><span className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Credential · healthy</p><p className={styles.wfaRowMeta}>Scopes: Tickets read/write</p></span><V2Badge tone="success" size="sm">healthy</V2Badge></div></div> </DetailShell>;
      break;
    }
    case "employees": content = <div className={styles.wfaView}><V2DataTable columns={employeeColumns} rows={EMPLOYEES} rowKey={(r) => r.id} aria-label="Employees" /><V2Pagination page={page} pageCount={1} onPageChange={setPage} totalLabel={`${EMPLOYEES.length} employees`} /></div>; break;
    case "employee-detail": {
      const emp = EMPLOYEES.find((e) => e.id === detailId) ?? EMPLOYEES[0];
      content = <DetailShell breadcrumb={[{ id: "employees", label: "Employees", href: "#" }, { id: emp.id, label: emp.name, href: "#", current: true }]} title={emp.name} status={{ label: emp.status, tone: toneForStatus(emp.status) }} metadata={[{ label: "Role", value: emp.role }, { label: "Health", value: emp.health }, { label: "Runs", value: String(emp.runs) }]} audit={<DetailAuditRow actor={emp.name} event="last active" time={emp.lastActive} />} > <div className={styles.wfaRowList}><div className={styles.wfaRow}><span className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>Responsibilities</p><p className={styles.wfaRowMeta}>Triage tickets, draft replies, detect escalations, summarize workload.</p></span></div></div> </DetailShell>;
      break;
    }
    case "skill-packs": content = <div className={styles.wfaView}><V2DataTable columns={skillColumns} rows={SKILL_PACKS} rowKey={(r) => r.id} aria-label="Skill packs" /></div>; break;
    case "skill-pack-detail": {
      const pack = SKILL_PACKS.find((p) => p.id === detailId) ?? SKILL_PACKS[0];
      content = <DetailShell breadcrumb={[{ id: "skill-packs", label: "Skill Packs", href: "#" }, { id: pack.id, label: pack.name, href: "#", current: true }]} title={pack.name} status={{ label: pack.status.replace("_", " "), tone: toneForStatus(pack.status as WfStatus) }} metadata={[{ label: "Version", value: pack.version }, { label: "Employees", value: String(pack.employees) }, { label: "Schedules", value: String(pack.schedules) }]} > <p className={styles.wfaSectionDesc}>Reusable capabilities — no backend copy, V2 rows/dividers only.</p> </DetailShell>;
      break;
    }
    case "reports": content = <div className={styles.wfaView}><div className={styles.wfaRowList}>{REPORTS.map((r) => <div key={r.id} className={styles.wfaRow}><span className={styles.wfaRowMain}><p className={styles.wfaRowTitle}>{r.title}</p><p className={styles.wfaRowMeta}>{r.employee} · {r.type} · {r.generatedAt}</p></span><V2Button size="sm" variant="secondary">Open</V2Button></div>)}</div></div>; break;
    case "usage": content = renderUsage(); break;
    case "settings": content = renderSettings(); break;
    default: content = renderOverview();
  }

  // Demo detail navigation helpers — allow clicking enterprise rows to show detail (opt-in, not auto)
  const isDetailView = activeView.endsWith("-detail");

  return (
    <div className={cn(styles.wfaShell, className)} data-ethen-v2 data-view={activeView}>
      <div className={styles.wfaTopbar}>
        <div className={styles.wfaBrand}>
          <span className={styles.wfaBrandTitle}>Flow</span>
          <span className={styles.wfaBrandMeta}>Enterprise operations · tables/rows · schedules · approvals</span>
        </div>
        <div className={styles.wfaTopActions}>
          {isDetailView ? <V2Button size="sm" variant="secondary" onClick={() => setView(activeView.replace("-detail", "") as WorkflowAutomationView)}>Back to list</V2Button> : null}
          <V2Badge tone="neutral" size="sm">Distinct from Flow (prompt-first)</V2Badge>
        </div>
      </div>
      <div className={styles.wfaNav}>
        <V2Tabs items={tabItems} value={isDetailView ? activeView.replace("-detail", "") : activeView} onValueChange={(id) => { setDetailId(null); setView(id as WorkflowAutomationView); }} />
        {["run-detail", "connected-app-detail", "employee-detail", "skill-pack-detail"].includes(activeView) ? null : (
          <div className={styles.wfaDetailShortcuts}>
            <span className={styles.wfaShortcutLabel}>Detail previews:</span>
            <button type="button" className={styles.wfaShortcutLink} onClick={() => { setDetailId(RUNS[0].id); setView("run-detail"); }}>Run</button>
            <button type="button" className={styles.wfaShortcutLink} onClick={() => { setDetailId(APPS[0].id); setView("connected-app-detail"); }}>App</button>
            <button type="button" className={styles.wfaShortcutLink} onClick={() => { setDetailId(EMPLOYEES[0].id); setView("employee-detail"); }}>Employee</button>
            <button type="button" className={styles.wfaShortcutLink} onClick={() => { setDetailId(SKILL_PACKS[1].id); setView("skill-pack-detail"); }}>Skill pack</button>
          </div>
        )}
      </div>
      <div className={styles.wfaBody}>{content}</div>
    </div>
  );
}
