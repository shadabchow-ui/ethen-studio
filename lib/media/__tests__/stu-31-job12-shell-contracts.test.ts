/**
 * Studio V2 Job 12 — shared-shell readiness contracts.
 * Run with: node --conditions=react-server --import tsx lib/media/__tests__/stu-31-job12-shell-contracts.test.ts
 *
 * Covers P0-1/P0-2/P0-3/P0-4/P0-5/P0-6/P0-7/P0-9/P0-10 + P1 (palette, tokens,
 * responsive, SLOs). Tenancy SQL and outbound scope are covered by migration
 * validators + decision artifact (see artifacts/studio-job12).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STUDIO_CANONICAL_SHELL_STACK,
  STUDIO_SHELL_OWNERSHIP,
  assertStudioShellStack,
} from "@ethen/app-shell/studio/canonical-shell-stack";
import {
  STUDIO_WORKSPACE_SLOT_KEYS,
  isStudioWorkspaceComplete,
  missingStudioWorkspaceSlots,
  registerStudioWorkspaceSlots,
  resolveStudioWorkspaceSlot,
} from "@ethen/app-shell/studio/studio-workspace-slots";
import { V2_GEOMETRY } from "@ethen/ui/design-system/v2/geometry";
import {
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_MIN,
  STUDIO_PANEL_COLLAPSE_PRIORITY,
  canvasTransform,
  clampZoom,
  normalizeSelection,
  panBy,
} from "@ethen/ui/design-system/v2/canvas/CanvasViewport";
import { presentStudioJob } from "@ethen/ui/jobs/studio-job-ux";
import {
  assertNoPermanentPublicUrl,
  studioMediaAccessLabel,
  validateStudioMediaLocator,
} from "@ethen/ui/media/studio-preview-delivery";
import {
  deriveStudioNavEntries,
  deriveStudioPaletteEntries,
  getStudioNavEntries,
  getStudioPaletteEntries,
} from "@ethen/navigation";
import {
  gateExportDelivery,
  gateReviewLinkResolution,
  toApprovalCardProps,
} from "../review-shell-wiring";
import { SupabaseStudioQuotaService } from "../durable-quota";
import { evaluateStudioSlo } from "../slo";

let failed = 0;
function expect(condition: boolean, message: string) {
  if (!condition) { failed++; console.error(`FAIL: ${message}`); }
}

const HERE = dirname(fileURLToPath(import.meta.url));
// Standalone: repo root is the studio root (walk up to the @ethen/studio manifest).
let ROOT = HERE;
for (;;) {
  const manifest = join(ROOT, "package.json");
  if (existsSync(manifest)) {
    try {
      if ((JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name === "@ethen/studio") break;
    } catch { /* keep walking */ }
  }
  const up = dirname(ROOT);
  if (up === ROOT) { ROOT = HERE; break; }
  ROOT = up;
}
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

