"use client";

import * as React from "react";
import { V2Badge } from "../Badge";
import { V2Button } from "../Button";
import { V2Banner } from "../Banner";
import { V2MoreMenu } from "../DropdownMenu";
import { V2ExecutionTimeline, V2ApprovalRequest, V2TrustEvidence, V2Provenance } from "../AgentExecution";
import { ResizableWorkbenchShell } from "../ResizableWorkbenchShell";

const BROWSER_URL = "https://example.com/dashboard";
const TIMELINE = [
  { id: "b1", title: "Session started", detail: "Browser viewport opened", time: "11:02:01", state: "completed" as const },
  { id: "b2", title: "Agent navigating", detail: "Clicked Pricing · waiting for approval", time: "11:02:18", state: "waiting" as const },
  { id: "b3", title: "Approval required", detail: "Navigate to external domain", time: "11:02:18", state: "approval" as const },
];

export interface BrowserShellProps {
  state?: "idle" | "running" | "approval" | "denied";
  onApprove?: () => void;
  onDeny?: () => void;
  className?: string;
  title?: string;
  children?: React.ReactNode;
}

export function BrowserShell({ state = "approval", onApprove, onDeny, className, title = "Browser", children }: BrowserShellProps) {
  if (children) {
    return (
      <div className={className} data-ethen-v2 style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <header data-v2-pattern="page-header">
          <h1 className="text-[20px] font-medium text-[var(--v2-text-primary)]">{title}</h1>
        </header>
        <nav data-v2-pattern="family-navigation" aria-label="Browser sessions">
          <V2Badge tone="info" size="sm">{state}</V2Badge>
        </nav>
        {children}
      </div>
    );
  }
  return (
    <div className={className} data-ethen-v2 style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <header data-v2-pattern="page-header"><h1 className="sr-only">Browser</h1></header>
      <nav data-v2-pattern="family-navigation" className="sr-only">Browser</nav>
      {/* Trust + approval explicit */}
      <V2Banner tone={state === "approval" ? "warning" : state === "denied" ? "danger" : "neutral"} title={state === "approval" ? "Approval required before navigation" : state === "denied" ? "Navigation denied" : "Browser session"}>
        <span>Browser trust is explicit — no silent navigation to <span className="font-mono">{BROWSER_URL}</span> occurs until approved. {state === "approval" ? "Lab-only gate." : ""}</span>
      </V2Banner>
      <div className="flex flex-wrap items-center gap-2">
        <V2Badge tone={state === "approval" ? "warning" : state === "denied" ? "danger" : "info"} size="sm">{state}</V2Badge>
        <V2TrustEvidence state={state === "denied" ? "restricted" : "verified"} detail={state === "approval" ? "awaiting user" : "session verified"} />
        <span className="ml-auto flex items-center gap-2">
          <V2Button size="sm" variant="secondary" onClick={onDeny}>Deny</V2Button>
          <V2Button size="sm" variant="primary" onClick={onApprove}>Approve & continue</V2Button>
        </span>
      </div>

      <ResizableWorkbenchShell
        left={
          <div className="flex h-full flex-col overflow-hidden" aria-label="Browser viewport">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] px-3">
              <span className="flex items-center gap-2 text-[12px] text-[var(--v2-text-secondary)]"><span className="h-2 w-2 rounded-full bg-[var(--v2-status-success)]" /> {BROWSER_URL}</span>
              <V2MoreMenu items={[{ label: "Reload", onSelect: () => {} }, { label: "Copy URL", onSelect: () => {} }]} />
            </div>
            <div className="flex min-h-[320px] flex-1 items-center justify-center border-b border-[var(--v2-border-subtle)] bg-[var(--v2-canvas)] p-6">
              <div className="w-full max-w-[420px] rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-4 shadow-[var(--v2-shadow-small)]">
                <p className="text-[14px] font-medium text-[var(--v2-text-primary)]">Example dashboard</p>
                <p className="mt-1 text-[12px] text-[var(--v2-text-tertiary)]">Static browser chrome — no iframe, no live computer-use. Viewport is an inert placeholder at the same 6px/12px language.</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <span className="h-16 rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-raised)]" />
                  <span className="h-16 rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-raised)]" />
                  <span className="h-16 rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-raised)]" />
                </div>
              </div>
            </div>
            <div className="flex h-9 shrink-0 items-center gap-2 px-3">
              <V2Button size="sm" variant="ghost">Back</V2Button>
              <V2Button size="sm" variant="ghost">Forward</V2Button>
              <span className="flex-1" />
              <V2Button size="sm" variant="secondary">Screenshot</V2Button>
            </div>
          </div>
        }
        main={
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] px-3">
              <span className="text-[12px] font-medium text-[var(--v2-text-secondary)]">Agent execution timeline</span>
              <V2Badge tone="info" size="sm">3 steps</V2Badge>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3" tabIndex={0} role="region" aria-label="Agent execution timeline">
              <V2ExecutionTimeline events={TIMELINE} />
              <div className="mt-3">
                <V2Provenance source="Browser session" locator="session@b1c2d3 · 11:02:01" capturedAt="11:02:01" verified />
              </div>
            </div>
            <div className="flex h-10 shrink-0 items-center gap-2 border-t border-[var(--v2-border-subtle)] px-3">
              <V2Button size="sm" variant="secondary">Pause</V2Button>
              <V2Button size="sm" variant="ghost">Stop</V2Button>
              <span className="ml-auto text-[12px] text-[var(--v2-text-tertiary)]">Session controls — inert</span>
            </div>
          </div>
        }
        right={
          <div className="flex h-full flex-col overflow-hidden" aria-label="Context and evidence">
            <div className="flex h-9 shrink-0 items-center border-b border-[var(--v2-border-subtle)] px-3 text-[12px] font-medium text-[var(--v2-text-secondary)]">Context / Evidence</div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3" tabIndex={0} role="region" aria-label="Context and evidence">
              {state === "approval" ? <V2ApprovalRequest title="Allow navigation to example.com?" action="Navigate browser" resource={BROWSER_URL} risk="medium" state="approval" onApprove={onApprove} onDeny={onDeny} /> : state === "denied" ? <V2ApprovalRequest title="Allow navigation to example.com?" action="Navigate browser" resource={BROWSER_URL} risk="medium" state="denied" /> : <V2Provenance source="Capture" locator="viewport@11:02:18" capturedAt="11:02:18" verified />}
              <div className="mt-3 rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] p-3 text-[12px] text-[var(--v2-text-secondary)]">Evidence rows stay flat — no card stacks. Trust explicit, approval explicit.</div>
            </div>
          </div>
        }
        defaultLeftWidth={520}
        defaultRightWidth={320}
      />
    </div>
  );
}
