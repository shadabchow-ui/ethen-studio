"use client";

import * as React from "react";
import { V2Badge } from "../Badge";
import { V2Button } from "../Button";
import { V2MoreMenu } from "../DropdownMenu";
import { V2Composer } from "../Composer";
import { V2EmptyState } from "../DataTable";
import { V2Banner } from "../Banner";
import { V2ExecutionTimeline, V2ToolActivity, V2ApprovalRequest, V2PermissionState, V2Provenance, V2TrustEvidence, V2ArtifactState } from "../AgentExecution";
import { ResizableWorkbenchShell } from "../ResizableWorkbenchShell";

/* ── Static sample data ── */
const SAMPLE_FILES = [
  { path: "app/api/chat/route.ts", status: "modified" as const },
  { path: "components/shell/ConsoleShell.tsx", status: "added" as const },
  { path: "lib/cortex/verifier.ts", status: "unchanged" as const },
  { path: "tests/behavioral/code-shell.test.ts", status: "added" as const },
];

const SAMPLE_TIMELINE = [
  { id: "t1", title: "Workstream started", detail: "Scope: repository · Code workbench", time: "09:12:03", state: "completed" as const },
  { id: "t2", title: "Read file context", detail: "app/api/chat/route.ts", time: "09:12:08", state: "completed" as const },
  { id: "t3", title: "Tool running", detail: "Analyze diff vs main", time: "09:12:14", state: "running" as const },
];

const SAMPLE_DIFF = `diff --git a/app/api/chat/route.ts b/app/api/chat/route.ts
-  const previous = "manual";
+  const previous = "V2CodeWorkbench";
`;

export type CodeWorkbenchState = "empty" | "running" | "approval" | "error" | "loaded";

export interface CodeWorkbenchProps {
  state?: CodeWorkbenchState;
  modelLabel?: string;
  workspaceScope?: string;
  permissionAccess?: "read" | "write" | "execute";
  permissionScope?: string;
  approvalMode?: "auto" | "manual";
  onApprove?: () => void;
  onDeny?: () => void;
  className?: string;
  title?: string;
  children?: React.ReactNode;
}

function FileTree() {
  return (
    <div className="flex h-full flex-col overflow-hidden" aria-label="File context">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] px-3">
        <span className="text-[12px] font-medium text-[var(--v2-text-secondary)]">Files</span>
        <V2MoreMenu items={[{ label: "New file", onSelect: () => {} }, { label: "Refresh", onSelect: () => {} }]} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" tabIndex={0} role="region" aria-label="File context">
        {SAMPLE_FILES.map((f) => (
          <div key={f.path} className="flex h-9 items-center gap-2 border-b border-[var(--v2-border-subtle)] px-3 text-[12px] hover:bg-[var(--v2-hover)]">
            <span className="min-w-0 flex-1 truncate font-mono text-[var(--v2-text-primary)]">{f.path}</span>
            <V2Badge tone={f.status === "modified" ? "warning" : f.status === "added" ? "success" : "neutral"} size="sm">{f.status}</V2Badge>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--v2-border-subtle)] px-3 py-2 text-[12px] text-[var(--v2-text-tertiary)]">Workspace: ethenv4-design-preview · branch: design/full-console-preview-20260809</div>
    </div>
  );
}

function WorkstreamPane({ state }: { state: CodeWorkbenchState }) {
  if (state === "empty") {
    return <V2EmptyState title="No workstream yet" description="Start a session or open a file to see conversation and workstream." />;
  }
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] px-3">
        <span className="text-[12px] font-medium text-[var(--v2-text-secondary)]">Workstream / Conversation</span>
        <V2MoreMenu items={[{ label: "Copy link", onSelect: () => {} }, { label: "Clear", onSelect: () => {} }]} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3" tabIndex={0} role="region" aria-label="Workstream">
        <V2ExecutionTimeline events={SAMPLE_TIMELINE} />
        <div className="mt-3 grid gap-2">
          <V2ToolActivity tool="code.read" summary="Read app/api/chat/route.ts" state="tool-result" output="42 lines · 08ms" />
          <V2ToolActivity tool="code.exec" summary="Run typecheck --noEmit" state={state === "running" ? "running" : "tool-result"} risk={state === "approval" ? "high" : "low"} input="pnpm typecheck" output={state === "running" ? "running…" : "0 errors · tooltip drift only"} />
        </div>
        {state === "error" ? <V2Banner tone="danger" title="Execution failed">Static error specimen — no runtime call was made.</V2Banner> : null}
      </div>
    </div>
  );
}

