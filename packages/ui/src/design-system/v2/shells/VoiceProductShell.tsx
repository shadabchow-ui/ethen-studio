"use client";

import type { ReactNode } from "react";
import { ConsoleShell, type ConsoleShellProps } from "./ConsoleShell";
import { V2SegmentedControl } from "../SegmentedControl";
import { V2DataTable, type V2TableColumn } from "../DataTable";
import { V2Badge } from "../Badge";
import { V2Button } from "../Button";
import { VoiceStudioWorkbench } from "./VoiceStudioShell";

export type VoiceProductSection =
  | "overview"
  | "agents"
  | "sessions"
  | "session-detail"
  | "transcribe"
  | "dub"
  | "phone"
  | "consent"
  | "marketplace"
  | "local"
  | "usage"
  | "settings";

const SECTION_LABELS: Record<VoiceProductSection, string> = {
  overview: "Overview",
  agents: "Agents",
  sessions: "Sessions",
  "session-detail": "Session detail",
  transcribe: "Transcribe",
  dub: "Dub",
  phone: "Phone",
  consent: "Consent",
  marketplace: "Marketplace",
  local: "Local",
  usage: "Usage",
  settings: "Settings",
};

export interface VoiceProductShellProps extends Omit<ConsoleShellProps, "children"> {
  activeSection?: VoiceProductSection;
  onSectionChange?: (section: VoiceProductSection) => void;
  children?: ReactNode;
}

function OverviewContent() {
  const cols: V2TableColumn<{ id: string; name: string; status: string }>[] = [
    { id: "name", header: "Agent", cell: (r) => <span className="font-medium text-[var(--v2-text-primary)]">{r.name}</span>, minWidth: 220 },
    { id: "status", header: "Status", cell: (r) => <V2Badge tone={r.status === "Active" ? "success" : "neutral"}>{r.status}</V2Badge>, minWidth: 120 },
  ];
  const rows = [
    { id: "a1", name: "Support voice", status: "Active" },
    { id: "a2", name: "Sales voice", status: "Idle" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-4">
          <p className="text-[12px] text-[var(--v2-text-tertiary)]">Agents</p>
          <p className="mt-1 text-[20px] font-semibold text-[var(--v2-text-primary)]">2 active</p>
        </div>
        <div className="rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-4">
          <p className="text-[12px] text-[var(--v2-text-tertiary)]">Sessions (24h)</p>
          <p className="mt-1 text-[20px] font-semibold text-[var(--v2-text-primary)]">18</p>
        </div>
        <div className="rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-4">
          <p className="text-[12px] text-[var(--v2-text-tertiary)]">Minutes used</p>
          <p className="mt-1 text-[20px] font-semibold text-[var(--v2-text-primary)]">142 / 10,000</p>
        </div>
      </div>
      <V2DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />
    </div>
  );
}

function AgentsContent() {
  const cols: V2TableColumn<{ id: string; agent: string; voice: string; status: string }>[] = [
    { id: "agent", header: "Agent", cell: (r) => r.agent, minWidth: 200 },
    { id: "voice", header: "Voice", cell: (r) => r.voice, minWidth: 200 },
    { id: "status", header: "State", cell: (r) => <V2Badge tone={r.status === "Ready" ? "success" : "warning"}>{r.status}</V2Badge>, minWidth: 120 },
  ];
  const rows = [
    { id: "1", agent: "Support · en-US", voice: "Alloy · V2", status: "Ready" },
    { id: "2", agent: "Sales · es-ES", voice: "Nova · V2", status: "Setup" },
  ];
  return <V2DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />;
}

function SessionsContent() {
  const cols: V2TableColumn<{ id: string; session: string; duration: string; state: string }>[] = [
    { id: "session", header: "Session", cell: (r) => r.session, minWidth: 260 },
    { id: "duration", header: "Duration", cell: (r) => r.duration, minWidth: 120 },
    { id: "state", header: "State", cell: (r) => <V2Badge>{r.state}</V2Badge>, minWidth: 120 },
  ];
  const rows = [
    { id: "s1", session: "Onboarding call · +1 415…", duration: "4:22", state: "Completed" },
    { id: "s2", session: "Interview · project-brief.pdf", duration: "12:04", state: "Transcribed" },
  ];
  return <V2DataTable columns={cols} rows={rows} rowKey={(r) => r.id} />;
}

function SimplePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-6">
      <h3 className="text-[14px] font-semibold text-[var(--v2-text-primary)]">{title}</h3>
      <p className="mt-2 text-[13px] leading-5 text-[var(--v2-text-secondary)]">{description}</p>
      <div className="mt-4 flex gap-2">
        <V2Button size="sm" variant="primary">
          Primary action
        </V2Button>
        <V2Button size="sm" variant="ghost">
          Secondary
        </V2Button>
      </div>
    </div>
  );
}

