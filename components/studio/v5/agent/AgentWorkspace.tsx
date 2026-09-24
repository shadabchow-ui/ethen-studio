/**
 * STUDIO_17 — Creative Agent workspace.
 * VISUAL-03 — three-pane desktop composition: brief/runs beside
 * staged plan + Canvas diff beside approval/review. Brief/conversation
 * stays supporting context; plan, diff, approval, budget, and outputs
 * remain simultaneously inspectable. Mobile stacks with complete
 * approval facts. Theme tokens only; 44px targets; visible focus.
 */
"use client";

import { useState } from "react";
import {
  agentStageLabel,
  agentTierLabel,
  type AgentApprovalView,
  type AgentEventView,
  type AgentPatchView,
  type AgentPlanView,
  type AgentRunView,
  type AgentUiState,
} from "./types";
import { AgentApiError } from "./agent-api-client";
import { STUDIO_FOCUS_RING_CLASS, STUDIO_PAGE_CLASS } from "../shell/tokens";
import { StudioEmptyState, StudioErrorState } from "../shell/states";
import { StudioSetupState } from "../shell/StudioSetupState";

export interface AgentWorkspaceProps {
  projectId: string;
  uiState: AgentUiState;
  runs: AgentRunView[];
  selected: AgentRunView | null;
  plans: AgentPlanView[];
  patches: AgentPatchView[];
  approvals: AgentApprovalView[];
  events: AgentEventView[];
  busy: string | null;
  notice: string | null;
  onSelectRun: (runId: string) => void;
  onCreateRun: (title: string, brief: string) => void;
  onSubmitPlan: (goal: string, steps: { title: string; action: string; estimatedIcu: number }[]) => void;
  onAdvance: (to: string) => void;
  onRaiseTier: (tier: string) => void;
  onRequestApproval: (kind: "execute" | "publish") => void;
  onDecideApproval: (approvalId: string, decision: "granted" | "denied") => void;
  onPublish: (channel: string, assetClass: string) => void;
  onStop: () => void;
  onRetry: () => void;
}

export function agentFailureMessage(failure: unknown): string {
  if (failure instanceof AgentApiError) return failure.message;
  return failure instanceof Error ? failure.message : "The Creative Agent is unavailable.";
}

const STAGE_ORDER = [
  "INVESTIGATE", "PLAN", "AUTHOR", "VALIDATE", "ESTIMATE", "RESERVE",
  "POLICY_CHECK", "APPROVAL", "EXECUTE", "OBSERVE", "VERIFY", "PRESENT",
];

function StageRail({ stage }: { stage: string }) {
  const index = STAGE_ORDER.indexOf(stage);
  return (
    <ol aria-label="Agent stages" className="flex flex-wrap gap-1" data-testid="agent-stages">
      {STAGE_ORDER.map((name, i) => (
        <li
          key={name}
          aria-current={name === stage ? "step" : undefined}
          className={
            name === stage
              ? "rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--accent-fg)]"
              : i < index
                ? "rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[11.5px] text-[var(--text-secondary)]"
                : "rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[11.5px] text-[var(--text-tertiary)]"
          }
        >
          {agentStageLabel(name)}
        </li>
      ))}
    </ol>
  );
}

const CARD = "rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4";

interface PlanStepDraft {
  title: string;
  action: string;
  estimatedIcu: string;
}

/**
 * P05 (Option A) — manual plan editor. You write the goal and the
 * ordered steps; submitting posts a plan revision. Steps run in list
 * order (each step follows the previous one).
 */