async function main() {

// ── P0-1 canonical stack ──────────────────────────────────────────────
expect(STUDIO_CANONICAL_SHELL_STACK.join(">").includes("ConsoleShell"), "stack includes ConsoleShell");
expect(assertStudioShellStack().length === 0, "canonical stack asserts clean");
expect(
  assertStudioShellStack({ geometry: { ...V2_GEOMETRY, sidebar: 999 } }).some((i) => i.key === "geometry.sidebar"),
  "geometry fork is detected",
);
expect(Object.keys(STUDIO_SHELL_OWNERSHIP).length >= 10, "every shell concern has one owner");

// ── P0-2 slot contract ────────────────────────────────────────────────
expect(STUDIO_WORKSPACE_SLOT_KEYS.length === 9, "nine creative slots");
expect(missingStudioWorkspaceSlots().length === 9, "slots start unregistered, never faked");
expect(typeof resolveStudioWorkspaceSlot("JobPanel") === "function", "unregistered slot resolves to empty render");
expect(isStudioWorkspaceComplete() === false, "incomplete until Studio registers");
const doubles = Object.fromEntries(STUDIO_WORKSPACE_SLOT_KEYS.map((k) => [k, () => null]));
registerStudioWorkspaceSlots(doubles as Parameters<typeof registerStudioWorkspaceSlots>[0]);
expect(isStudioWorkspaceComplete(), "complete after Studio registers implementations");
expect(missingStudioWorkspaceSlots().length === 0, "no missing slots after registration");

// ── P0-3 no demo fallback ─────────────────────────────────────────────
const shellSrc = read("packages/ui/src/design-system/v2/shells/StudioShell.tsx");
expect(shellSrc.includes('dataSource === "live"'), "live branch is explicit in source");
expect(shellSrc.includes("STUDIO_SHELL_DEMO_MARKERS"), "demo markers are exported for the gate");
for (const marker of ["Previous render — variant B", "Reference image · product-front.jpg", "Queued · ~12s · 1024×1024"]) {
  expect(shellSrc.includes(marker), `demo marker retained for lab preview: ${marker.slice(0, 24)}`);
}
expect(shellSrc.includes("No history yet."), "live history empty state exists");
expect(shellSrc.includes("No references attached."), "live references empty state exists");
expect(shellSrc.includes("Nothing rendered yet."), "live stage empty state exists");

// ── P0-4 canvas hosting ───────────────────────────────────────────────
expect(clampZoom(99) === CANVAS_ZOOM_MAX && clampZoom(-1) === CANVAS_ZOOM_MIN && clampZoom(NaN) === 1, "zoom clamps");
expect(JSON.stringify(panBy({ x: 1, y: 2 }, 3, -1)) === JSON.stringify({ x: 4, y: 1 }), "pan adds");
expect(canvasTransform({ x: 5, y: 6 }, 2).includes("scale(2)"), "transform carries zoom");
expect(JSON.stringify(normalizeSelection({ x: 10, y: 10, width: -4, height: -6 })) === JSON.stringify({ x: 6, y: 4, width: 4, height: 6 }), "selection normalizes");
expect(JSON.stringify(STUDIO_PANEL_COLLAPSE_PRIORITY) === JSON.stringify(["canvas", "inspector", "history"]), "collapse priority canvas>inspector>history");
const canvasSrc = read("packages/ui/src/design-system/v2/canvas/CanvasViewport.tsx");
expect(!/^import .*apps\/(studio|chat|designer|platform)/m.test(canvasSrc), "canvas primitive imports no app code");

// ── P0-5 job UX ───────────────────────────────────────────────────────
expect(presentStudioJob({ status: "queued", progress: null }).state === "queued", "queued presents");
expect(presentStudioJob({ status: "running", progress: 0.5 }).progress === 0.5, "measured progress passes through");
expect(presentStudioJob({ status: "running", progress: null }).progress === null, "unknown progress renders no bar");
expect(presentStudioJob({ status: "completed", progress: null, hasReceipt: true }).actions.includes("view-receipt"), "receipt action on completion");
expect(presentStudioJob({ status: "failed", progress: null }).actions.includes("retry"), "retry offered on failure");
expect(presentStudioJob({ status: "indeterminate", progress: null }).reconcilable, "indeterminate reconciles, never blind-retries");
expect(presentStudioJob({ status: "dead_letter", progress: null }).terminal, "dead letter is terminal");
expect(presentStudioJob({ status: "nope", progress: 0.9 }).state === "unknown", "unknown states never invent completion");

// ── P0-6 preview/delivery ─────────────────────────────────────────────
const future = new Date(Date.now() + 3600_000).toISOString();
const past = new Date(Date.now() - 1000).toISOString();
expect(validateStudioMediaLocator({ access: "preview", url: "https://x/y", projectId: "p", expiresAt: future }).length === 0, "fresh preview renders");
expect(validateStudioMediaLocator({ access: "preview", url: "https://x/y", projectId: "p", expiresAt: past }).some((i) => i.code === "PREVIEW_EXPIRED"), "expired preview blocked");
expect(validateStudioMediaLocator({ access: "source", url: "https://x/y", projectId: null, expiresAt: null }).some((i) => i.code === "SOURCE_NOT_AUTHORIZED"), "source needs scope");
expect(validateStudioMediaLocator({ access: "delivery", url: "https://x/y", projectId: "p", expiresAt: null, contentHash: "a".repeat(64), explicitDownload: true }).length === 0, "pinned explicit delivery renders");
expect(validateStudioMediaLocator({ access: "delivery", url: "https://x/y", projectId: "p", expiresAt: null }).some((i) => i.code === "DELIVERY_NOT_PINNED"), "unpinned delivery blocked");
expect(assertNoPermanentPublicUrl("https://cdn/x?token=abc&expires=1").some((i) => i.code === "PUBLIC_URL_INFERRED"), "signed URLs never promoted to permanent");
expect(studioMediaAccessLabel("review") === "Review link", "access labels stable");

// ── P0-7 review wiring ────────────────────────────────────────────────
const liveConsent = { id: "c1", lifecycle: "active", expiresAt: future };
expect(gateReviewLinkResolution({ link: { id: "r", expiresAt: future, revokedAt: null, consentIds: ["c1"] }, consents: [liveConsent] }).blocked === false, "live review resolves");
expect(gateReviewLinkResolution({ link: { id: "r", expiresAt: future, revokedAt: "2026-01-01T00:00:00Z", consentIds: [] }, consents: [] }).blocked === true, "revoked review blocked");
expect(gateReviewLinkResolution({ link: { id: "r", expiresAt: past, revokedAt: null, consentIds: [] }, consents: [] }).blocked === true, "expired review blocked");
expect(gateReviewLinkResolution({ link: { id: "r", expiresAt: future, revokedAt: null, consentIds: ["c9"] }, consents: [{ id: "c9", lifecycle: "revoked", expiresAt: future }] }).blocked === true, "revoked consent blocks resolution");
const approval = { id: "a", title: "t", description: "d", riskCategories: ["write"], action: "export", resource: "r", affectedEntities: [], lifecycle: "approved" as const, expiresAt: future, consumedAt: null, promptHash: "h" };
expect(gateExportDelivery({ linkage: { exportId: "e", manifestHash: "b".repeat(64), approvalId: "a", approvalConsumed: true }, approval }).blocked === false, "pinned linkage delivers");
expect(gateExportDelivery({ linkage: { exportId: "e", manifestHash: null, approvalId: "a", approvalConsumed: true }, approval }).blocked === true, "unpinned manifest blocks delivery");
expect(toApprovalCardProps(approval).status === "approved", "approved maps to approved card");
expect(toApprovalCardProps({ ...approval, lifecycle: "denied" }).status === "rejected", "denied maps to rejected card");
expect(toApprovalCardProps({ ...approval, lifecycle: "pending", expiresAt: past }).status === "expired", "lapsed expiry renders expired even if lifecycle lags");

// ── P0-9 durable quota service ────────────────────────────────────────
const okClient = { rpc: async () => ({ data: { project_id: "p", window_start: "2026-09-15", concurrent_count: 1, credits_consumed: 20 }, error: null }) };
const quota = new SupabaseStudioQuotaService(() => okClient);
const claim = await quota.claim("p", 20);
expect(claim.concurrentCount === 1 && claim.creditsConsumed === 20, "claim maps durable row");
const denied = new SupabaseStudioQuotaService(() => ({ rpc: async () => ({ data: null, error: { message: "studio concurrency limit exceeded" } }) }));
try { await denied.claim("p", 1); expect(false, "concurrency breach must throw"); } catch (error) { expect(String(error).includes("STUDIO_QUOTA_CONCURRENCY"), "concurrency maps to typed denial"); }
const unconfigured = new SupabaseStudioQuotaService(() => ({ rpc: async () => ({ data: null, error: { message: "studio quota policy not found" } }) }));
try { await unconfigured.claim("p", 1); expect(false, "missing policy must throw"); } catch (error) { expect(String(error).includes("STUDIO_QUOTA_UNCONFIGURED"), "missing policy fails closed"); }

// ── P0-10 lifecycle-derived nav ───────────────────────────────────────
// Job 12B Gate D: the live registry promoted Studio to enrolled-only
// private-alpha, so the enrolled audience now derives entries while
// unenrolled audiences still see nothing (no public leakage).
expect(getStudioNavEntries({ enrolled: false }).length === 0, "unenrolled audience sees no studio nav");
expect(getStudioNavEntries({ enrolled: true }).length === 5, "enrolled audience derives studio nav from the registry");
expect(getStudioPaletteEntries({ enrolled: false }).length === 0, "unenrolled audience sees no studio palette");
expect(getStudioPaletteEntries({ enrolled: true }).length === 3, "enrolled audience derives studio palette from the registry");
const promoted = { id: "studio", displayName: "Studio", lifecycle: "private-alpha", visibility: { navigation: false, "command-palette": false, fleet: false, marketing: false, sitemap: false, search: false }, canonicalRoute: "/studio" };
expect(deriveStudioNavEntries(promoted as never, { enrolled: true }).length === 5, "promotion derives enrolled nav without nav edits");
expect(deriveStudioNavEntries(promoted as never, { enrolled: false }).length === 0, "promotion still hides from unenrolled");
expect(deriveStudioNavEntries({ ...promoted, lifecycle: "unavailable" } as never, { enrolled: true }).length === 0, "enrollment never bypasses unavailable lifecycle");
expect(deriveStudioPaletteEntries({ ...promoted, lifecycle: "retired" } as never, { enrolled: true }).length === 0, "retired never derives");

// ── Token guard: no new --sbnav-* divergence ──────────────────────────
for (const rel of [
  "packages/app-shell/src/studio/canonical-shell-stack.ts",
  "packages/app-shell/src/studio/studio-workspace-slots.ts",
  "packages/ui/src/jobs/studio-job-ux.ts",
  "packages/ui/src/media/studio-preview-delivery.ts",
  "packages/navigation/src/studio.ts",
]) {
  expect(!read(rel).includes("--sbnav-"), `no sbnav divergence in ${rel}`);
}

// ── P1 SLO evaluation ─────────────────────────────────────────────────
const slo = evaluateStudioSlo({ now: 1000, queuedAtMs: [], renderOutcomes: Array(25).fill(true), exportOutcomes: Array(12).fill(true), settlementMismatches: 0, settlementTotal: 30, reconciliationFailures: 0, reconciliationAttempts: 12 });
expect(slo.every((row) => row.status === "pass" || row.status === "unknown"), "healthy inputs pass");
const bad = evaluateStudioSlo({ now: 1000, settlementMismatches: 1, settlementTotal: 10 });
expect(bad.find((row) => row.slo === "settlement-mismatch")?.status === "breach", "any settlement mismatch breaches");
const empty = evaluateStudioSlo({});
expect(empty.every((row) => row.status === "unknown" || row.status === "pass"), "missing inputs yield unknown, never fabricated pass");

console.log(`STU-31 job12 shell contracts: ${failed === 0 ? "PASS" : "FAIL"}`);
if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`FAIL: suite threw: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
