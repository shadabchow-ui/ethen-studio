"use client";

import * as React from "react";
import { V2Composer } from "../Composer";
import { V2Badge } from "../Badge";
import { V2Button, V2IconButton } from "../Button";
import { V2Tabs } from "../Tabs";
import { V2FilterBar } from "../DataTable";
import { V2SegmentedControl } from "../SegmentedControl";

type Template = { id: string; label: string; desc: string };
const TEMPLATES: Template[] = [
  { id: "prototype", label: "Prototype", desc: "Clickable flow" },
  { id: "slides", label: "Slides", desc: "Narrative deck" },
  { id: "document", label: "Document", desc: "Spec layout" },
  { id: "wireframe", label: "Wireframe", desc: "Screen system" },
  { id: "animation", label: "Animation", desc: "Motion board" },
];

type LibraryRow = { id: string; title: string; subtitle: string; viewed: string; owner: string; access: string };
const LIB_ROWS: LibraryRow[] = [
  { id: "r1", title: "Ethen Liquid Glass Design System", subtitle: "Interface primitives · 42 screens", viewed: "7 days ago", owner: "You", access: "Private" },
  { id: "r2", title: "# Ethen Liquid Glass Implementation", subtitle: "Build-ready UI handoff", viewed: "7 days ago", owner: "You", access: "Team" },
  { id: "r3", title: "Ethen AI Operating Console", subtitle: "Agent shell and panel states", viewed: "Jul 1", owner: "You", access: "Private" },
  { id: "r4", title: "# Ethen Design Agent Landing Page", subtitle: "Ethen dark design home", viewed: "Jun 29", owner: "Design", access: "Public" },
];

/**
 * Designer Agent product shell — interior workspace for /designer.
 * Compact design mode rail (56 collapsed, 36 nav rows, 6px), design header (56 topbar pattern without serif),
 * V2Composer, starter templates as 6px bordered grid, blank project ghost, library tabs/search/list-grid/project rows.
 * Shared Composer/files/model/rows/menus/workbench primitives. Global frame compatible (256 sidebar, 56 topbar outside).
 */
