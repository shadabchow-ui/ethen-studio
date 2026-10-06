"use client";

/**
 * RC4 — shared Studio access gate (hook + CTA component).
 *
 * `useStudioAccess({ requiresProject, projectId })` resolves one access
 * state from the Studio identity plus project scope; `runWhenReady` runs
 * an action only when ready (callers show the inline reason + action when
 * blocked); `<StudioAccessGate>` renders that reason + action.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { requestStudioSignIn } from "./studio-auth-action-core";
import { requestStudioIdentityPending } from "./identity-state";
import { resolveStudioAccess, type StudioAccessResolution } from "./access-state";
import { useStudioIdentity } from "./use-studio-identity";

export interface StudioAccessPrimaryAction {
  label: string;
  run: () => void;
}

export interface StudioAccess extends StudioAccessResolution {
  primaryAction: StudioAccessPrimaryAction | null;
  projectId: string | null;
  refresh: () => Promise<void>;
  /**
   * Run `action` immediately when ready; otherwise return false so the
   * caller reveals the inline reason + action (no surprise navigation or
   * modal from a single submit click).
   */
  runWhenReady: (action: () => void) => boolean;
}

export function useStudioAccess(input: {
  requiresProject: boolean;
  projectId?: string | null;
  /** Stable action label for telemetry/debugging (never user data). */
  actionLabel?: string;
}): StudioAccess {
  const requiresProject = input.requiresProject;
  const projectId = input.projectId ?? null;
  const actionLabel = input.actionLabel;
  const identity = useStudioIdentity();
  const router = useRouter();

  const resolution = React.useMemo(
    () =>
      resolveStudioAccess({
        identityStatus: identity.status,
        requiresProject,
        projectId,
      }),
    [identity.status, requiresProject, projectId],
  );

  const primaryAction = React.useMemo<StudioAccessPrimaryAction | null>(() => {
    if (!resolution.actionId || !resolution.actionLabel) return null;
    const label = resolution.actionLabel;
    switch (resolution.actionId) {
      case "signin":
        return { label, run: () => requestStudioSignIn(actionLabel ? { action: actionLabel } : {}) };
      case "finish-setup":
        return { label, run: () => requestStudioIdentityPending(actionLabel ? { action: actionLabel } : {}) };
      case "retry":
        return { label, run: () => void identity.refresh() };
      case "open-projects":
        return { label, run: () => router.push("/studio/work/projects") };
    }
  }, [resolution.actionId, resolution.actionLabel, actionLabel, identity, router]);

  const runWhenReady = React.useCallback(
    (action: () => void): boolean => {
      if (resolution.state !== "ready") return false;
      action();
      return true;
    },
    [resolution.state],
  );

  return {
    ...resolution,
    primaryAction,
    projectId,
    refresh: identity.refresh,
    runWhenReady,
  };
}

/**
 * Inline blocked-state renderer: title + reason + the gate's primary
 * action. Renders null when ready; while loading it shows the transient
 * "Checking your session…" text with no action.
 */
export function StudioAccessGate({ access, testId }: { access: StudioAccess; testId?: string }): React.ReactNode {
  if (access.state === "ready") return null;
  return (
    <div
      role="status"
      data-testid={testId ?? "studio-access-gate"}
      className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-3"
    >
      <p className="text-[13px] font-medium text-[var(--text-primary)]">{access.title}</p>
      {access.reason ? (
        <p className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">{access.reason}</p>
      ) : null}
      {access.primaryAction ? (
        <button
          type="button"
          onClick={access.primaryAction.run}
          className="mt-2 inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--bg-elevated)] px-4 py-2 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--studio-bg-selected)]"
        >
          {access.primaryAction.label}
        </button>
      ) : null}
    </div>
  );
}
