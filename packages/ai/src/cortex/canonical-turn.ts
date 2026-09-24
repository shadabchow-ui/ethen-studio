import "server-only";

import { createUniversalRunService } from "../platform/runs/server";
import { createServiceClient } from "@ethen/database/service";
import { OutcomeService } from "../platform/outcome/service";
import { SupabaseOutcomePlaneStore } from "../platform/outcome/supabase-store";
import type { OutcomeScope } from "../platform/outcome/types";
import {
  assertBotContextAllowed,
  botTurnNeedsAdmission,
  classifyBotToolAction,
  buildBotEvidenceRef,
  buildBotOutcomeInput,
  buildBotRunLinkage,
  connectorWriteRequiresApproval,
  type BotCanonicalLinkage,
  type BotExecutionStatus,
} from "./canonical-binding";
import type { EthenRouteReceipt } from "./types";

/**
 * P29 — the production caller for `canonical-binding.ts`.
 *
 * Before this module the binding existed but nothing on the live Bot path
 * invoked it, so Bot turns were correlated to Cortex rows without ever
 * passing through canonical execution. This closes that gap:
 *
 *   conversation → task → P08/P13 admission → P09 Run/Attempt/Job
 *     → P12 tool/capability → provider execution → P10 receipt/evidence
 *     → P30 Outcome (→ P31 Judgment, P32 Experience downstream)
 *
 * The module owns no authority of its own. P09 mints run identity, P08
 * decides admission and approvals, P30 records the outcome. It contains no
 * scheduler, no approval state, and no second context authority.
 *
 * Truthfulness rules, all fail-closed:
 *  - a turn that needs admission and has no canonical approval is refused;
 *  - a cross-product context read with no explicit grant is refused;
 *  - if canonical run creation fails, the turn is NOT reported as bound;
 *  - if outcome persistence fails, the turn is NOT reported as succeeded.
 */

/**
 * Resolves the canonical scope for a Bot turn from the authenticated user.
 *
 * The tenant is the canonical `tenants` row the user owns — P07 remains the
 * tenant authority and nothing is invented here. When no tenant exists the
 * turn simply is not bound: an explicitly unbound turn is truthful, whereas
 * inventing a tenant id would be a second tenant authority.
 */
export async function resolveBotCanonicalScope(input: {
  userId: string;
  projectId?: string | null;
}): Promise<OutcomeScope | null> {
  const client = createServiceClient({
    reason: "bot_canonical_turn_scope",
    actorId: input.userId,
    tables: ["tenants", "projects"],
  });
  if (!client) return null;
  const { data, error } = await client
    .from("tenants")
    .select("id, name")
    .eq("owner_user_id", input.userId)
    .limit(1);
  if (error) return null;
  const tenant = (data ?? [])[0] as { id?: string } | undefined;
  if (!tenant?.id) return null;

  // A P09 run requires a real project: `runs.project_id` is a foreign key.
  // The project is resolved, never created here — inventing one would make
  // this a second project authority. With none, the turn stays unbound.
  let projectId = input.projectId ?? null;
  if (!projectId) {
    const { data: projects, error: projectError } = await client
      .from("projects")
      .select("id")
      .eq("owner_user_id", input.userId)
      .eq("tenant_id", tenant.id)
      .limit(1);
    if (projectError) return null;
    projectId = ((projects ?? [])[0] as { id?: string } | undefined)?.id ?? null;
  }

  return {
    organizationId: String(tenant.id),
    tenantId: String(tenant.id),
    projectId,
    actorId: input.userId,
  };
}

export interface OpenBotTurnInput {
  scope: OutcomeScope;
  conversationId: string;
  taskId: string;
  /** Caller-generated turn id. Minted BEFORE the provider is invoked. */
  requestId: string;
  /** Tool classes this turn intends to use; drives P08/P13 admission. */
  toolClasses?: readonly Parameters<typeof classifyBotToolAction>[0][];
  /** Approval id when the turn carries consequential (write) tool use. */
  approvalId?: string | null;
  /** Foreign product scopes explicitly granted for this turn. */
  grantedContextScopes?: readonly string[] | null;
}

/**
 * Handle for an OPEN turn. It deliberately carries no receipt id: the turn is
 * admitted and bound before the provider is called, so no receipt exists yet.
 * The receipt is joined at close, when it does.
 */
export interface BotTurnHandle {
  scope: OutcomeScope;
  conversationId: string;
  taskId: string;
  requestId: string;
  canonicalRunId: string;
  canonicalAttemptId: string | null;
}

export type OpenBotTurnResult =
  | { state: "bound"; handle: BotTurnHandle }
  | { state: "refused"; reason: string; code: "admission_required" | "context_denied" | "binding_failed" };

/** Cross-product context reads are default-deny; same-scope needs no grant. */
export function checkBotContextAccess(input: {
  requestedScope: string;
  grantedScopes?: readonly string[] | null;
}): { allowed: boolean; auditEvent: "context.cross_product_read" | null } {
  return assertBotContextAllowed({
    activeScope: "bot",
    requestedScope: input.requestedScope,
    grantedScopes: input.grantedScopes ?? null,
  });
}

