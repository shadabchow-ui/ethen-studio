/**
 * Studio V2 Job 12B (Gates E+F) — canonical live binding proofs.
 * Run with: node --conditions=react-server --import tsx lib/media/__tests__/stu-33-job12b-live-bindings.test.ts
 *
 * Proves the shared presentation contracts consume real canonical Studio
 * state through the smallest production-safe bindings (no visual migration):
 *
 *   Gate E: canonical durable job -> job-shell-binding -> presentStudioJob
 *   Gate F: canonical approval/review -> review-shell-binding -> ApprovalCard
 *
 * Canonical services run for real (DurableJobService, CanonicalApprovalService,
 * resolveReviewLink, create/revokeReviewLink) against memory repositories.
 * Unknown states never render fake success; expired/revoked conditions block.
 */
import { createHash } from "node:crypto";
import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { InMemoryJobRepository } from "@ethen/ai/platform/jobs/in-memory-repository";
import type { JobError, JobRecord } from "@ethen/ai/platform/jobs/index";
import { CanonicalApprovalService } from "@ethen/ai/platform/approvals/service";
import { MemoryApprovalRepository } from "@ethen/ai/platform/approvals/memory-repository";
import type {
  ApprovalPolicyBinding,
  ApprovalScope,
  CanonicalApproval,
} from "@ethen/ai/platform/approvals/contract";
import { MemoryImageCreditLedger } from "../image-settlement";
import { MemoryStudioRepository } from "../persistence/studio-repository";
import { readStudioJobPresentation } from "../job-shell-binding";
import { createReviewLink, revokeReviewLink } from "../review-links";
import {
  readStudioApprovalCard,
  readStudioExportDelivery,
  readStudioReviewLink,
  type StudioReviewBindingDeps,
} from "../review-shell-binding";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label}`);
}

const SCOPE = { organizationId: "user:actor-a", projectId: "33333333-3333-4333-8333-333333333333", actorId: "actor-a" };
const OTHER_SCOPE = { organizationId: "user:actor-b", projectId: "44444444-4444-4444-8444-444444444444", actorId: "actor-b" };
const FUTURE = new Date(Date.now() + 3600_000).toISOString();
const PAST = new Date(Date.now() - 3600_000).toISOString();

function jobError(code: string, message: string, retryable: boolean): JobError {
  return { code, message, retryable, occurredAt: new Date().toISOString(), details: {} };
}

function jobDeps() {
  const repository = new InMemoryJobRepository();
  return {
    repository,
    service: new DurableJobService({ repository }),
    ledger: new MemoryImageCreditLedger(),
  };
}

async function makeJob(
  deps: ReturnType<typeof jobDeps>,
  key: string,
  extra: Record<string, unknown> = {},
): Promise<JobRecord> {
  await deps.ledger.reserve({
    organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, jobId: null, actorId: SCOPE.actorId,
    idempotencyKey: key, pricingVersionId: "price-12b", approvedCeiling: 6, reservedCredits: 6,
  });
  return deps.service.createJob({
    organizationId: SCOPE.organizationId,
    projectId: SCOPE.projectId,
    idempotencyKey: key,
    payload: {
      kind: "openai-image", prompt: "binding probe", actorId: SCOPE.actorId,
      reservationKey: key, quotedCredits: 6, pricingVersionId: "price-12b", ...extra,
    },
  });
}

// ── Gate E: canonical job states reach the shared contract ──

async function testJobQueued(): Promise<void> {
  const deps = jobDeps();
  const job = await makeJob(deps, "bind-queued");
  const binding = await readStudioJobPresentation(SCOPE.projectId, job.id, deps);
  assert(binding?.status === "queued", "binding reads the canonical queued status verbatim");
  assert(binding?.presentation.state === "queued", "queued presents queued");
  assert(binding?.presentation.terminal === false, "queued is not terminal");
  assert(binding?.presentation.progress === null, "no measured progress renders no bar");
  assert(binding?.hasReceipt === false, "unsettled job carries no receipt");
}

async function testJobRunning(): Promise<void> {
  const deps = jobDeps();
  const job = await makeJob(deps, "bind-running");
  await deps.service.claimJob("worker-1");
  await deps.service.renewLease(job.id, "worker-1", 60);
  const binding = await readStudioJobPresentation(SCOPE.projectId, job.id, deps);
  assert(binding?.status === "running", "binding reads the canonical running status");
  assert(binding?.presentation.state === "running", "running presents running");
  assert(binding?.presentation.actions.includes("cancel") === true, "running offers cancel");
}

async function testJobReconciling(): Promise<void> {
  const deps = jobDeps();
  const job = await makeJob(deps, "bind-reconciling");
  await deps.service.claimJob("worker-1");
  await deps.service.markIndeterminate(job.id, "worker-1", jobError("SEND_UNCERTAIN", "outcome unknown", true));
  const binding = await readStudioJobPresentation(SCOPE.projectId, job.id, deps);
  assert(binding?.status === "indeterminate", "binding reads the canonical indeterminate status");
  assert(binding?.presentation.state === "reconciling", "indeterminate presents reconciling");
  assert(binding?.presentation.reconcilable === true, "reconciling reconciles, never blind-retries");
  assert(binding?.presentation.actions.includes("retry") === false, "reconciling offers no blind retry");
}

async function testJobCompleted(): Promise<void> {
  const deps = jobDeps();
  const job = await makeJob(deps, "bind-completed");
  await deps.service.claimJob("worker-1");
  await deps.ledger.settle(SCOPE.projectId, "bind-completed", 6, "e".repeat(64));
  await deps.service.completeJob(job.id, "worker-1");
  await deps.repository.appendJobEvent(job.id, "worker-1", "completed", { settled: true });
  const binding = await readStudioJobPresentation(SCOPE.projectId, job.id, deps);
  assert(binding?.presentation.state === "completed", "completed presents completed");
  assert(binding?.presentation.terminal === true, "completed is terminal");
  assert(binding?.hasReceipt === true, "settled spend attaches a receipt");
  assert(binding?.presentation.actions.includes("view-receipt") === true, "completion offers its receipt");
  assert(binding?.hasEvidence === true, "durable trail marks evidence");
}

async function testJobFailed(): Promise<void> {
  const deps = jobDeps();
  const job = await makeJob(deps, "bind-failed");
  await deps.service.claimJob("worker-1");
  await deps.service.failJob(job.id, "worker-1", jobError("PROVIDER_REQUEST_INVALID", "bad request", false), false);
  const binding = await readStudioJobPresentation(SCOPE.projectId, job.id, deps);
  assert(binding?.presentation.state === "failed", "failed presents failed");
  assert(binding?.presentation.terminal === true, "failed is terminal");
  assert(binding?.presentation.actions.includes("retry") === true, "failed offers retry");
  assert(binding?.terminalReason?.includes("PROVIDER_REQUEST_INVALID") === true, "terminal reason carries the canonical error");
}

async function testJobDeadLetter(): Promise<void> {
  const deps = jobDeps();
  const job = await deps.service.createJob({
    organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, idempotencyKey: "bind-dead",
    payload: { kind: "openai-image", prompt: "x", actorId: SCOPE.actorId },
    maxAttempts: 1,
  });
  await deps.service.claimJob("worker-1");
  await deps.service.failJob(job.id, "worker-1", jobError("OUTPUT_DOWNLOAD_FAILED", "flaky", true), true);
  const binding = await readStudioJobPresentation(SCOPE.projectId, job.id, deps);
  assert(binding?.status === "dead_letter", "exhausted retries dead-letter canonically");
  assert(binding?.presentation.state === "dead-letter", "dead letter presents dead-letter");
  assert(binding?.presentation.terminal === true, "dead letter is terminal");
  assert(binding?.presentation.actions.includes("acknowledge") === true, "dead letter offers acknowledge");
}

async function testJobUnknown(): Promise<void> {
  const deps = jobDeps();
  const job = await makeJob(deps, "bind-unknown");
  // Simulate a future runtime status the contract predates: same durable
  // row shape, unrecognized status string.
  const stored = await deps.service.getJob({ projectId: SCOPE.projectId }, job.id);
  await deps.repository.createJob({ ...(stored as JobRecord), id: "job-future-1", idempotencyKey: "bind-future", status: "time_traveling" } as unknown as JobRecord);
  const binding = await readStudioJobPresentation(SCOPE.projectId, "job-future-1", deps);
  assert(binding?.status === "time_traveling", "binding passes unknown statuses through verbatim");
  assert(binding?.presentation.state === "unknown", "unknown never renders fake success");
  assert(binding?.presentation.progress === null, "unknown renders no progress");
  assert(binding?.presentation.terminal === false, "unknown is not terminal");
}

async function testJobCrossProject(): Promise<void> {
  const deps = jobDeps();
  const job = await makeJob(deps, "bind-xproj");
  const binding = await readStudioJobPresentation(OTHER_SCOPE.projectId, job.id, deps);
  assert(binding === null, "cross-project job reads resolve to nothing");
}

// ── Gate F harness: canonical review/approval/export state ──

const POLICY: ApprovalPolicyBinding = {
  snapshot: { id: "policy-production", version: "7", hash: "sha256:policy-production-v7", capturedAt: new Date().toISOString() },
  requireDifferentApprover: false,
};
const APPROVAL_SCOPE: ApprovalScope = {
  kind: "studio_export",
  resourceId: "export-1",
  permissions: ["write", "publish"],
  constraints: {},
};
const ACTION = new TextEncoder().encode('{"export":"original"}');

function approvalDeps() {
  const repository = new MemoryApprovalRepository();
  return { repository, service: new CanonicalApprovalService({ repository }) };
}

async function requestApproval(
  deps: ReturnType<typeof approvalDeps>,
  overrides: { projectId?: string; expiresAt?: string } = {},
) {
  return deps.service.requestApproval({
    organizationId: "org-ethen",
    projectId: overrides.projectId ?? SCOPE.projectId,
    requesterId: SCOPE.actorId,
    actionBytes: ACTION,
    policy: POLICY,
    scope: APPROVAL_SCOPE,
    expiresAt: overrides.expiresAt ?? FUTURE,
  });
}

async function consumeApproval(deps: ReturnType<typeof approvalDeps>, approvalId: string): Promise<void> {
  const scope = { projectId: SCOPE.projectId, actorId: SCOPE.actorId };
  await deps.service.approve(scope, approvalId, "review_complete");
  const result = await deps.service.authorize(scope, approvalId, { actionBytes: ACTION, policy: POLICY, scope: APPROVAL_SCOPE });
  if (!result.allowed) throw new Error(`setup failed: authorize denied (${result.code})`);
}

function reviewHarness() {
  const repo = new MemoryStudioRepository();
  const deps: StudioReviewBindingDeps = {
    repo,
    review: {
      findByTokenHash: async (hash: string) => {
        const rows = await repo.list(SCOPE, "studio_review_links");
        const row = rows.find((entry) => ((entry.payload as Record<string, unknown>).token_hash as string) === hash);
        if (!row) return null;
        const data = row.payload as Record<string, unknown>;
        return {
          id: row.id, organizationId: SCOPE.organizationId, projectId: SCOPE.projectId,
          scope: (data.scope ?? { assetIds: [] }) as { assetIds: string[] },
          note: String(data.note ?? ""),
          consentSnapshot: (Array.isArray(data.consent_snapshot) ? data.consent_snapshot : []) as string[],
          expiresAt: String(data.expires_at ?? ""),
          revokedAt: data.revoked_at ? String(data.revoked_at) : null,
        };
      },
      loadConsent: async (_projectId: string, consentId: string) => {
        const row = await repo.get(SCOPE, "studio_consents", consentId);
        if (!row) return null;
        const data = row.payload as Record<string, unknown>;
        return { lifecycle: String(data.lifecycle ?? ""), expiresAt: typeof data.expires_at === "string" ? (data.expires_at as string) : null };
      },
      loadAsset: async (_projectId: string, assetId: string) => {
        const row = await repo.get(SCOPE, "studio_assets", assetId);
        if (!row) return null;
        const data = row.payload as Record<string, unknown>;
        const metadata = (data.metadata ?? {}) as Record<string, unknown>;
        return {
          id: row.id, kind: typeof data.asset_kind === "string" ? (data.asset_kind as string) : "generation",
          title: typeof metadata.name === "string" ? (metadata.name as string) : row.id,
          contentHash: typeof data.content_hash === "string" ? (data.content_hash as string) : null,
          objectKey: typeof metadata.objectKey === "string" ? (metadata.objectKey as string) : "",
        };
      },
      signUrl: async () => "https://signed.test/review",
    },
  };
  return { repo, deps };
}

async function seedAsset(repo: MemoryStudioRepository, assetId: string): Promise<void> {
  const at = new Date().toISOString();
  await repo.insert(SCOPE, "studio_assets", {
    id: assetId,
    payload: { asset_kind: "generation", content_hash: "a".repeat(64), metadata: { name: "Shot 1", objectKey: "studio/shot1.png" } },
    createdAt: at, updatedAt: at, deletedAt: null,
  });
}

async function seedConsent(repo: MemoryStudioRepository, consentId: string, lifecycle: string, expiresAt: string | null): Promise<void> {
  const at = new Date().toISOString();
  await repo.insert(SCOPE, "studio_consents", {
    id: consentId,
    payload: { lifecycle, expires_at: expiresAt },
    createdAt: at, updatedAt: at, deletedAt: null,
  });
}

// ── Gate F: review links ──

async function testReviewLive(): Promise<void> {
  const { repo, deps } = reviewHarness();
  await seedAsset(repo, "asset-live");
  await seedConsent(repo, "consent-live", "active", FUTURE);
  const created = await createReviewLink(repo, SCOPE, { assetIds: ["asset-live"], consentIds: ["consent-live"], idempotencyKey: "rev-key-live" });
  const binding = await readStudioReviewLink(created.token, deps);
  assert(binding.outcome === "live", "valid review resolves live");
  if (binding.outcome === "live") {
    assert(binding.resolved.assets.length === 1, "live review carries its assets");
    assert(typeof binding.resolved.assets[0]?.signedUrl === "string", "live review signs asset urls");
  }
}

async function testReviewExpired(): Promise<void> {
  const { repo, deps } = reviewHarness();
  await seedAsset(repo, "asset-exp");
  const created = await createReviewLink(repo, SCOPE, { assetIds: ["asset-exp"], ttlSeconds: 60, idempotencyKey: "rev-key-expired" });
  const binding = await readStudioReviewLink(created.token, deps, Date.now() + 3600_000);
  assert(binding.outcome === "blocked", "expired review link blocks");
  if (binding.outcome === "blocked") assert(binding.block.code === "REVIEW_EXPIRED", "expired link reports REVIEW_EXPIRED");
}

async function testReviewRevoked(): Promise<void> {
  const { repo, deps } = reviewHarness();
  await seedAsset(repo, "asset-rev");
  const created = await createReviewLink(repo, SCOPE, { assetIds: ["asset-rev"], idempotencyKey: "rev-key-revoked" });
  await revokeReviewLink(repo, SCOPE, created.id);
  const binding = await readStudioReviewLink(created.token, deps);
  assert(binding.outcome === "blocked", "revoked review link blocks");
  if (binding.outcome === "blocked") assert(binding.block.code === "REVIEW_REVOKED", "revoked link reports REVIEW_REVOKED");
}

async function testReviewConsentRevoked(): Promise<void> {
  const { repo, deps } = reviewHarness();
  await seedAsset(repo, "asset-cr");
  await seedConsent(repo, "consent-doomed", "active", FUTURE);
  const created = await createReviewLink(repo, SCOPE, { assetIds: ["asset-cr"], consentIds: ["consent-doomed"], idempotencyKey: "rev-key-consent-rev" });
  // The consent service revoked the recorded consent after link creation:
  // the loader now returns the canonical revoked row (no memory-repo
  // consent mutator exists; the resolver and gate run for real over it).
  const revokedDeps: StudioReviewBindingDeps = {
    ...deps,
    review: {
      ...deps.review,
      loadConsent: async (projectId: string, consentId: string) => {
        if (consentId === "consent-doomed") return { lifecycle: "revoked", expiresAt: FUTURE };
        return deps.review?.loadConsent?.(projectId, consentId) ?? null;
      },
    },
  };
  const binding = await readStudioReviewLink(created.token, revokedDeps);
  assert(binding.outcome === "blocked", "revoked consent blocks resolution");
  if (binding.outcome === "blocked") assert(binding.block.code === "CONSENT_REVOKED", "revoked consent reports CONSENT_REVOKED");
}

async function testReviewConsentExpired(): Promise<void> {
  const { repo, deps } = reviewHarness();
  await seedAsset(repo, "asset-ce");
  await seedConsent(repo, "consent-aging", "active", FUTURE);
  const created = await createReviewLink(repo, SCOPE, { assetIds: ["asset-ce"], consentIds: ["consent-aging"], idempotencyKey: "rev-key-consent-exp" });
  // Time-travel past the consent expiry (the link itself lives 7 days).
  const binding = await readStudioReviewLink(created.token, deps, Date.now() + 7200_000);
  assert(binding.outcome === "blocked", "expired consent blocks resolution");
  if (binding.outcome === "blocked") assert(binding.block.code === "CONSENT_EXPIRED", "expired consent reports CONSENT_EXPIRED");
}

async function testReviewUnknownToken(): Promise<void> {
  const { deps } = reviewHarness();
  const binding = await readStudioReviewLink("f".repeat(64), deps);
  assert(binding.outcome === "blocked", "unknown review token blocks");
}

// ── Gate F: approval cards ──

async function testApprovalActionable(): Promise<void> {
  const deps = approvalDeps();
  const requested = await requestApproval(deps);
  await deps.service.approve({ projectId: SCOPE.projectId, actorId: SCOPE.actorId }, requested.id, "review_complete");
  const binding = await readStudioApprovalCard(SCOPE.projectId, SCOPE.actorId, requested.id, { approvals: deps.service });
  assert(binding.outcome === "card", "approved record maps to a card");
  if (binding.outcome === "card") {
    assert(binding.status === "approved" && binding.actionable === true, "live approval is actionable");
    assert(binding.consumed === false, "unclaimed approval is not consumed");
    assert(typeof binding.payload.title === "string" && binding.payload.title.length > 0, "card carries a derived title");
  }
}

async function testApprovalDenied(): Promise<void> {
  const deps = approvalDeps();
  const requested = await requestApproval(deps);
  await deps.service.reject({ projectId: SCOPE.projectId, actorId: SCOPE.actorId }, requested.id, "unsafe");
  const binding = await readStudioApprovalCard(SCOPE.projectId, SCOPE.actorId, requested.id, { approvals: deps.service });
  assert(binding.outcome === "card", "denied record still maps to a truthful card");
  if (binding.outcome === "card") {
    assert(binding.status === "rejected" && binding.actionable === false, "denied approval is non-actionable");
  }
}

async function testApprovalExpired(): Promise<void> {
  const deps = approvalDeps();
  const requested = await requestApproval(deps);
  await deps.service.approve({ projectId: SCOPE.projectId, actorId: SCOPE.actorId }, requested.id, "review_complete");
  // Lapsed expiry renders expired even though the stored lifecycle lags at approved.
  const binding = await readStudioApprovalCard(SCOPE.projectId, SCOPE.actorId, requested.id, { approvals: deps.service }, Date.now() + 7200_000);
  assert(binding.outcome === "card", "lapsed record still maps to a truthful card");
  if (binding.outcome === "card") {
    assert(binding.status === "expired" && binding.actionable === false, "lapsed approval renders expired, non-actionable");
  }
}

async function testApprovalConsumed(): Promise<void> {
  const deps = approvalDeps();
  const requested = await requestApproval(deps);
  await consumeApproval(deps, requested.id);
  const binding = await readStudioApprovalCard(SCOPE.projectId, SCOPE.actorId, requested.id, { approvals: deps.service });
  assert(binding.outcome === "card", "consumed record maps to an executed card");
  if (binding.outcome === "card") {
    assert(binding.status === "executed" && binding.actionable === false, "consumed approval is executed, non-actionable");
    assert(binding.consumed === true, "consumed flag reflects the one-shot claim");
  }
}

async function testApprovalSampleBlocked(): Promise<void> {
  const deps = approvalDeps();
  // Sample/test evidence exists as seeded records, never via requestApproval.
  const sample: CanonicalApproval = {
    id: "sample-1", organizationId: "org-ethen", projectId: SCOPE.projectId, runId: null,
    requesterId: SCOPE.actorId, approverId: SCOPE.actorId, status: "approved",
    actionHash: createHash("sha256").update("sample").digest("hex"), actionByteLength: 6, hashAlgorithm: "sha256",
    policy: POLICY, policyHash: "p", scope: APPROVAL_SCOPE, scopeHash: "s",
    expiresAt: FUTURE, decisionReasonRedacted: null, decidedAt: null, revokedAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sample: true, executionClaimedAt: null,
  };
  await deps.repository.insertApproval(sample, {
    id: "evt-sample", schemaVersion: 1, approvalId: sample.id, projectId: SCOPE.projectId,
    actorId: SCOPE.actorId, eventType: "requested", actionHash: sample.actionHash,
    policyHash: "p", scopeHash: "s", reasonCode: "approval_requested", metadata: {}, createdAt: new Date().toISOString(),
  });
  const binding = await readStudioApprovalCard(SCOPE.projectId, SCOPE.actorId, sample.id, { approvals: deps.service });
  assert(binding.outcome === "blocked", "sample approval blocks outright");
  if (binding.outcome === "blocked") assert(binding.block.code === "APPROVAL_INVALID", "sample reports APPROVAL_INVALID");
}

async function testApprovalMissingAndCrossProject(): Promise<void> {
  const deps = approvalDeps();
  const missing = await readStudioApprovalCard(SCOPE.projectId, SCOPE.actorId, "nope", { approvals: deps.service });
  assert(missing.outcome === "blocked", "missing approval blocks");
  const requested = await requestApproval(deps, { projectId: OTHER_SCOPE.projectId });
  const crossed = await readStudioApprovalCard(SCOPE.projectId, SCOPE.actorId, requested.id, { approvals: deps.service });
  assert(crossed.outcome === "blocked", "cross-project approval reads block");
}

// ── Gate F: export delivery ──

async function seedExport(
  repo: MemoryStudioRepository,
  exportId: string,
  manifestHash: string | null,
): Promise<void> {
  const at = new Date().toISOString();
  await repo.insert(SCOPE, "studio_exports", {
    id: exportId,
    payload: { lifecycle: "ready", destination: { preset: "original", presetVersion: "v1", manifestHash } },
    createdAt: at, updatedAt: at, deletedAt: null,
  });
}

async function testExportDelivery(): Promise<void> {
  const { repo } = reviewHarness();
  const approvals = approvalDeps();
  const requested = await requestApproval(approvals);
  await consumeApproval(approvals, requested.id);
  const live = await requestApproval(approvals);
  await approvals.service.approve({ projectId: SCOPE.projectId, actorId: SCOPE.actorId }, live.id, "ok");
  const deps: StudioReviewBindingDeps = { repo, approvals: approvals.service };

  await seedExport(repo, "export-pinned", "b".repeat(64));
  const clear = await readStudioExportDelivery(SCOPE, "export-pinned", requested.id, deps);
  assert(clear.outcome === "clear", "pinned export with consumed approval clears delivery");
  if (clear.outcome === "clear") assert(clear.manifestHash === "b".repeat(64), "delivery carries the pinned manifest");

  await seedExport(repo, "export-loose", null);
  const unpinned = await readStudioExportDelivery(SCOPE, "export-loose", requested.id, deps);
  assert(unpinned.outcome === "blocked", "unpinned export blocks delivery");

  const unconsumed = await readStudioExportDelivery(SCOPE, "export-pinned", live.id, deps);
  assert(unconsumed.outcome === "blocked", "unconsumed approval blocks delivery");

  const unbound = await readStudioExportDelivery(SCOPE, "export-pinned", null, deps);
  assert(unbound.outcome === "blocked", "missing approval binding blocks delivery");

  const ghost = await readStudioExportDelivery(SCOPE, "export-ghost", requested.id, deps);
  assert(ghost.outcome === "blocked", "missing export blocks delivery");
}

async function main(): Promise<void> {
  await testJobQueued();
  await testJobRunning();
  await testJobReconciling();
  await testJobCompleted();
  await testJobFailed();
  await testJobDeadLetter();
  await testJobUnknown();
  await testJobCrossProject();
  await testReviewLive();
  await testReviewExpired();
  await testReviewRevoked();
  await testReviewConsentRevoked();
  await testReviewConsentExpired();
  await testReviewUnknownToken();
  await testApprovalActionable();
  await testApprovalDenied();
  await testApprovalExpired();
  await testApprovalConsumed();
  await testApprovalSampleBlocked();
  await testApprovalMissingAndCrossProject();
  await testExportDelivery();
  console.log(`stu-33 job12b live bindings tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
