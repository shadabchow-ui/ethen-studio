/**
 * Studio V2 Job 12B (Gate F) — canonical review live binding.
 *
 * Minimal production-safe data path from canonical approval/review state
 * to the shared review/approval presentation contract:
 *
 *   canonical review link + consent rows (canonical resolve loaders)
 *     -> consent/link validation (gateReviewLinkResolution)
 *     -> canonical authority check (resolveReviewLink)
 *   canonical approval (CanonicalApprovalService.getApproval)
 *     -> review mapper (toApprovalCardProps)
 *   canonical export row (studio_exports)
 *     -> export linkage validation (gateExportDelivery)
 *
 * The UI is never the authority: every binding re-checks the canonical
 * record and degrades to an explicit blocked state. Unknown tokens,
 * removed assets, and unbound links deny. Sample/test approvals can never
 * render actionable. Job 13 owns placement/design.
 */

import "server-only";

import type { ApprovalCardPayload, ApprovalCardProps } from "@ethen/ui/approval-card";
import { CanonicalApprovalService } from "@ethen/ai/platform/approvals/service";
import { createCanonicalApprovalService } from "@ethen/ai/platform/approvals/server";
import type { ApprovalEnvelope } from "@ethen/ai/platform/approvals/contract";
import {
  defaultReviewResolveDeps,
  hashReviewToken,
  resolveReviewLink,
  type ResolvedReviewLink,
  type ReviewResolveDeps,
} from "./review-links";
import { getStudioRepository, type StudioPersistenceScope, type StudioRepository } from "./persistence/studio-repository";
import {
  gateExportDelivery,
  gateReviewLinkResolution,
  toApprovalCardProps,
  type CanonicalStudioApproval,
  type ReviewBlock,
} from "./review-shell-wiring";

export interface StudioReviewBindingDeps {
  review?: ReviewResolveDeps;
  approvals?: CanonicalApprovalService;
  repo?: StudioRepository;
}

export type StudioReviewLinkBinding =
  | { outcome: "live"; resolved: ResolvedReviewLink }
  | { outcome: "blocked"; block: ReviewBlock };

export type StudioApprovalCardBinding =
  | { outcome: "card"; payload: ApprovalCardPayload; status: ApprovalCardProps["status"]; actionable: boolean; consumed: boolean }
  | { outcome: "blocked"; block: ReviewBlock };

export type StudioExportDeliveryBinding =
  | { outcome: "clear"; exportId: string; manifestHash: string; card: { payload: ApprovalCardPayload; status: ApprovalCardProps["status"] } }
  | { outcome: "blocked"; block: ReviewBlock };

function mergedReviewDeps(overrides?: ReviewResolveDeps): Required<ReviewResolveDeps> {
  return { ...defaultReviewResolveDeps(), ...overrides };
}

/** Map a canonical envelope to the shell mapper input. Labels derive from canonical fields only. */
export function mapApprovalEnvelopeToShellInput(envelope: ApprovalEnvelope): CanonicalStudioApproval {
  const lifecycle: CanonicalStudioApproval["lifecycle"] =
    envelope.status === "approved"
      ? (envelope.executionClaimedAt ? "consumed" : "approved")
      : envelope.status === "pending"
        ? "pending"
        : envelope.status === "expired"
          ? "expired"
          : "denied";
  const resource = envelope.scope.resourceId ?? envelope.projectId;
  return {
    id: envelope.id,
    title: `Approval ${envelope.id.slice(0, 8)}`,
    description: `${envelope.scope.kind} on ${resource}`,
    riskCategories: [...envelope.scope.permissions],
    action: envelope.scope.kind,
    resource,
    affectedEntities: envelope.runId ? [envelope.runId] : [],
    lifecycle,
    expiresAt: envelope.expiresAt,
    consumedAt: envelope.executionClaimedAt,
    promptHash: envelope.actionHash,
  };
}

async function loadApprovals(deps?: StudioReviewBindingDeps): Promise<CanonicalApprovalService> {
  return deps?.approvals ?? createCanonicalApprovalService();
}

/**
 * Read one canonical review link and validate it for shell presentation.
 * Canonical rows feed the shell gate; the canonical resolver runs as the
 * authority check and wins any disagreement (it never disagrees — the
 * gate mirrors it — but authority stays server-side by construction).
 */
