/**
 * STUDIO_17 — agent route adapter.
 * Binds /studio/agent to the V1 agent routes: runs, detail (plans +
 * patches + approvals + events), approvals, advance, tier raise, stop.
 * No project => setup state, never empty success.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentApprovalView, AgentEventView, AgentPatchView, AgentPlanView, AgentRunView, AgentUiState } from "./types";
import { AgentWorkspace, agentFailureMessage } from "./AgentWorkspace";
import { STUDIO_PAGE_CLASS } from "../shell/tokens";
import { DEFAULT_VERSION_PINS } from "@ethen/studio-core/contracts";
import {
  AgentApiError,
  advanceAgentRun,
  appendAgentPlan,
  createAgentRun,
  decideAgentApproval,
  fetchAgentDetail,
  fetchAgentRuns,
  publishAgentRun,
  stopAgentRun,
} from "./agent-api-client";

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now().toString(36)}`;
}

export function AgentRouteAdapter({ projectId }: { projectId: string | null }) {
  const [uiState, setUiState] = useState<AgentUiState>({ state: "loading" });
  const [runs, setRuns] = useState<AgentRunView[]>([]);
  const [selected, setSelected] = useState<AgentRunView | null>(null);
  const [plans, setPlans] = useState<AgentPlanView[]>([]);
  const [patches, setPatches] = useState<AgentPatchView[]>([]);
  const [approvals, setApprovals] = useState<AgentApprovalView[]>([]);
  const [events, setEvents] = useState<AgentEventView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await fetchAgentRuns(projectId);
        if (cancelled) return;
        setRuns(loaded);
        setUiState(
          loaded.length === 0
            ? { state: "empty", message: "Start a run with a brief, then write the plan yourself: the agent executes each step only after your approval, with every step inspectable." }
            : { state: "ready" },
        );
      } catch (failure) {
        if (cancelled) return;
        if (failure instanceof AgentApiError && failure.code === "SETUP_REQUIRED") {
          setUiState({ state: "setup", message: agentFailureMessage(failure), dependency: failure.dependency });
        } else {
          setUiState({ state: "error", message: agentFailureMessage(failure) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken]);

  const selectRun = useCallback(
    async (runId: string) => {
      if (!projectId) return;
      setBusy("select");
      setNotice(null);
      try {
        const detail = await fetchAgentDetail(projectId, runId);
        setSelected(detail.run);
        setPlans(detail.plans);
        setPatches(detail.patches);
        setApprovals(detail.approvals);
        setEvents(detail.events);
      } catch (failure) {
        setNotice(agentFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId],
  );

  const refreshSelected = useCallback(async () => {
    if (!projectId || !selected) return;
    try {
      const detail = await fetchAgentDetail(projectId, selected.runId);
      setSelected(detail.run);
      setPlans(detail.plans);
      setPatches(detail.patches);
      setApprovals(detail.approvals);
      setEvents(detail.events);
    } catch (failure) {
      setNotice(agentFailureMessage(failure));
    }
  }, [projectId, selected]);

  const createRun = useCallback(
    async (title: string, brief: string) => {
      if (!projectId) return;
      setBusy("create");
      setNotice(null);
      try {
        const run = await createAgentRun({ projectId, title, brief, internalCeilingIcu: 500, idempotencyKey: idempotencyKey() });
        setRuns((prev) => [run, ...prev]);
        setUiState({ state: "ready" });
        setNotice(`Run “${run.title}” created at plan-only tier.`);
        await selectRun(run.runId);
      } catch (failure) {
        setNotice(agentFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId, selectRun],
  );

  const submitPlan = useCallback(
    async (goal: string, steps: { title: string; action: string; estimatedIcu: number }[]) => {
      if (!projectId || !selected) return;
      setBusy("plan");
      setNotice(null);
      try {
        const saved = await appendAgentPlan({
          projectId,
          runId: selected.runId,
          goal,
          constraints: [],
          steps: steps.map((step, index) => ({
            key: `step-${index + 1}`,
            title: step.title,
            action: step.action,
            deps: index === 0 ? [] : [`step-${index}`],
            estimatedIcu: step.estimatedIcu,
          })),
          pins: { ...DEFAULT_VERSION_PINS },
          quoteId: null,
        });
        setNotice(`Plan revision ${saved.plan.revision} saved. Request approval to proceed.`);
        await refreshSelected();
      } catch (failure) {
        setNotice(agentFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId, selected, refreshSelected],
  );

  const publish = useCallback(
    async (channel: string, assetClass: string) => {
      if (!projectId || !selected) return;
      setBusy("publish");
      setNotice(null);
      try {
        const granted = [...approvals].reverse().find((a) => a.kind === "publish" && a.state === "granted") ?? null;
        if (!granted) {
          setNotice("Request and approve a publish approval first; without one the run keeps its results.");
          return;
        }
        const run = await publishAgentRun({ projectId, runId: selected.runId, channel, assetClass, approvalId: granted.approvalId });
        setNotice(`Published via ${channel}.`);
        await refreshSelected();
        setRuns((prev) => prev.map((r) => (r.runId === run.runId ? run : r)));
      } catch (failure) {
        setNotice(agentFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId, selected, approvals, refreshSelected],
  );

  const advance = useCallback(
    async (to: string) => {
      if (!projectId || !selected) return;
      setBusy("advance");
      setNotice(null);
      try {
        const run = await advanceAgentRun({ projectId, runId: selected.runId, to });
        setNotice(`Advanced to ${run.stage}.`);
        await refreshSelected();
        setRuns((prev) => prev.map((r) => (r.runId === run.runId ? run : r)));
      } catch (failure) {
        setNotice(agentFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId, selected, refreshSelected],
  );

  const raiseTier = useCallback(
    async (tier: string) => {
      if (!projectId || !selected) return;
      setBusy("tier");
      setNotice(null);
      try {
        const run = await advanceAgentRun({ projectId, runId: selected.runId, raiseTier: tier });
        setNotice(`Tier raised to ${run.tier}.`);
        await refreshSelected();
        setRuns((prev) => prev.map((r) => (r.runId === run.runId ? run : r)));
      } catch (failure) {
        setNotice(agentFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId, selected, refreshSelected],
  );

  const requestApproval = useCallback(
    async (kind: "execute" | "publish") => {
      if (!projectId || !selected) return;
      setBusy("approval");
      setNotice(null);
      try {
        const head = plans.length > 0 ? plans[plans.length - 1] : null;
        const approval: AgentApprovalView = await decideAgentApproval({
          projectId,
          runId: selected.runId,
          kind,
          capIcu: head ? head.estimatedIcu : 0,
        });
        setApprovals((prev) => [...prev, approval]);
        setNotice(`Approval requested (${approval.kind}, ${approval.estimatedIcu}/${approval.capIcu} ICU).`);
        await refreshSelected();
      } catch (failure) {
        setNotice(agentFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId, selected, plans, refreshSelected],
  );

  const decideApproval = useCallback(
    async (approvalId: string, decision: "granted" | "denied") => {
      if (!projectId || !selected) return;
      setBusy("approval");
      setNotice(null);
      try {
        const approval = await decideAgentApproval({ projectId, runId: selected.runId, approvalId, decision });
        setApprovals((prev) => prev.map((a) => (a.approvalId === approval.approvalId ? approval : a)));
        setNotice(approval.state === "granted" ? "Approval granted." : `Approval ${approval.state}.`);
        await refreshSelected();
      } catch (failure) {
        setNotice(agentFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId, selected, refreshSelected],
  );

  const stop = useCallback(async () => {
    if (!projectId || !selected) return;
    setBusy("stop");
    setNotice(null);
    try {
      const run = await stopAgentRun(projectId, selected.runId);
      setNotice("Run stopped.");
      await refreshSelected();
      setRuns((prev) => prev.map((r) => (r.runId === run.runId ? run : r)));
    } catch (failure) {
      setNotice(agentFailureMessage(failure));
    } finally {
      setBusy(null);
    }
  }, [projectId, selected, refreshSelected]);

  if (!projectId) {
    // VISUAL-03 locked preview: the agent frame stays visible with one action.
    return (
      <div data-testid="agent-workspace" className={`${STUDIO_PAGE_CLASS} space-y-4`}>
        <h1 tabIndex={-1} className="text-[24px] leading-[1.12] tracking-[-0.015em] text-[var(--text-primary)]">Creative Agent</h1>
        <section aria-label="Agent preview (locked)" className="space-y-3 rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 opacity-80">
          <div className="space-y-1 text-[12.5px] text-[var(--text-secondary)]">
            Brief
            <textarea disabled rows={2} placeholder="Describe the goal for the agent…" className="w-full resize-none rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-60" />
          </div>
          <span className="inline-flex min-h-[44px] cursor-not-allowed items-center rounded-[10px] bg-[var(--accent)] px-4 py-2 text-[12.5px] font-medium text-[var(--accent-fg)] opacity-50">
            Start run
          </span>
        </section>
        <p data-testid="agent-setup" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-[12.5px] text-[var(--text-secondary)]">
          Select a project to start an agent run.
        </p>
      </div>
    );
  }

  return (
    <AgentWorkspace
      projectId={projectId}
      uiState={uiState}
      runs={runs}
      selected={selected}
      plans={plans}
      patches={patches}
      approvals={approvals}
      events={events}
      busy={busy}
      notice={notice}
      onSelectRun={(runId) => void selectRun(runId)}
      onCreateRun={(title, brief) => void createRun(title, brief)}
      onSubmitPlan={(goal, steps) => void submitPlan(goal, steps)}
      onAdvance={(to) => void advance(to)}
      onRaiseTier={(tier) => void raiseTier(tier)}
      onRequestApproval={(kind) => void requestApproval(kind)}
      onDecideApproval={(approvalId, decision) => void decideApproval(approvalId, decision)}
      onPublish={(channel, assetClass) => void publish(channel, assetClass)}
      onStop={() => void stop()}
      onRetry={() => {
        setUiState({ state: "loading" });
        setReloadToken((token) => token + 1);
      }}
    />
  );
}