function DiffEvidencePane({ state }: { state: CodeWorkbenchState }) {
  if (state === "empty") return <div className="p-3 text-[12px] text-[var(--v2-text-tertiary)]">Diff/evidence appears after a run.</div>;
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] px-3">
        <span className="text-[12px] font-medium text-[var(--v2-text-secondary)]">Diff / Evidence</span>
        <span className="flex items-center gap-2"><V2TrustEvidence state="verified" detail="hash a1b2" /><V2MoreMenu items={[{ label: "Copy diff", onSelect: () => {} }]} /></span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3" tabIndex={0} role="region" aria-label="Diff and evidence">
        <pre tabIndex={0} role="region" aria-label="Diff source" className="overflow-x-auto rounded-[var(--v2-radius-base)] border border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] p-3 font-mono text-[12px] leading-5 text-[var(--v2-text-primary)]">{SAMPLE_DIFF}</pre>
        <div className="mt-3">
          <V2Provenance source="Diff from main" locator="a1b2c3 · 09:12:14" capturedAt="09:12:14" verified />
        </div>
        <div className="mt-3">
          <V2ArtifactState name="proposal.patch" version="3" type="PATCH" updatedAt="just now" status={state === "error" ? "error" : "ready"} />
        </div>
      </div>
    </div>
  );
}

function TerminalPane({ state }: { state: CodeWorkbenchState }) {
  return (
    <div className="flex h-full flex-col overflow-hidden" aria-label="Terminal and artifact pane">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--v2-border-subtle)] px-3">
        <span className="text-[12px] font-medium text-[var(--v2-text-secondary)]">Terminal / Artifact</span>
        <V2Badge tone={state === "running" ? "info" : state === "error" ? "danger" : "neutral"} size="sm">{state}</V2Badge>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-[var(--v2-border-subtle)] overflow-hidden">
        <div className="overflow-y-auto bg-[var(--v2-canvas)] p-3 font-mono text-[12px] leading-5 text-[var(--v2-text-primary)]" tabIndex={0} role="region" aria-label="Terminal output">
          <p className="text-[var(--v2-text-tertiary)]">$ pnpm typecheck</p>
          <p>{state === "running" ? "▌ typechecking…" : state === "error" ? "× failed (tooltip drift)" : "✓ done"}</p>
        </div>
        <div className="overflow-y-auto p-3" tabIndex={0} role="region" aria-label="Artifact preview">
          {state === "empty" ? <p className="text-[12px] text-[var(--v2-text-tertiary)]">Artifact preview appears here.</p> : <pre className="whitespace-pre-wrap font-mono text-[12px] text-[var(--v2-text-primary)]">{SAMPLE_DIFF}</pre>}
        </div>
      </div>
    </div>
  );
}

/** Production V2 Code/Coding Agent workbench — interior shell.
 *  Global frame (256/56 sidebar, 56 topbar, 320/404 rail) remains owned by ConsoleShell/WorkbenchShell.
 *  This component only specializes the workspace interior while staying frame-compatible.
 */
export function CodeWorkbench({ state = "loaded", modelLabel = "Muse Spark 1.2", workspaceScope = "ethenv4-design-preview", permissionAccess = "write", permissionScope = "repo: code", approvalMode = "manual", onApprove, onDeny, className, title = "Code", children }: CodeWorkbenchProps) {
  if (children) {
    return (
      <div className={className} data-ethen-v2>
        <header data-v2-pattern="page-header" className="sr-only">{title}</header>
        <div data-v2-pattern="composer-surface" className="min-h-0 min-w-0 flex-1">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className={className} data-ethen-v2 data-code-workbench={state} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      {/* Model / workspace scope + permissions + approval mode — top row */}
      <div className="flex flex-wrap items-center gap-2">
        <V2Badge tone="neutral" size="sm">Model: {modelLabel}</V2Badge>
        <V2Badge tone="neutral" size="sm">Workspace: {workspaceScope}</V2Badge>
        <V2PermissionState access={permissionAccess} resource="repo/code" scope={permissionScope} state={state === "approval" ? "requested" : state === "error" ? "denied" : "granted"} />
        <V2Badge tone={approvalMode === "auto" ? "info" : "warning"} size="sm">Approval: {approvalMode}</V2Badge>
        <span className="ml-auto flex items-center gap-2">
          <V2MoreMenu items={[{ label: "Switch model", onSelect: () => {} }, { label: "Change scope", onSelect: () => {} }, { label: "Permissions", onSelect: () => {} }]} />
        </span>
      </div>

      {/* Resizable workbench interior */}
      <ResizableWorkbenchShell
        left={<FileTree />}
        main={<WorkstreamPane state={state} />}
        right={<DiffEvidencePane state={state} />}
        bottom={state === "approval" ? <V2ApprovalRequest title="Apply patch to app/api/chat/route.ts?" action="Write file" resource="app/api/chat/route.ts" risk="high" state="approval" onApprove={onApprove} onDeny={onDeny} /> : <TerminalPane state={state} />}
        defaultLeftWidth={220}
        defaultRightWidth={340}
        defaultBottomHeight={state === "approval" ? 220 : 180}
      />

      {/* Approval is also an inline gate above composer when state=approval */}
      {state === "approval" ? <p className="text-[12px] text-[var(--v2-text-tertiary)]">Approval gate is lab-only — no file write is performed until approved.</p> : null}

      {/* Composer — pilot baseline: no blue focus box, caret sufficient */}
      <V2Composer placeholder="Ask the coding agent… Type a message, attach files, or pick a tool." state={state === "error" ? "error" : state === "running" ? "running" : "idle"} compact={false} />
      {state === "empty" ? <V2EmptyState title="Composer ready" description="Composer is inert in this lab specimen — no backend call is made." /> : null}
    </div>
  );
}
