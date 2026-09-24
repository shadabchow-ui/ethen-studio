"use client";

import * as React from "react";
import { V2Tabs } from "../Tabs";
import { V2DataTable, V2DataShell } from "../DataTable";
import { V2Badge } from "../Badge";
import { V2Button } from "../Button";
import type { V2TableColumn } from "../DataTable";

/* Sample data — deterministic, no backend */
const BENCHMARKS = [
  { id: "intelligence", label: "Intelligence", value: "72.4", delta: "+1.2" },
  { id: "speed", label: "Speed", value: "142 tok/s", delta: "—" },
  { id: "context", label: "Context", value: "200k", delta: "+32k" },
  { id: "price", label: "Price", value: "$3.20 /M", delta: "-8%" },
];

type ModelRow = { id: string; model: string; provider: string; intelligence: string; price: string; context: string; category: string };
const MODEL_ROWS: ModelRow[] = [
  { id: "m1", model: "Claude 4 Opus", provider: "Anthropic", intelligence: "78.2", price: "$15.00", context: "200k", category: "Flagship" },
  { id: "m2", model: "GPT-5", provider: "OpenAI", intelligence: "76.9", price: "$12.00", context: "128k", category: "Flagship" },
  { id: "m3", model: "Gemini 2.5 Pro", provider: "Google", intelligence: "75.1", price: "$7.00", context: "1M", category: "Long context" },
  { id: "m4", model: "Llama 4 Maverick", provider: "Meta", intelligence: "70.4", price: "$1.10", context: "128k", category: "Open" },
  { id: "m5", model: "Mistral Large 3", provider: "Mistral", intelligence: "68.8", price: "$2.00", context: "128k", category: "Efficient" },
];

const SCORE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "benchmarks", label: "Benchmarks" },
  { id: "categories", label: "Categories" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "providers", label: "Providers" },
];

export interface ModelIntelligenceShellProps {
  activeNav?: string;
  onNavChange?: (id: string) => void;
  categoryFilter?: string;
  onCategoryFilter?: (c: string) => void;
  className?: string;
  title?: string;
  children?: React.ReactNode;
}