function PlanEditor({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (goal: string, steps: { title: string; action: string; estimatedIcu: number }[]) => void;
}) {
  const [goal, setGoal] = useState("");
  const [steps, setSteps] = useState<PlanStepDraft[]>([{ title: "", action: "", estimatedIcu: "0" }]);

  const move = (index: number, direction: -1 | 1) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const parsed = steps.map((step) => ({
    title: step.title.trim(),
    action: step.action.trim(),
    estimatedIcu: Number(step.estimatedIcu),
  }));
  const valid =
    goal.trim().length > 0 &&
    parsed.length > 0 &&
    parsed.every((step) => step.title.length > 0 && step.action.length > 0 && Number.isInteger(step.estimatedIcu) && step.estimatedIcu >= 0);

  return (
    <form
      aria-label="Write a plan"
      data-testid="agent-plan-editor"
      className={`space-y-3 ${CARD}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || busy) return;
        onSubmit(goal.trim(), parsed);
      }}
    >
      <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Write the plan</h2>
      <p className="text-[12px] text-[var(--text-secondary)]">
        You write the plan; the agent executes each step only after your approval, with every step inspectable.
      </p>
      <label className="block text-[12.5px] text-[var(--text-secondary)]">
        Goal
        <textarea
          aria-label="Plan goal"
          data-testid="agent-plan-goal"
          rows={2}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          className={`mt-1 w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[13px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
        />
      </label>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={index} data-testid={`agent-plan-step-${index}`} className="space-y-1.5 rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5">
            <p className="text-[11.5px] font-medium text-[var(--text-tertiary)]">Step {index + 1}</p>
            <label className="block text-[12px] text-[var(--text-secondary)]">
              Title
              <input
                aria-label={`Step ${index + 1} title`}
                value={step.title}
                onChange={(event) => setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, title: event.target.value } : s)))}
                className={`mt-0.5 min-h-[44px] w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
              />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
              <label className="block text-[12px] text-[var(--text-secondary)]">
                Action
                <input
                  aria-label={`Step ${index + 1} action`}
                  value={step.action}
                  onChange={(event) => setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, action: event.target.value } : s)))}
                  className={`mt-0.5 min-h-[44px] w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
                />
              </label>
              <label className="block text-[12px] text-[var(--text-secondary)]">
                ICU
                <input
                  aria-label={`Step ${index + 1} estimate in ICU`}
                  inputMode="numeric"
                  value={step.estimatedIcu}
                  onChange={(event) => setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, estimatedIcu: event.target.value } : s)))}
                  className={`mt-0.5 min-h-[44px] w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move step ${index + 1} up`} className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-2.5 text-[12px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>
                ↑
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === steps.length - 1} aria-label={`Move step ${index + 1} down`} className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-2.5 text-[12px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>
                ↓
              </button>
              <button type="button" onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))} disabled={steps.length <= 1} aria-label={`Remove step ${index + 1}`} className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-2.5 text-[12px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSteps((prev) => [...prev, { title: "", action: "", estimatedIcu: "0" }])}
          data-testid="agent-plan-add-step"
          className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3.5 py-2 text-[12.5px] ${STUDIO_FOCUS_RING_CLASS}`}
        >
          Add step
        </button>
        <button
          type="submit"
          disabled={!valid || busy}
          data-testid="agent-plan-submit"
          className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--accent)] px-4 py-2 text-[12.5px] font-medium text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
        >
          {busy ? "Saving…" : "Save plan"}
        </button>
      </div>
    </form>
  );
}

/**
 * P05 — publish action. Public publish needs a fresh granted publish
 * approval (requested above); without one the run keeps its results.
 */
function PublishForm({ busy, onPublish }: { busy: boolean; onPublish: (channel: string, assetClass: string) => void }) {
  const [channel, setChannel] = useState("");
  const [assetClass, setAssetClass] = useState("");
  const valid = channel.trim().length > 0 && assetClass.trim().length > 0;
  return (
    <form
      aria-label="Publish results"
      data-testid="agent-publish"
      className={`space-y-2.5 ${CARD}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || busy) return;
        onPublish(channel.trim(), assetClass.trim());
      }}
    >
      <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Publish</h2>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[12px] text-[var(--text-secondary)]">
          Channel
          <input
            aria-label="Publish channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            className={`mt-0.5 min-h-[44px] w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
          />
        </label>
        <label className="block text-[12px] text-[var(--text-secondary)]">
          Asset class
          <input
            aria-label="Publish asset class"
            value={assetClass}
            onChange={(event) => setAssetClass(event.target.value)}
            className={`mt-0.5 min-h-[44px] w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={!valid || busy}
        data-testid="agent-publish-submit"
        className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3.5 py-2 text-[12.5px] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
      >
        Publish
      </button>
    </form>
  );
}

export function AgentWorkspace(props: AgentWorkspaceProps) {
  const { uiState, runs, selected, plans, patches, approvals, events, busy, notice } = props;
  const headPlan = plans.length > 0 ? plans[plans.length - 1] : null;
  const headPatch = patches.length > 0 ? patches[patches.length - 1] : null;
  const liveApproval = [...approvals].reverse().find((a) => a.state === "requested" || a.state === "granted") ?? null;

  if (uiState.state === "loading") {
    return (
      <div data-testid="agent-workspace" className={STUDIO_PAGE_CLASS} role="status" aria-live="polite">
        <h1 tabIndex={-1} className="text-[24px] leading-[1.12] tracking-[-0.015em] text-[var(--text-primary)]">Creative Agent</h1>
        <p className="mt-3 rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-12 text-center text-[13px] text-[var(--text-tertiary)]">
          Loading the Creative Agent…
        </p>
      </div>
    );
  }
  if (uiState.state === "setup") {
    return (
      <div data-testid="agent-workspace" className={`${STUDIO_PAGE_CLASS} space-y-3`}>
        <h1 tabIndex={-1} className="text-[24px] leading-[1.12] tracking-[-0.015em] text-[var(--text-primary)]">Creative Agent</h1>
        <div data-testid="agent-setup">
          <StudioSetupState
            what="Agent runs"
            dependency={uiState.dependency}
            primaryLabel="Go to Assets"
            primaryHref={typeof window !== "undefined" ? `/studio/work/assets?projectId=${encodeURIComponent(new URLSearchParams(window.location.search).get("projectId") ?? "")}` : "/studio/work/assets"}
          />
        </div>
      </div>
    );
  }
  if (uiState.state === "error") {
    return (
      <div data-testid="agent-workspace" className={`${STUDIO_PAGE_CLASS} space-y-3`}>
        <h1 tabIndex={-1} className="text-[24px] leading-[1.12] tracking-[-0.015em] text-[var(--text-primary)]">Creative Agent</h1>
        <StudioErrorState
          title="Creative Agent unavailable"
          description={uiState.message}
          retryLabel="Retry"
          onRetry={props.onRetry}
          testId="agent-error"
        />
      </div>
    );
  }

  return (
    <div data-testid="agent-workspace" className={`${STUDIO_PAGE_CLASS} space-y-4`}>
      {notice ? (
        <p data-testid="agent-notice" role="status" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">
          {notice}
        </p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:grid-cols-[minmax(0,4fr)_minmax(0,4fr)_minmax(0,5fr)]">
        {/* Pane 1: brief / runs rail */}
        <section aria-label="Brief and runs" className="space-y-4">
          <div>
            <h1 tabIndex={-1} className="text-[24px] leading-[1.12] tracking-[-0.015em] text-[var(--text-primary)]">Creative Agent</h1>
            <p className="mt-1 text-[12.5px] leading-5 text-[var(--text-secondary)]">
              Inspectable plans and Canvas edits. Nothing dispatches without your approval.
            </p>
          </div>
          {uiState.state === "empty" ? (
            <StudioEmptyState
              title="No agent runs yet"
              description={uiState.message}
              actionLabel="Start a run"
              onAction={() => document.getElementById("agent-run-title")?.focus()}
              testId="agent-empty"
            />
          ) : null}
          <form
            aria-label="Start an agent run"
            className={`space-y-3 ${CARD}`}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              props.onCreateRun(String(form.get("title") ?? ""), String(form.get("brief") ?? ""));
            }}
          >
            <label className="block text-[12.5px] text-[var(--text-secondary)]">
              Run title
              <input id="agent-run-title" name="title" required aria-label="Run title" className={`mt-1 min-h-[44px] w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[13px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`} />
            </label>
            <label className="block text-[12.5px] text-[var(--text-secondary)]">
              Brief
              <textarea name="brief" required aria-label="Brief" rows={3} className={`mt-1 w-full rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[13px] text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`} />
            </label>
            <button type="submit" disabled={busy !== null} className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--accent)] px-4 py-2 text-[12.5px] font-medium text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}>
              {busy === "create" ? "Starting…" : "Start run"}
            </button>
          </form>
          <ul aria-label="Agent runs" className="space-y-2">
            {runs.map((run) => (
              <li key={run.runId}>
                <button
                  type="button"
                  onClick={() => props.onSelectRun(run.runId)}
                  aria-pressed={run.runId === selected?.runId}
                  className={`min-h-[44px] w-full rounded-[12px] border p-3.5 text-left ${STUDIO_FOCUS_RING_CLASS} ${
                    run.runId === selected?.runId
                      ? "border-[var(--accent)] bg-[var(--bg-elevated)]"
                      : "border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--studio-bg-selected)]"
                  }`}
                >
                  <span className="block text-[13.5px] font-medium text-[var(--text-primary)]">{run.title}</span>
                  <span className="mt-0.5 block text-[11.5px] text-[var(--text-tertiary)]">
                    {agentStageLabel(run.stage)} · Tier: {agentTierLabel(run.tier)} · rev {run.headRevision}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Pane 2: staged plan + current action + Canvas diff */}
        <section aria-label="Plan and Canvas edits" className="space-y-4">
          {!selected ? (
            <p className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-[12.5px] text-[var(--text-secondary)]" data-testid="agent-no-selection">
              Select a run to inspect its plan, Canvas diff, cost and approval.
            </p>
          ) : (
            <>
              <div className={`flex flex-wrap items-center gap-2 ${CARD}`}>
                <span className="text-[13px] font-medium text-[var(--text-primary)]" data-testid="agent-tier">
                  Tier: {agentTierLabel(selected.tier)}
                </span>
                <span className="text-[11.5px] text-[var(--text-tertiary)]">(only you can raise it)</span>
                <span className="ms-auto flex flex-wrap gap-2">
                  {selected.tier === "plan-only" ? (
                    <button type="button" onClick={() => props.onRaiseTier("execute")} className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3 py-1.5 text-[12px] ${STUDIO_FOCUS_RING_CLASS}`}>
                      Raise to Execute
                    </button>
                  ) : null}
                  {selected.tier !== "publish" ? (
                    <button type="button" onClick={() => props.onRaiseTier("publish")} className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3 py-1.5 text-[12px] ${STUDIO_FOCUS_RING_CLASS}`}>
                      Raise to Publish
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={props.onStop}
                    className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
                  >
                    Stop
                  </button>
                </span>
              </div>
              <StageRail stage={selected.stage} />
              <div className={CARD} data-testid="agent-plan">
                <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Plan {headPlan ? `(revision ${headPlan.revision})` : "(none yet)"}</h2>
                {headPlan ? (
                  <>
                    <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">{headPlan.goal}</p>
                    <ul className="mt-2 space-y-1.5">
                      {headPlan.steps.map((step) => (
                        <li key={step.key} className="text-[12.5px]">
                          <span className="font-medium text-[var(--text-primary)]">{step.title}</span>{" "}
                          <span className="text-[11.5px] text-[var(--text-tertiary)]">
                            {step.action} · {step.estimatedIcu} ICU
                            {step.deps.length > 0 ? ` · after ${step.deps.join(", ")}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11.5px] text-[var(--text-tertiary)]">
                      Estimate {headPlan.estimatedIcu} ICU · pins {headPlan.pins.priceVersion ?? "—"} · hash{" "}
                      {headPlan.planHash.slice(0, 12)}…
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
                    No plan yet. You write the plan below; the agent executes each step only after your approval.
                  </p>
                )}
                {plans.length > 1 ? (
                  <ul aria-label="Plan revision history" data-testid="agent-plan-history" className="mt-3 space-y-1 border-t border-[var(--border-default)] pt-2 text-[11.5px] text-[var(--text-tertiary)]">
                    {[...plans].reverse().map((plan) => (
                      <li key={plan.planId}>
                        r{plan.revision} · {plan.goal} · {plan.planHash.slice(0, 8)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <PlanEditor busy={busy !== null} onSubmit={props.onSubmitPlan} />
              <div className={CARD} data-testid="agent-diff">
                <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Canvas diff</h2>
                {headPatch ? (
                  <>
                    <ul className="mt-2 space-y-1 overflow-x-auto font-mono text-[11.5px] text-[var(--text-secondary)]">
                      {headPatch.diff.map((line, i) => (
                        <li key={i} className="whitespace-pre">{line}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11.5px] text-[var(--text-tertiary)]">
                      {headPatch.ops.length} operation{headPatch.ops.length === 1 ? "" : "s"} on revision{" "}
                      {headPatch.planRevision}; base {headPatch.baseGraphHash.slice(0, 12)}… → result{" "}
                      {headPatch.resultingHash.slice(0, 12)}…
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">No Canvas edits yet. The diff appears here before anything executes.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(["PLAN", "AUTHOR", "VALIDATE", "ESTIMATE", "RESERVE", "POLICY_CHECK"] as const).map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => props.onAdvance(stage)}
                    className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3 py-1.5 text-[12px] ${STUDIO_FOCUS_RING_CLASS}`}
                  >
                    Advance to {agentStageLabel(stage)}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Pane 3: approval / budget / outputs review */}
        <section aria-label="Approval and results" className="space-y-4 lg:col-span-2 xl:col-span-1">
          <div className={CARD} data-testid="agent-approval">
            <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Approval</h2>
            {liveApproval ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
                <dt className="text-[var(--text-tertiary)]">State</dt>
                <dd className="text-[var(--text-primary)]">{liveApproval.state}{liveApproval.staleReason ? ` — ${liveApproval.staleReason}` : ""}</dd>
                <dt className="text-[var(--text-tertiary)]">Kind</dt>
                <dd className="text-[var(--text-primary)]">{liveApproval.kind}</dd>
                <dt className="text-[var(--text-tertiary)]">Cost</dt>
                <dd className="text-[var(--text-primary)]">
                  {liveApproval.estimatedIcu} / {liveApproval.capIcu} ICU
                </dd>
                <dt className="text-[var(--text-tertiary)]">Plan</dt>
                <dd className="text-[var(--text-primary)]">
                  rev {liveApproval.planRevision} · {liveApproval.planHash.slice(0, 12)}…
                </dd>
                <dt className="text-[var(--text-tertiary)]">Expires</dt>
                <dd className="text-[var(--text-primary)]">{liveApproval.expiresAt}</dd>
              </dl>
            ) : (
              <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">No approval requested yet.</p>
            )}
            {selected ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => props.onRequestApproval("execute")} className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3.5 py-2 text-[12.5px] ${STUDIO_FOCUS_RING_CLASS}`}>
                  Request execute approval
                </button>
                <button type="button" onClick={() => props.onRequestApproval("publish")} className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3.5 py-2 text-[12.5px] ${STUDIO_FOCUS_RING_CLASS}`}>
                  Request publish approval
                </button>
                {liveApproval?.state === "requested" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => props.onDecideApproval(liveApproval.approvalId, "granted")}
                      className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--accent-fg)] ${STUDIO_FOCUS_RING_CLASS}`}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onDecideApproval(liveApproval.approvalId, "denied")}
                      className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] px-3.5 py-2 text-[12.5px] ${STUDIO_FOCUS_RING_CLASS}`}
                    >
                      Deny
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          {selected ? <PublishForm busy={busy !== null} onPublish={props.onPublish} /> : null}
          {selected && (selected.workflowRunId || selected.jobIds.length > 0) ? (
            <div className={`${CARD} text-[12.5px]`} data-testid="agent-results">
              <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Results</h2>
              <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">
                {selected.workflowRunId ? `Workflow run ${selected.workflowRunId}. ` : ""}
                {selected.jobIds.length > 0 ? `Jobs ${selected.jobIds.join(", ")}.` : ""}
              </p>
              <p className="mt-1">
                <a className={`inline-flex min-h-[44px] items-center underline ${STUDIO_FOCUS_RING_CLASS}`} href={`/studio/pro/video?projectId=${encodeURIComponent(selected.workbenchTimelineId ?? "")}`}>
                  Open in workbench
                </a>{" "}
                ·{" "}
                <a className={`inline-flex min-h-[44px] items-center underline ${STUDIO_FOCUS_RING_CLASS}`} href={`/studio/work/reviews?projectId=${encodeURIComponent(props.projectId)}`}>
                  Open review
                </a>
              </p>
            </div>
          ) : null}
          <details className={CARD} data-testid="agent-events">
            <summary className={`cursor-pointer list-none text-[12.5px] font-medium text-[var(--text-primary)] [&::-webkit-details-marker]:hidden ${STUDIO_FOCUS_RING_CLASS}`}>
              <span className="flex min-h-[44px] items-center">Inspectable history ({events.length})</span>
            </summary>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-[11.5px] text-[var(--text-secondary)]">
              {events.map((event) => (
                <li key={event.eventId}>
                  #{event.seq} {event.type}
                  {event.stage ? ` @ ${agentStageLabel(event.stage)}` : ""}
                </li>
              ))}
            </ul>
          </details>
        </section>
      </div>
    </div>
  );
}
