"use client";

import * as React from "react";
import { V2DataTable, V2DataShell, V2FilterBar } from "../DataTable";
import { V2Badge } from "../Badge";
import { V2Button } from "../Button";
import { V2Tabs } from "../Tabs";
import { DetailShell } from "./DetailShell";
import type { V2TableColumn } from "../DataTable";

type InstanceRow = { id: string; name: string; status: string; gpu: string; region: string; cost: string };
const INSTANCES: InstanceRow[] = [
  { id: "i-1a2b", name: "train-a1", status: "Running", gpu: "H100 ×8", region: "us-west", cost: "$4.20/h" },
  { id: "i-3c4d", name: "eval-b2", status: "Stopped", gpu: "A100 ×4", region: "eu-west", cost: "$2.10/h" },
  { id: "i-5e6f", name: "sandbox-3", status: "Pending", gpu: "L4 ×1", region: "us-east", cost: "$0.60/h" },
  { id: "i-7g8h", name: "prod-infer", status: "Running", gpu: "H100 ×2", region: "us-west", cost: "$1.05/h" },
];

const TABS = [
  { id: "instances", label: "Instances" },
  { id: "plan", label: "Plan" },
  { id: "usage", label: "Usage" },
  { id: "settings", label: "Settings" },
];

export interface ComputeShellProps {
  activeTab?: string;
  onTabChange?: (id: string) => void;
  className?: string;
  title?: string;
  children?: React.ReactNode;
}