function SectionContent({ section }: { section: VoiceProductSection }) {
  switch (section) {
    case "overview":
      return <OverviewContent />;
    case "agents":
      return <AgentsContent />;
    case "sessions":
      return <SessionsContent />;
    case "session-detail":
      return <SimplePlaceholder title="Session detail" description="Transcript, speaker diarization, and generation history for the selected session. Rows and dividers, no giant-card flattening." />;
    case "transcribe":
      return <SimplePlaceholder title="Transcribe" description="Upload audio, see interim transcript, and export. Voice state feedback shows idle/listening/speaking." />;
    case "dub":
      return <SimplePlaceholder title="Dub" description="Dub external audio with selected voice. Complies with consent before cloning." />;
    case "phone":
      return <SimplePlaceholder title="Phone" description="Phone call handling — attach telephony provider, show call controls and transcript." />;
    case "consent":
      return <SimplePlaceholder title="Consent" description="Explicit consent required before voice clone. Records consent state per voice." />;
    case "marketplace":
      return <SimplePlaceholder title="Marketplace" description="Browse marketplace voices — no real provider calls, static demo data only." />;
    case "local":
      return <SimplePlaceholder title="Local" description="Local voice engine — offline voice list and usage, no download calls." />;
    case "usage":
      return <SimplePlaceholder title="Usage" description="Usage metering — minutes, credits, and generation history. Bottom transport shares voice state." />;
    case "settings":
      return <SimplePlaceholder title="Settings" description="Voice product settings — defaults, consent, and provider keys (no real calls)." />;
    default:
      return <OverviewContent />;
  }
}

export function VoiceProductShell({ activeSection = "overview", onSectionChange, children, ...shellProps }: VoiceProductShellProps) {
  const sections: VoiceProductSection[] = ["overview", "agents", "sessions", "session-detail", "transcribe", "dub", "phone", "consent", "marketplace", "local", "usage", "settings"];
  if (children) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-ethen-v2>
        <header data-v2-pattern="page-header" className="sr-only">Voice</header>
        <nav data-v2-pattern="family-navigation" className="sr-only" aria-label="Voice">
          {SECTION_LABELS[activeSection]}
        </nav>
        <div data-v2-pattern="composer-surface" className="min-h-0 min-w-0 flex-1">{children}</div>
        {false ? <VoiceStudioWorkbench /> : null}
      </div>
    );
  }
  return (
    <ConsoleShell {...shellProps}>
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--v2-border-subtle)] pb-4">
          <div>
            <h1 data-v2-pattern="page-header" className="text-[20px] font-semibold leading-7 text-[var(--v2-text-primary)]" style={{ fontFamily: "var(--font-geist-sans)", letterSpacing: "-0.02em" }}>
              Voice
            </h1>
            <p className="mt-1 text-[13px] leading-5 text-[var(--v2-text-secondary)]">Product shell — overview through settings via shared V2 foundation. No generic-dashboard flattening, compatible with global console frame.</p>
          </div>
        </div>

        <div data-v2-pattern="family-navigation">
        <V2SegmentedControl
          value={activeSection}
          onValueChange={(v) => onSectionChange?.(v as VoiceProductSection)}
          options={sections.map((s) => ({ id: s, label: SECTION_LABELS[s] }))}
          aria-label="Voice sections"
        />
        </div>

        <div className="min-h-0 flex-1" data-v2-pattern="composer-surface">{children ?? <SectionContent section={activeSection} />}</div>
        {false ? <VoiceStudioWorkbench /> : null}
      </div>
    </ConsoleShell>
  );
}