export function ModelIntelligenceShell({ activeNav = "leaderboard", onNavChange, categoryFilter = "All", onCategoryFilter, className, title = "Leaderboards", children }: ModelIntelligenceShellProps) {
  const [active, setActive] = React.useState(activeNav);
  const handleNav = (id: string) => { setActive(id); onNavChange?.(id); };
  const filtered = React.useMemo(() => (categoryFilter === "All" ? MODEL_ROWS : MODEL_ROWS.filter((r) => r.category === categoryFilter)), [categoryFilter]);

  if (children) {
    return (
      <div className={className} data-ethen-v2 style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <header data-v2-pattern="page-header">
          <h1 className="text-[20px] font-medium text-[var(--v2-text-primary)]">{title}</h1>
        </header>
        <nav data-v2-pattern="family-navigation" aria-label="Leaderboards">
          <V2Tabs items={SCORE_TABS} value={activeNav} onValueChange={(id) => onNavChange?.(id)} />
        </nav>
        <div data-v2-pattern="data-surface">{children}</div>
      </div>
    );
  }

  const columns: V2TableColumn<ModelRow>[] = [
    { id: "model", header: "Model", cell: (r) => <span className="font-medium text-[var(--v2-text-primary)]">{r.model}</span>, minWidth: 200 },
    { id: "provider", header: "Provider", cell: (r) => <V2Badge tone="neutral" size="sm">{r.provider}</V2Badge>, minWidth: 140 },
    { id: "category", header: "Category", cell: (r) => <span className="text-[var(--v2-text-tertiary)]">{r.category}</span>, minWidth: 120 },
    { id: "intel", header: "Intelligence", cell: (r) => <span className="font-mono text-[var(--v2-text-primary)]">{r.intelligence}</span>, align: "right", minWidth: 110 },
    { id: "price", header: "Price /M", cell: (r) => <span className="font-mono">{r.price}</span>, align: "right", minWidth: 100 },
    { id: "context", header: "Context", cell: (r) => <span className="font-mono">{r.context}</span>, align: "right", minWidth: 90 },
  ];

  return (
    <div className={className} data-ethen-v2 style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <header data-v2-pattern="page-header"><h1 className="sr-only">Leaderboards</h1></header>
      {/* Category / navigation row — analytical density preserved via tabs + badges, no cards */}
      <div data-v2-pattern="family-navigation" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, borderBottom: "1px solid var(--v2-border-subtle)", paddingBottom: 12 }}>
        <V2Tabs items={SCORE_TABS} value={active} onValueChange={handleNav} />
        <span style={{ flex: 1 }} />
        <span className="hidden sm:inline-flex items-center gap-2 text-[12px] text-[var(--v2-text-tertiary)]">Category<V2Button size="sm" variant="ghost" onClick={() => onCategoryFilter?.(categoryFilter === "All" ? "Flagship" : "All")}>{categoryFilter} ▾</V2Button></span>
      </div>

      {/* Metrics — flat row/divider, not cards, charts simplified to bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {BENCHMARKS.map((b) => (
          <div key={b.id} style={{ border: "1px solid var(--v2-border-subtle)", borderRadius: "var(--v2-radius-base)", padding: "10px 12px", background: "var(--v2-surface)" }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--v2-text-tertiary)", fontWeight: 600 }}>{b.label}</p>
            <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 600, color: "var(--v2-text-primary)" }}>{b.value} <span style={{ fontSize: 12, fontWeight: 400, color: b.delta.startsWith("+") ? "var(--v2-status-success)" : b.delta.startsWith("-") ? "var(--v2-status-success)" : "var(--v2-text-tertiary)" }}>{b.delta}</span></p>
            <div style={{ marginTop: 8, height: 4, borderRadius: 999, background: "var(--v2-hover)", overflow: "hidden" }}><span style={{ display: "block", width: `${42 + parseFloat(b.value) % 50}%`, height: "100%", background: "var(--v2-text-primary)" }} /></div>
          </div>
        ))}
      </div>

      {/* Comparison table — V2DataTable dense */}
      <V2DataShell
        title="Model comparison"
        description="Leaderboard filtered by benchmark and category — analytical density via dense rows, not cards. Same component family as DL2-18."
        actions={<><V2Button size="sm" variant="secondary">Export CSV</V2Button><V2Button size="sm" variant="ghost">Compare</V2Button></>}
      >
        <V2DataTable<ModelRow> columns={columns} rows={filtered} rowKey={(r) => r.id} density="compact" emptyState="No models for filter" />
      </V2DataShell>

      {/* Provider / model detail — flat inspection rows */}
      <div className="grid gap-3 md:grid-cols-2">
        <div style={{ border: "1px solid var(--v2-border-subtle)", borderRadius: "var(--v2-radius-base)", overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--v2-border-subtle)", background: "var(--v2-raised)", fontSize: 12, fontWeight: 600, color: "var(--v2-text-primary)" }}>Provider detail — Anthropic</div>
          <div style={{ padding: 12, display: "grid", gap: 8, fontSize: 13, color: "var(--v2-text-secondary)" }}>
            <div className="flex justify-between"><span>Models</span><strong className="text-[var(--v2-text-primary)]">14</strong></div>
            <div className="flex justify-between"><span>Avg intelligence</span><span className="font-mono">74.1</span></div>
            <div className="flex justify-between"><span>Top model</span><span>Claude 4 Opus</span></div>
          </div>
        </div>
        <div style={{ border: "1px solid var(--v2-border-subtle)", borderRadius: "var(--v2-radius-base)", overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--v2-border-subtle)", background: "var(--v2-raised)", fontSize: 12, fontWeight: 600, color: "var(--v2-text-primary)" }}>Model detail — Claude 4 Opus</div>
          <div style={{ padding: 12, display: "grid", gap: 6, fontSize: 13 }}>
            <span className="font-mono text-[var(--v2-text-tertiary)]">claude-4-opus@20250805 · 200k</span>
            <span style={{ color: "var(--v2-text-secondary)" }}>Flagship reasoning, tool use, and long-context. Use via Gateway routing.</span>
            <span><V2Badge tone="success" size="sm">Verified</V2Badge> <V2Badge tone="neutral" size="sm">200k</V2Badge></span>
          </div>
        </div>
      </div>
    </div>
  );
}