export function ComputeShell({ activeTab = "instances", onTabChange, className, title = "Compute", children }: ComputeShellProps) {
  const [active, setActive] = React.useState(activeTab);
  const handle = (id: string) => { setActive(id); onTabChange?.(id); };

  if (children) {
    return (
      <div className={className} data-ethen-v2 style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <header data-v2-pattern="page-header">
          <h1 className="text-[20px] font-medium text-[var(--v2-text-primary)]">{title}</h1>
        </header>
        <nav data-v2-pattern="compute-navigation" aria-label="Compute">
          <V2Tabs items={TABS} value={activeTab} onValueChange={(id) => onTabChange?.(id)} />
        </nav>
        <div data-v2-pattern="data-surface">{children}</div>
      </div>
    );
  }

  const columns: V2TableColumn<InstanceRow>[] = [
    { id: "name", header: "Instance", cell: (r) => <span className="font-medium text-[var(--v2-text-primary)]">{r.name}</span>, minWidth: 180 },
    { id: "id", header: "ID", cell: (r) => <span className="font-mono text-[var(--v2-text-tertiary)]">{r.id}</span>, minWidth: 120 },
    { id: "gpu", header: "Resources", cell: (r) => <span>{r.gpu}</span>, minWidth: 140 },
    { id: "region", header: "Region", cell: (r) => <span className="text-[var(--v2-text-tertiary)]">{r.region}</span>, minWidth: 100 },
    { id: "status", header: "Status", cell: (r) => <V2Badge tone={r.status === "Running" ? "success" : r.status === "Stopped" ? "neutral" : "warning"} size="sm">{r.status}</V2Badge>, minWidth: 110, align: "right" },
    { id: "cost", header: "Cost", cell: (r) => <span className="font-mono">{r.cost}</span>, minWidth: 100, align: "right" },
  ];

  return (
    <div className={className} data-ethen-v2 style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <header data-v2-pattern="page-header"><h1 className="sr-only">Compute</h1></header>
      <div data-v2-pattern="compute-navigation">
      <V2Tabs items={TABS} value={active} onValueChange={handle} />
      </div>

      {active === "instances" ? (
        <>
          <V2DataShell
            title="Instances"
            description="Analytical table density — dense rows + filter bar, not cards. Global frame compatible where applicable."
            actions={<><V2Button size="sm" variant="secondary">New instance</V2Button><V2Button size="sm" variant="ghost">Import</V2Button></>}
          >
            <V2FilterBar query="" onQueryChange={() => {}} placeholder="Search instances…" />
            <V2DataTable<InstanceRow> columns={columns} rows={INSTANCES} rowKey={(r) => r.id} density="compact" />
          </V2DataShell>

          {/* Instance detail — DetailShell */}
          <DetailShell
            breadcrumb={[{ id: "compute", label: "Compute", href: "#" }, { id: "instances", label: "Instances", href: "#" }, { id: "i-1a2b", label: "train-a1", current: true }]}
            title="train-a1"
            status={{ label: "Running", tone: "success" }}
            actions={<><V2Button size="sm" variant="secondary">Stop</V2Button><V2Button size="sm" variant="ghost">SSH</V2Button></>}
            metadata={[
              { label: "ID", value: "i-1a2b" },
              { label: "GPU", value: "H100 ×8" },
              { label: "Region", value: "us-west" },
              { label: "Cost", value: "$4.20/h" },
            ]}
            tabs={[{ id: "overview", label: "Overview" }, { id: "logs", label: "Logs" }]}
            activeTab="overview"
            onTabChange={() => {}}
            inspector={
              <>
                <div style={{ padding: 12, display: "grid", gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--v2-text-tertiary)" }}>Resource status</p>
                  <div className="flex justify-between text-[13px]"><span>CPU</span><span className="font-mono">42%</span></div>
                  <div className="flex justify-between text-[13px]"><span>GPU</span><span className="font-mono">78%</span></div>
                  <div className="flex justify-between text-[13px]"><span>Memory</span><span className="font-mono">31 GB / 64 GB</span></div>
                  <V2Badge tone="success" size="sm">Healthy</V2Badge>
                </div>
              </>
            }
          >
            <div style={{ padding: 12, fontSize: 13, color: "var(--v2-text-secondary)" }}>Instance detail uses the shared DetailShell — same family as Runs. Inspector at 320/404 via shell contract.</div>
          </DetailShell>
        </>
      ) : active === "plan" ? (
        <div style={{ border: "1px solid var(--v2-border-subtle)", borderRadius: "var(--v2-radius-base)", overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--v2-border-subtle)", background: "var(--v2-raised)", fontSize: 12, fontWeight: 600, color: "var(--v2-text-primary)" }}>Plan</div>
          <div style={{ padding: 12, display: "grid", gap: 8, fontSize: 13 }}>
            <div className="flex justify-between"><span>Current plan</span><strong>Pro · $199/mo</strong></div>
            <div className="flex justify-between text-[var(--v2-text-tertiary)]"><span>Included GPU hours</span><span>100h</span></div>
            <V2Button size="sm" variant="secondary">Manage plan</V2Button>
          </div>
        </div>
      ) : active === "usage" ? (
        <div style={{ border: "1px solid var(--v2-border-subtle)", borderRadius: "var(--v2-radius-base)", overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--v2-border-subtle)", background: "var(--v2-raised)", fontSize: 12, fontWeight: 600, color: "var(--v2-text-primary)" }}>Usage</div>
          <div style={{ padding: 12, display: "grid", gap: 10 }}>
            <div style={{ height: 48, borderRadius: "var(--v2-radius-base)", background: "var(--v2-hover)", display: "flex", alignItems: "end", gap: 4, padding: 8 }}><span style={{ flex: 1, height: 24, background: "var(--v2-text-primary)", borderRadius: 4 }} /><span style={{ flex: 1, height: 16, background: "var(--v2-border-strong)", borderRadius: 4 }} /><span style={{ flex: 1, height: 32, background: "var(--v2-text-primary)", borderRadius: 4 }} /><span style={{ flex: 1, height: 12, background: "var(--v2-border-strong)", borderRadius: 4 }} /></div>
            <span className="text-[12px] text-[var(--v2-text-tertiary)]">Chart is flat bars using V2 tokens — no chart library, analytical density preserved.</span>
          </div>
        </div>
      ) : (
        <div style={{ border: "1px solid var(--v2-border-subtle)", borderRadius: "var(--v2-radius-base)", overflow: "hidden" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--v2-border-subtle)", background: "var(--v2-raised)", fontSize: 12, fontWeight: 600, color: "var(--v2-text-primary)" }}>Settings</div>
          <div style={{ padding: 12, display: "grid", gap: 8, fontSize: 13 }}>
            <label className="flex items-center justify-between gap-3">Auto-stop idle instances <span className="text-[var(--v2-text-tertiary)]">Enabled</span></label>
            <label className="flex items-center justify-between gap-3">Region default <span className="text-[var(--v2-text-tertiary)]">us-west</span></label>
          </div>
        </div>
      )}
    </div>
  );
}
