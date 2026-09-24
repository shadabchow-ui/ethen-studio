// lib/agents/runtime/computer-use/platform-approval-bridge.ts
//
// CU-P0-07 (APPROVAL-AUTHORITY-MERGE-01): additive integration of Computer
// Use approvals with the platform CanonicalApprovalService — WITHOUT weakening
// the stronger local binding (canonical identity + payload hash + one-shot
// resolve + re-policy, all of which remain the first gate).
//
// When the platform approval authority is reachable (durable mode with
// Supabase), the human decision on the CU approval route is mirrored into the
// platform: request → approve → authorize (durable one-shot claim) for the
// exact same canonical action bytes. The platform claim makes replay fail
// durably even across process restarts.
//
// When the platform authority is UNAVAILABLE (no Supabase / memory mode), the
// integration is skipped and the local gate remains authoritative — the local
// binding is at least as strong as before. A platform DENIAL (action mismatch,
// expired, already claimed) always blocks execution: the platform never
// weakens the gate, it only ever adds denials.

import { createHash } from "node:crypto";
import type { CanonicalApprovalService } from "../../../platform/approvals";
import type { ApprovalPolicyBinding, ApprovalScope } from "../../../platform/approvals";
import type { ComputerAction } from "./types";
import {
  requestComputerUseApproval,
  authorizeComputerUseAction,
} from "./approval-binding";

const COMPUTER_USE_POLICY_ID = "computer-use-action-policy";

/** Stable policy snapshot — capturedAt is pinned so the policy hash is
 * identical at request and authorize time. */
export function computerUsePlatformPolicyBinding(): ApprovalPolicyBinding {
  return {
    snapshot: {
      id: COMPUTER_USE_POLICY_ID,
      version: "1.0",
      hash: createHash("sha256")
        .update(COMPUTER_USE_POLICY_ID, "utf8")
        .digest("hex")
        .slice(0, 16),
      capturedAt: "2026-01-01T00:00:00.000Z",
    },
    requireDifferentApprover: true,
  };
}

export function computerUsePlatformScope(runId: string): ApprovalScope {
  return {
    kind: "computer_use_action",
    resourceId: runId,
    permissions: ["computer:execute"],
    constraints: {},
  };
}

export type ComputerUsePlatformIntegration =
  | { integrated: true; platformApprovalId: string }
  | { integrated: false; reason: "unavailable" }
  | { integrated: false; reason: "denied"; code: string };

/**
 * Mirror a human-approved Computer Use action into the platform approval
 * authority: request → approve → authorize (durable one-shot claim).
 *
 * The attempt id binds the execution attempt; the local approval id is used
 * so request and authorize hash the same scope (the local approval is
 * one-shot, so one attempt maps to one execution).
 */
export async function integrateComputerUseApproval(input: {
  approvals: CanonicalApprovalService;
  organizationId: string;
  projectId: string;
  runId: string;
  attemptId: string;
  requesterId: string;
  actorId: string;
  action: ComputerAction;
}): Promise<ComputerUsePlatformIntegration> {
  const policy = computerUsePlatformPolicyBinding();
  const scope = computerUsePlatformScope(input.runId);

  try {
    const envelope = await requestComputerUseApproval({
      approvals: input.approvals,
      organizationId: input.organizationId,
      projectId: input.projectId,
      runId: input.runId,
      attemptId: input.attemptId,
      requesterId: input.requesterId,
      action: input.action,
      policy,
      scope,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    // The CU approval route is the human decision point: the platform record
    // is approved by the same actor who approved the local CU approval. The
    // requester is "policy" (system), so separation of duties holds.
    await input.approvals.approve(
      { projectId: input.projectId, actorId: input.actorId },
      envelope.id,
      "computer_use_action_human_approved",
    );

    const authorization = await authorizeComputerUseAction({
      approvals: input.approvals,
      access: { projectId: input.projectId, actorId: input.actorId },
      approvalId: envelope.id,
      runId: input.runId,
      attemptId: input.attemptId,
      action: input.action,
      policy,
      scope,
    });

    if (!authorization.allowed) {
      return { integrated: false, reason: "denied", code: authorization.code };
    }

    return { integrated: true, platformApprovalId: envelope.id };
  } catch {
    // Platform authority unreachable (no Supabase / memory mode / storage
    // error): the local gate remains the sole authority — additive only.
    return { integrated: false, reason: "unavailable" };
  }
}