export function DesignerAgentShell({ className, title = "Designer", children }: { className?: string; title?: string; children?: React.ReactNode }) {
  const [composerValue, setComposerValue] = React.useState("");
  const [activeTab, setActiveTab] = React.useState("projects");
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<"list" | "grid">("list");
  const [selectedTemplate, setSelectedTemplate] = React.useState<string | null>(null);

  if (children) {
    return (
      <div className={className ?? "flex min-h-0 min-w-0 flex-1 flex-col"} data-testid="designer-agent-shell" data-ethen-v2>
        <header data-v2-pattern="page-header" className="sr-only">{title}</header>
        <div data-v2-pattern="composer-surface" className="min-h-0 min-w-0 flex-1">{children}</div>
      </div>
    );
  }

  const filtered = LIB_ROWS.filter((r) => `${r.title} ${r.subtitle}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className={className ?? "flex flex-col gap-6"} data-testid="designer-agent-shell">
      {/* Interior workspace frame — simulates compact design rail + main */}
      <div className="flex min-h-[640px] overflow-hidden rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-subtle)] bg-[var(--v2-canvas)]">
        {/* Compact design mode rail — V2 56 collapsed pattern, 36 rows, 6px */}
        <aside className="hidden w-[56px] shrink-0 flex-col items-center gap-2 border-r border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] py-3 md:flex" aria-label="Design mode rail">
          {["⌂", "▣", "◌", "✧", "☆", "☰", "◇", "□"].map((icon, i) => (
            <V2IconButton key={i} size="sm" variant="ghost" label={`Design mode ${i + 1}`} className={i === 1 ? "!bg-[var(--v2-selected)] !text-[var(--v2-text-primary)]" : ""}>
              <span aria-hidden className="text-[12px]">{icon}</span>
            </V2IconButton>
          ))}
          <div className="mt-auto">
            <V2IconButton size="sm" label="New design" variant="default">
              <span aria-hidden>+</span>
            </V2IconButton>
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1 overflow-hidden bg-[var(--v2-canvas)]">
          {/* Design-specific header — 56 topbar pattern, no serif, Geist Sans */}
          <header className="flex h-14 items-center justify-between border-b border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] px-4">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--v2-text-primary)]">Ethen Design</span>
              <V2Badge tone="neutral" size="sm">Beta</V2Badge>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="hidden text-[12px] text-[var(--v2-text-tertiary)] hover:text-[var(--v2-text-primary)] sm:block">What’s new</button>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--v2-raised)] text-[10px] font-semibold text-[var(--v2-text-secondary)]">S</span>
            </div>
          </header>

          <div className="mx-auto max-w-[1040px] px-4 pb-6 pt-6">
            {/* Title */}
            <div className="mx-auto max-w-[760px] text-center">
              <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--v2-text-primary)]">What should we design?</h2>
              <p className="mt-1 font-mono text-[12px] text-[var(--v2-text-tertiary)]">Live design generation is ready</p>
            </div>

            {/* Design Composer — shared V2Composer, 12px, caret focus only */}
            <div className="mx-auto mt-5 max-w-[760px]">
              <V2Composer
                value={composerValue}
                onValueChange={setComposerValue}
                placeholder="Describe what you want to design…"
                onSend={(v) => setComposerValue(`Drafting: ${v}`)}
                statusText="Models, files, and design systems are shared V2 controls."
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { label: "Design System", icon: "✣" },
                  { label: "Template", icon: "▦" },
                  { label: "Prototype", icon: "▯" },
                  { label: "Wireframe", icon: "▤" },
                  { label: "Slides", icon: "▭" },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setComposerValue((v) => (v ? `${v} ${p.label}` : p.label))}
                    className="inline-flex h-7 items-center gap-1.5 rounded-[var(--v2-radius-base)] border border-[var(--v2-border-default)] bg-[var(--v2-surface)] px-2.5 text-[length:var(--v2-type-secondary-size)] text-[var(--v2-text-secondary)] hover:bg-[var(--v2-hover)] hover:text-[var(--v2-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-focus)]"
                  >
                    <span aria-hidden className="text-[length:var(--v2-type-secondary-size)] text-[var(--v2-text-tertiary)]">{p.icon}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Starter templates — 6px bordered grid, no rotation, no giant overlap */}
            <section className="mx-auto mt-6 max-w-[760px]" aria-label="Starter templates">
              <p className="mb-2 text-center font-mono text-[12px] text-[var(--v2-text-tertiary)]">Start with a template…</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={selectedTemplate === t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className="grid place-items-center gap-1 rounded-[var(--v2-radius-base)] border bg-[var(--v2-surface)] p-3 text-center hover:bg-[var(--v2-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-focus)]"
                    style={{
                      borderColor: selectedTemplate === t.id ? "var(--v2-border-strong)" : "var(--v2-border-subtle)",
                      background: selectedTemplate === t.id ? "var(--v2-selected)" : "var(--v2-surface)",
                      minHeight: 88,
                    }}
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] text-[14px] text-[var(--v2-text-tertiary)]" aria-hidden>
                      {t.id === "prototype" ? "▱" : t.id === "slides" ? "▭" : t.id === "document" ? "▭" : "⊞"}
                    </span>
                    <span className="text-[12px] font-medium text-[var(--v2-text-primary)]">{t.label}</span>
                    <span className="text-[12px] text-[var(--v2-text-tertiary)]">{t.desc}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setComposerValue("Blank project — start from scratch")}
                className="mx-auto mt-3 flex items-center gap-1 text-[12px] text-[var(--v2-text-tertiary)] hover:text-[var(--v2-text-primary)]"
              >
                …or start a blank project <span aria-hidden>→</span>
              </button>
            </section>

            {/* Library — tabs + searchable + list/grid + project rows (row/divider, not giant cards) */}
            <section className="mt-8" aria-label="Design library">
              <div className="flex flex-wrap items-center gap-2">
                <V2Tabs
                  items={[
                    { id: "projects", label: "Projects" },
                    { id: "systems", label: "Design systems" },
                    { id: "templates", label: "Templates" },
                    { id: "exports", label: "Exports" },
                  ]}
                  value={activeTab}
                  onValueChange={setActiveTab}
                />
                <div className="ml-auto flex items-center gap-2">
                  <V2FilterBar query={query} onQueryChange={setQuery} placeholder="Search designs" />
                  <V2SegmentedControl
                    value={view}
                    onValueChange={(v) => setView(v as "list" | "grid")}
                    options={[
                      { id: "list", label: "List" },
                      { id: "grid", label: "Grid" },
                    ]}
                    size="sm"
                    aria-label="View mode"
                  />
                </div>
              </div>

              {/* List vs Grid */}
              {view === "list" ? (
                <div className="mt-3 overflow-hidden rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)]">
                  <div className="grid grid-cols-[minmax(0,1fr)_110px_90px_90px_44px] gap-2 border-b border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] px-3 py-2 text-[length:var(--v2-type-metadata-size)] font-medium text-[var(--v2-text-tertiary)]">
                    <span>Name</span>
                    <span>Last viewed</span>
                    <span>Owner</span>
                    <span>Access</span>
                    <span className="text-right" aria-hidden>⋯</span>
                  </div>
                  {filtered.map((r) => (
                    <div
                      key={r.id}
                      className="grid min-h-[48px] grid-cols-[minmax(0,1fr)_110px_90px_90px_44px] items-center gap-2 border-b border-[var(--v2-border-subtle)] px-3 last:border-b-0 hover:bg-[var(--v2-hover)]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-8 w-12 shrink-0 place-items-center overflow-hidden rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] text-[10px] text-[var(--v2-text-tertiary)]" aria-hidden>
                          ▭
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-[var(--v2-text-primary)]">{r.title}</span>
                          <span className="block truncate font-mono text-[12px] text-[var(--v2-text-tertiary)]">{r.subtitle}</span>
                        </span>
                      </div>
                      <span className="text-[12px] text-[var(--v2-text-secondary)]">{r.viewed}</span>
                      <span className="flex items-center gap-1.5 text-[12px] text-[var(--v2-text-secondary)]">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--v2-raised)] text-[9px] font-semibold text-[var(--v2-text-secondary)]">{r.owner.slice(0, 1)}</span>
                        {r.owner}
                      </span>
                      <span className="text-[12px] text-[var(--v2-text-tertiary)]">{r.access}</span>
                      <span className="flex justify-end gap-1">
                        <V2IconButton size="sm" variant="ghost" label={`Star ${r.title}`}><span aria-hidden>☆</span></V2IconButton>
                        <V2IconButton size="sm" variant="ghost" label={`Actions for ${r.title}`}><span aria-hidden>⋯</span></V2IconButton>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {filtered.map((r) => (
                    <div key={r.id} className="overflow-hidden rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] hover:bg-[var(--v2-hover)]">
                      <div className="grid h-20 place-items-center border-b border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] text-[12px] text-[var(--v2-text-tertiary)]">Preview</div>
                      <div className="p-3">
                        <p className="truncate text-[13px] font-medium text-[var(--v2-text-primary)]">{r.title}</p>
                        <p className="truncate text-[12px] text-[var(--v2-text-tertiary)]">{r.subtitle}</p>
                        <p className="mt-2 flex items-center gap-1 text-[12px] text-[var(--v2-text-tertiary)]">
                          <span className="h-1 w-1 rounded-full bg-[var(--v2-text-tertiary)]" aria-hidden /> {r.viewed} · {r.access}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 font-mono text-[12px] text-[var(--v2-text-tertiary)]">Searchable library: {filtered.length} of {LIB_ROWS.length} · list/grid share same data, no giant overlapping cards, 6px radius.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