export async function readStudioReviewLink(
  token: string,
  deps: StudioReviewBindingDeps = {},
  nowMs: number = Date.now(),
): Promise<StudioReviewLinkBinding> {
  const merged = mergedReviewDeps(deps.review);
  if (!/^[0-9a-f]{64}$/i.test(token?.trim() ?? "")) {
    return { outcome: "blocked", block: { blocked: true, code: "REVIEW_REVOKED", message: "Unknown review link; resolution is blocked." } };
  }
  const link = await merged.findByTokenHash(hashReviewToken(token));
  if (!link) {
    return { outcome: "blocked", block: { blocked: true, code: "REVIEW_REVOKED", message: "Unknown review link; resolution is blocked." } };
  }
  const consents = [] as Array<{ id: string; lifecycle: string; expiresAt: string | null }>;
  for (const consentId of link.consentSnapshot) {
    const consent = await merged.loadConsent(link.projectId, consentId);
    consents.push({ id: consentId, lifecycle: consent?.lifecycle ?? "revoked", expiresAt: consent?.expiresAt ?? null });
  }
  const gate = gateReviewLinkResolution({
    link: { id: link.id, expiresAt: link.expiresAt, revokedAt: link.revokedAt, consentIds: link.consentSnapshot },
    consents,
    now: nowMs,
  });
  if (gate.blocked) return { outcome: "blocked", block: gate };
  try {
    const resolved = await resolveReviewLink(token, merged, nowMs);
    return { outcome: "live", resolved };
  } catch (error) {
    const message = error instanceof Error ? error.message : "REVIEW_DENIED";
    if (/link revoked/i.test(message)) {
      return { outcome: "blocked", block: { blocked: true, code: "REVIEW_REVOKED", message } };
    }
    if (/link expired/i.test(message)) {
      return { outcome: "blocked", block: { blocked: true, code: "REVIEW_EXPIRED", message } };
    }
    if (/consent was removed/i.test(message)) {
      const expired = consents.some((consent) => {
        const parsed = consent.expiresAt ? Date.parse(consent.expiresAt) : NaN;
        return consent.lifecycle === "expired" || (Number.isFinite(parsed) && parsed <= nowMs);
      });
      return {
        outcome: "blocked",
        block: {
          blocked: true,
          code: expired ? "CONSENT_EXPIRED" : "CONSENT_REVOKED",
          message,
        },
      };
    }
    return { outcome: "blocked", block: { blocked: true, code: "REVIEW_REVOKED", message } };
  }
}

/**
 * Read one canonical approval and map it to shared card props. Only a live
 * `approved` card is actionable; denied, expired, consumed, and pending
 * cards render their truthful status with no actions (the shell attaches
 * actions to `approved` only). Missing, cross-project, and sample records
 * have no meaningful card and block outright.
 */
export async function readStudioApprovalCard(
  projectId: string,
  actorId: string,
  approvalId: string,
  deps: StudioReviewBindingDeps = {},
  nowMs: number = Date.now(),
): Promise<StudioApprovalCardBinding> {
  const approvals = await loadApprovals(deps);
  const envelope = await approvals.getApproval({ projectId, actorId }, approvalId).catch(() => null);
  if (!envelope || envelope.projectId !== projectId) {
    return { outcome: "blocked", block: { blocked: true, code: "APPROVAL_INVALID", message: "Approval not found in this project." } };
  }
  if (envelope.sample) {
    return { outcome: "blocked", block: { blocked: true, code: "APPROVAL_INVALID", message: "Sample evidence can never authorize." } };
  }
  const card = toApprovalCardProps(mapApprovalEnvelopeToShellInput(envelope), { now: nowMs });
  return {
    outcome: "card",
    payload: card.payload,
    status: card.status,
    actionable: card.status === "approved",
    consumed: envelope.executionClaimedAt !== null,
  };
}

/**
 * Validate one canonical export for delivery: the export row must pin a
 * manifest hash and bind a consumed approval. Anything else blocks.
 */
export async function readStudioExportDelivery(
  scope: StudioPersistenceScope,
  exportId: string,
  approvalId: string | null,
  deps: StudioReviewBindingDeps = {},
  nowMs: number = Date.now(),
): Promise<StudioExportDeliveryBinding> {
  const repo = deps.repo ?? getStudioRepository();
  const row = await repo.get(scope, "studio_exports", exportId).catch(() => null);
  if (!row) {
    return { outcome: "blocked", block: { blocked: true, code: "EXPORT_LINKAGE_BROKEN", message: "Export not found in this project." } };
  }
  const data = (row.payload ?? {}) as Record<string, unknown>;
  const destination = (data.destination ?? {}) as Record<string, unknown>;
  const manifestHash = typeof destination.manifestHash === "string" ? (destination.manifestHash as string) : null;
  const approvals = await loadApprovals(deps);
  const envelope = approvalId
    ? await approvals.getApproval({ projectId: scope.projectId, actorId: scope.actorId }, approvalId).catch(() => null)
    : null;
  const approval = envelope && envelope.projectId === scope.projectId && !envelope.sample
    ? mapApprovalEnvelopeToShellInput(envelope)
    : null;
  const gate = gateExportDelivery({
    linkage: {
      exportId,
      manifestHash,
      approvalId,
      approvalConsumed: envelope !== null && envelope.projectId === scope.projectId && envelope.executionClaimedAt !== null,
    },
    approval,
    now: nowMs,
  });
  if (gate.blocked) return { outcome: "blocked", block: gate };
  const card = toApprovalCardProps(approval as CanonicalStudioApproval, { now: nowMs });
  return {
    outcome: "clear",
    exportId,
    manifestHash: manifestHash as string,
    card: { payload: card.payload, status: card.status },
  };
}
