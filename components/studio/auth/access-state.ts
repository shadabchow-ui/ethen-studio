/**
 * RC4 — shared Studio access gate, pure resolver (framework-free).
 *
 * Gating was reimplemented in every surface (ProjectContext, voice dialogs,
 * workbench adapters, navigation model, home ⌘N), each with its own dead
 * controls and missing reasons. This module resolves the single access
 * state — identity first, then project scope — with one title, one reason,
 * and one primary action per blocked state. The React hook
 * (`use-studio-access.tsx`) binds actions to dispatch/navigation; unit
 * tests cover this resolver directly.
 */

import type { StudioIdentityStatus } from "./identity-state";

export type StudioAccessState =
  | "loading"
  | "signed_out"
  | "identity_pending"
  | "identity_unavailable"
  | "no_project"
  | "ready";

export type StudioAccessActionId =
  | "signin"
  | "finish-setup"
  | "retry"
  | "open-projects";

export interface StudioAccessResolution {
  state: StudioAccessState;
  /** Short heading for the blocked state (unused when ready). */
  title: string;
  /** Plain-language reason with an implied next step (null when ready). */
  reason: string | null;
  actionId: StudioAccessActionId | null;
  actionLabel: string | null;
}

/**
 * Resolve access: identity states take precedence over project scope, so a
 * signed-out user is told to sign in (not to pick a project), and a
 * Clerk-signed-in-but-unmapped user is told setup is finishing (never
 * offered the no-op sign-in). `no_project` applies only to signed-in
 * callers that require project scope.
 */
export function resolveStudioAccess(input: {
  identityStatus: StudioIdentityStatus;
  requiresProject: boolean;
  projectId: string | null;
}): StudioAccessResolution {
  switch (input.identityStatus) {
    case "loading":
      return {
        state: "loading",
        title: "Checking session…",
        reason: "Checking your session…",
        actionId: null,
        actionLabel: null,
      };
    case "signed_out":
      return {
        state: "signed_out",
        title: "Sign in required",
        reason: "Sign in to continue — everything here stays exactly as you left it.",
        actionId: "signin",
        actionLabel: "Sign in",
      };
    case "identity_pending":
      return {
        state: "identity_pending",
        title: "Finishing account setup",
        reason: "You are signed in, but Studio is still setting up your account.",
        actionId: "finish-setup",
        actionLabel: "Finish setup",
      };
    case "identity_unavailable":
      return {
        state: "identity_unavailable",
        title: "Account check failed",
        reason: "Studio could not verify your account just now.",
        actionId: "retry",
        actionLabel: "Retry",
      };
    case "signed_in":
      break;
  }
  if (input.requiresProject && !input.projectId) {
    return {
      state: "no_project",
      title: "Select a project",
      reason: "This needs a project. Select one or create a new project to continue.",
      actionId: "open-projects",
      actionLabel: "Open projects",
    };
  }
  return {
    state: "ready",
    title: "",
    reason: null,
    actionId: null,
    actionLabel: null,
  };
}