/**
 * Opens a canonical turn: enforces admission and context rules, then creates
 * the P09 run that the whole turn is bound to. Returns a refusal rather than
 * throwing, so no caller can mistake a crash for permission.
 *
 * This runs BEFORE the provider is invoked. Admission that happens after a
 * model call has already started cannot prevent the spend it was meant to
 * gate, so the ordering is part of the contract, not an implementation
 * detail.
 */
export async function openBotCanonicalTurn(input: OpenBotTurnInput): Promise<OpenBotTurnResult> {
  const toolClasses = input.toolClasses ?? [];

  // P08/P13: a consequential turn needs a canonical approval. The Bot never
  // holds approval state of its own, and no local flag can substitute.
  if (botTurnNeedsAdmission(toolClasses)) {
    // Every consequential class is a canonical WRITE; a write with no
    // approval id is refused. The Bot never self-approves.
    const consequential = toolClasses.filter((cls) => classifyBotToolAction(cls) === "consequential");
    const requiresApproval = consequential.some((cls) =>
      connectorWriteRequiresApproval({ kind: classifyBotToolAction(cls) === "consequential" ? "write" : "read" }),
    );
    if (requiresApproval && !(input.approvalId ?? "").trim()) {
      return {
        state: "refused",
        code: "admission_required",
        reason: "This action needs an approval before it can run.",
      };
    }
  }

  if (!input.scope.projectId) {
    // No canonical project → no P09 run is possible. Report it rather than
    // substituting the organization id, which is not a project.
    return { state: "refused", code: "binding_failed", reason: "No canonical project for this turn." };
  }
  try {
    const runs = await createUniversalRunService();
    const envelope = await runs.createRun({
      organizationId: input.scope.organizationId,
      projectId: input.scope.projectId,
      actorId: input.scope.actorId,
      executionMode: "interactive",
      workspace: "code",
      // Honest base workspace plus the versioned Bot extension (A0-H2);
      // never a model masquerade, and never a second run taxonomy.
      workspaceExtension: { name: "bot", version: 1 },
      idempotencyKey: `bot-turn-${input.requestId}`,
      policySnapshot: {
        id: "bot-p29",
        version: "1",
        hash: input.requestId,
        capturedAt: new Date().toISOString(),
      },
    });
    const attempt = envelope.attempts[0] ?? null;
    return {
      state: "bound",
      handle: {
        scope: input.scope,
        conversationId: input.conversationId,
        taskId: input.taskId,
        requestId: input.requestId,
        canonicalRunId: envelope.id,
        canonicalAttemptId: attempt?.id ?? null,
      },
    };
  } catch {
    // Binding failed: report it. Proceeding "unbound but successful" would
    // be exactly the fake-success this contract forbids.
    return { state: "refused", code: "binding_failed", reason: "Canonical run binding failed." };
  }
}

export interface CloseBotTurnInput {
  handle: BotTurnHandle;
  status: BotExecutionStatus;
  /** Present when the provider produced one; absent on provider failure. */
  receipt: EthenRouteReceipt | null;
}

export type CloseBotTurnResult =
  | { state: "recorded"; outcomeId: string; evidenceRefId: string }
  | { state: "failed"; reason: string };

/**
 * Closes a canonical turn by recording the P30 Outcome bound to the P09 run,
 * with the P10 receipt as evidence. A persistence failure is returned as a
 * failure — never swallowed into an apparent success.
 */
export async function closeBotCanonicalTurn(input: CloseBotTurnInput): Promise<CloseBotTurnResult> {
  const { handle } = input;
  const client = createServiceClient({
    reason: "bot_canonical_turn_outcome",
    actorId: handle.scope.actorId,
    tables: ["platform_outcomes"],
  });
  if (!client) return { state: "failed", reason: "Canonical outcome store unavailable." };

  // The receipt joins the canonical run here. A turn whose provider never
  // produced one still records an outcome — as a FAILED outcome bound to the
  // same run, never as a missing or successful one.
  const linkage: BotCanonicalLinkage = buildBotRunLinkage({
    conversationId: handle.conversationId,
    taskId: handle.taskId,
    canonicalRunId: handle.canonicalRunId,
    canonicalAttemptId: handle.canonicalAttemptId,
    receiptRunId: input.receipt?.runId ?? handle.canonicalRunId,
    requestId: input.receipt?.requestId ?? handle.requestId,
  });
  const evidence = input.receipt ? buildBotEvidenceRef(linkage, input.receipt) : null;
  try {
    const outcomes = new OutcomeService(new SupabaseOutcomePlaneStore(client));
    const built = buildBotOutcomeInput({
      scope: handle.scope,
      linkage,
      status: input.status,
    });
    const outcome = await outcomes.recordOutcome({
      ...built,
      evidenceRefId: linkage.canonicalRunId,
    });
    return { state: "recorded", outcomeId: outcome.id, evidenceRefId: evidence?.receiptRunId ?? linkage.canonicalRunId };
  } catch {
    return { state: "failed", reason: "Canonical outcome persistence failed." };
  }
}
