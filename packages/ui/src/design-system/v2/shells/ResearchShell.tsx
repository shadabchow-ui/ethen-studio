"use client";

import * as React from "react";
import { ResizableWorkbenchShell } from "../ResizableWorkbenchShell";
import { V2Badge } from "../Badge";
import { V2Button } from "../Button";
import { V2Composer } from "../Composer";
import { V2MoreMenu } from "../DropdownMenu";
import { V2EmptyState } from "../DataTable";
import { V2ArtifactState, V2Provenance } from "../AgentExecution";
import { AssistantRail } from "./AssistantRail";

const SAMPLE_SOURCES = [
  { id: "s1", title: "Anthropic — Claude 4 system card", locator: "anthropic.com/research · 2025-08-01", verified: true },
  { id: "s2", title: "Ethen gateway routing spec", locator: "repo @ 9a12b7e", verified: true },
  { id: "s3", title: "Vercel parity spec §3.2", locator: "parity-spec.md", verified: false },
];

const SAMPLE_ARTIFACTS = [
  { name: "research-brief.md", version: "4", type: "MD", status: "ready" as const },
  { name: "evidence.jsonl", version: "2", type: "JSONL", status: "ready" as const },
  { name: "capture.png", version: "1", type: "PNG", status: "pending" as const },
];

export interface ResearchShellProps {
  threadState?: "empty" | "active" | "error";
  className?: string;
  title?: string;
  children?: React.ReactNode;
}

export function ResearchShell({ threadState = "active", className, title = "Research", children }: ResearchShellProps) {
  const [composerValue, setComposerValue] = React.useState("");

  if (children) {
    return (
      <div className={className} data-ethen-v2 style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
        <header data-v2-pattern="page-header">
          <h1 className="text-[20px] font-medium text-[var(--v2-text-primary)]">{title}</h1>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
        <div data-v2-pattern="composer-surface">
          <V2Composer placeholder="Follow up on this research…" value="" onValueChange={() => {}} state="idle" />
        </div>
      </div>
    );
  }

  const workArea = (
    <div className="flex h-full flex-col overflow-hidden" aria-label="Research thread work area">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] px-3">
        <span className="text-[12px] font-medium text-[var(--v2-text-secondary)]">Research thread</span>
        <span className="flex items-center gap-2"><V2Badge tone="info" size="sm">3 sources</V2Badge><V2MoreMenu items={[{ label: "Export brief", onSelect: () => {} }, { label: "Clear thread", onSelect: () => {} }]} /></span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3" tabIndex={0} role="region" aria-label="Research thread">
        {threadState === "empty" ? (
          <V2EmptyState title="Start a research thread" description="Ask a question to populate the work area, sources, and artifacts." action={<V2Button size="sm">New thread</V2Button>} />
        ) : threadState === "error" ? (
          <div className="grid gap-3 rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-3">
            <p className="text-[13px] font-medium text-[var(--v2-text-primary)]">Research capture failed</p>
            <p className="text-[12px] text-[var(--v2-text-tertiary)]">Static error specimen — retry would re-run the capture.</p>
            <V2Button size="sm" variant="secondary">Retry</V2Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-3">
              <p className="text-[12px] font-medium text-[var(--v2-text-tertiary)]">Prompt</p>
              <p className="mt-1 text-[14px] leading-6 text-[var(--v2-text-primary)]">How does the gateway route between Muse and GPT-5 for long-context tasks?</p>
            </div>
            <div className="rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-3">
              <p className="text-[12px] font-medium text-[var(--v2-text-tertiary)]">Synthesis</p>
              <p className="mt-1 text-[13px] leading-5 text-[var(--v2-text-secondary)]">Gateway prefers Muse for 200k context; GPT-5 for tool use. Sources below provide provenance.</p>
              <div className="mt-2 flex flex-wrap gap-2"><V2Badge tone="success" size="sm">Verified</V2Badge><V2Badge tone="neutral" size="sm">3 captures</V2Badge></div>
            </div>
            <V2Provenance source="Synthesis" locator="research-brief.md@a1b2c3" capturedAt="09:14:22" verified />
          </div>
        )}
      </div>
    </div>
  );

  const sources = (
    <div className="flex h-full flex-col overflow-hidden" aria-label="Sources and evidence">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] px-3">
        <span className="text-[12px] font-medium text-[var(--v2-text-secondary)]">Sources / Evidence</span>
        <V2Badge tone="neutral" size="sm">{SAMPLE_SOURCES.length}</V2Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" tabIndex={0} role="region" aria-label="Sources and evidence list">
        {SAMPLE_SOURCES.map((s) => (
          <div key={s.id} className="flex min-h-[44px] items-center justify-between gap-3 border-b border-[var(--v2-border-subtle)] px-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-[var(--v2-text-primary)]">{s.title}</p>
              <p className="truncate font-mono text-[11px] text-[var(--v2-text-tertiary)]">{s.locator}</p>
            </div>
            <V2Badge tone={s.verified ? "success" : "warning"} size="sm">{s.verified ? "Verified" : "Unverified"}</V2Badge>
          </div>
        ))}
        <div className="p-3">
          <p className="text-[12px] font-semibold text-[var(--v2-text-tertiary)]">Artifacts</p>
          <div className="mt-2 grid gap-1">
            {SAMPLE_ARTIFACTS.map((a) => (
              <V2ArtifactState key={a.name} name={a.name} version={a.version} type={a.type} status={a.status} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const composer = (
    <div data-v2-pattern="composer-surface">
    <V2Composer
      placeholder="Follow up on this research… composer is caret-only, no blue focus"
      value={composerValue}
      onValueChange={setComposerValue}
      onSend={() => setComposerValue("")}
      state="idle"
    />
    </div>
  );

  return (
    <div className={className} data-ethen-v2 style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <header data-v2-pattern="page-header"><h1 className="sr-only">Research</h1></header>
      {/* Top: thread + sources side-by-side via resizable workbench; rail owns context */}
      <ResizableWorkbenchShell left={workArea} main={sources} right={<AssistantRail context={{ title: "Research context", subtitle: "Sources, captures, and citations for this thread.", eyebrow: "Context rail 320/404" }} messages={[{ id: "m1", role: "assistant", text: "The right rail stays within ConsoleShell's 320/404 slot and owns its own scrolling." }]} footerNote="Rail width set by ConsoleShell, not by shell interior." />} bottom={composer} defaultLeftWidth={420} defaultRightWidth={320} defaultBottomHeight={140} />
    </div>
  );
}
