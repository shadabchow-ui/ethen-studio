/**
 * M5 D3 — `/api/media` → V1 cutover map (apps/studio authority).
 *
 * Every route file deleted from `apps/studio/app/api/media/` has exactly
 * one entry. `mapped` entries name the V1 successor that serves the same
 * capability; `retired` entries name no successor because the capability
 * has none (evaluation/repair evidence, legacy snapshot import, decision
 * locks, scene/shot write routes, the already-disabled direct-t2v stub).
 * Retired entries keep a note so the cutover stays auditable; nothing
 * here deletes history (see git history of the deleted tree).
 */

export type MediaCutoverDisposition = "mapped" | "retired";

export interface MediaCutoverEntry {
  /** Deleted legacy file, repo-relative. */
  legacyFile: string;
  /** Legacy URL pattern served. */
  legacy: string;
  disposition: MediaCutoverDisposition;
  /** V1 successor URL pattern (mapped only). */
  successor?: string;
  note: string;
}

function mapped(legacyFile: string, legacy: string, successor: string, note: string): MediaCutoverEntry {
  return { legacyFile, legacy, disposition: "mapped", successor, note };
}

function retired(legacyFile: string, legacy: string, note: string): MediaCutoverEntry {
  return { legacyFile, legacy, disposition: "retired", note };
}

const M = "apps/studio/app/api/media";

export const STUDIO_MEDIA_CUTOVER: readonly MediaCutoverEntry[] = [
  mapped(`${M}/approvals/route.ts`, "/api/media/approvals", "/api/studio/v1/collaboration/reviews", "review approvals; V1 collaboration owns new integrations"),
  mapped(`${M}/approvals/[id]/route.ts`, "/api/media/approvals/[id]", "/api/studio/v1/collaboration/reviews/[reviewId]/decide", "approval decisions move to the review decide route"),
  mapped(`${M}/assets/route.ts`, "/api/media/assets", "/api/studio/v1/assets", "asset reads; V1 assets owns new integrations"),
  mapped(`${M}/assets/[assetId]/route.ts`, "/api/media/assets/[assetId]", "/api/studio/v1/assets/[id]", "asset item reads"),
  mapped(`${M}/campaigns/route.ts`, "/api/media/campaigns", "/api/studio/v1/composites/campaigns", "campaign collection; V1 composites owns new integrations"),
  mapped(`${M}/campaigns/[id]/route.ts`, "/api/media/campaigns/[id]", "/api/studio/v1/composites/campaigns/[campaignId]", "campaign item"),
  mapped(`${M}/canvas/route.ts`, "/api/media/canvas", "/api/studio/v1/workflows/graphs", "canvas graphs are workflow graphs; Canvas index is /studio/workflows"),
  mapped(`${M}/canvas/[canvasId]/route.ts`, "/api/media/canvas/[canvasId]", "/api/studio/v1/workflows/graphs/[graphId]", "canvas item reads"),
  retired(`${M}/cinema/scenes/[id]/continuity/route.ts`, "/api/media/cinema/scenes/[id]/continuity", "continuity evaluation has no V1 successor; /studio/cinema drops Evaluate (j20 retires the board)"),
  retired(`${M}/cinema/scenes/route.ts`, "/api/media/cinema/scenes", "scene writes have no V1 route; reads served by the sequence detail route"),
  mapped(`${M}/cinema/sequences/route.ts`, "/api/media/cinema/sequences", "/api/studio/v1/workbench/cinema/sequences", "editorial sequences; rational fps replaces the scalar"),
  mapped(`${M}/cinema/sequences/[id]/route.ts`, "/api/media/cinema/sequences/[id]", "/api/studio/v1/workbench/cinema/sequences/[sequenceId]", "flat scenes+shots; take bindings replace measured durations"),
  retired(`${M}/cinema/shots/route.ts`, "/api/media/cinema/shots", "shot writes have no V1 route; reads served by the sequence detail route"),
  retired(`${M}/cinema/shots/[id]/route.ts`, "/api/media/cinema/shots/[id]", "shot writes have no V1 route; reads served by the sequence detail route"),
  mapped(`${M}/director/plans/route.ts`, "/api/media/director/plans", "/api/studio/v1/agent/runs", "director plans are agent runs; /studio/director redirects to /studio/agent"),
  mapped(`${M}/director/plans/[id]/route.ts`, "/api/media/director/plans/[id]", "/api/studio/v1/agent/runs/[runId]", "plan item reads"),
  mapped(`${M}/director/plans/[id]/advance/route.ts`, "/api/media/director/plans/[id]/advance", "/api/studio/v1/agent/runs/[runId]/advance", "plan advance"),
  mapped(`${M}/director/plans/[id]/locks/route.ts`, "/api/media/director/plans/[id]/locks", "/api/studio/v1/agent/runs/[runId]/approvals", "plan locks are run approvals"),
  mapped(`${M}/director/plans/[id]/tasks/[key]/route.ts`, "/api/media/director/plans/[id]/tasks/[key]", "/api/studio/v1/agent/runs/[runId]/plans", "plan tasks"),
  mapped(`${M}/entities/[kind]/route.ts`, "/api/media/entities/[kind]", "/api/studio/v1/identities", "creative entities are identities (characters/products/brands)"),
  mapped(`${M}/entities/[kind]/[id]/route.ts`, "/api/media/entities/[kind]/[id]", "/api/studio/v1/identities", "entity item reads via the identities collection"),
  retired(`${M}/evaluations/route.ts`, "/api/media/evaluations", "evaluation evidence has no V1 successor"),
  mapped(`${M}/exports/route.ts`, "/api/media/exports", "/api/studio/v1/media/exports", "export records; the exports console rides V1"),
  mapped(`${M}/exports/[id]/route.ts`, "/api/media/exports/[id]", "/api/studio/v1/media/exports/[exportId]", "export item reads"),
  mapped(`${M}/generate/route.ts`, "/api/media/generate", "/api/studio/v1/gateway/compat/generate", "direct generation via the gateway compat adapter"),
  retired(`${M}/graph/route.ts`, "/api/media/graph", "composite project-graph read retired; clients read V1 domains directly"),
  retired(`${M}/graph/documents/route.ts`, "/api/media/graph/documents", "revisioned documents have no V1 successor"),
  retired(`${M}/graph/documents/[id]/route.ts`, "/api/media/graph/documents/[id]", "revisioned documents have no V1 successor"),
  retired(`${M}/graph/import/route.ts`, "/api/media/graph/import", "one-shot legacy snapshot import; replay window closed"),
  retired(`${M}/graph/locks/route.ts`, "/api/media/graph/locks", "decision locks have no V1 successor"),
  mapped(`${M}/graph/projects/route.ts`, "/api/media/graph/projects", "/api/studio/v1/projects", "canonical project list"),
  mapped(`${M}/health/route.ts`, "/api/media/health", "/api/studio/v1/health", "same liveness contract, no secrets"),
  mapped(`${M}/image/commands/route.ts`, "/api/media/image/commands", "/api/studio/v1/gateway/compat/generate", "create-image command via the gateway compat adapter"),
  mapped(`${M}/image/jobs/[id]/route.ts`, "/api/media/image/jobs/[id]", "/api/studio/v1/jobs/[jobId]", "image job reads"),
  mapped(`${M}/image/jobs/[id]/events/route.ts`, "/api/media/image/jobs/[id]/events", "/api/studio/v1/jobs/[jobId]", "job events via the job item route"),
  mapped(`${M}/jobs/route.ts`, "/api/media/jobs", "/api/studio/v1/jobs", "job reads; V1 jobs owns new integrations"),
  mapped(`${M}/jobs/[id]/route.ts`, "/api/media/jobs/[id]", "/api/studio/v1/jobs/[jobId]", "job item reads"),
  retired(`${M}/jobs/reconcile/route.ts`, "/api/media/jobs/reconcile", "fal reconciliation sweep is worker-owned; no V1 route"),
  mapped(`${M}/models/detail/route.ts`, "/api/media/models/detail", "/api/studio/v1/catalog/[endpointId]", "per-endpoint detail"),
  mapped(`${M}/models/health/route.ts`, "/api/media/models/health", "/api/studio/v1/health/providers", "provider health only; expert rankings retired"),
  mapped(`${M}/models/search/route.ts`, "/api/media/models/search", "/api/studio/v1/catalog", "paginated catalog projection"),
  mapped(`${M}/projects/route.ts`, "/api/media/projects", "/api/studio/v1/projects", "project reads; V1 projects owns new integrations"),
  mapped(`${M}/projects/[projectId]/route.ts`, "/api/media/projects/[projectId]", "/api/studio/v1/projects", "project item reads via the projects collection"),
  mapped(`${M}/provider-status/route.ts`, "/api/media/provider-status", "/api/studio/v1/health/providers", "provider health; catalog owns qualification"),
  retired(`${M}/repairs/commands/route.ts`, "/api/media/repairs/commands", "bounded repair commands have no V1 successor"),
  mapped(`${M}/reviews/route.ts`, "/api/media/reviews", "/api/studio/v1/collaboration/reviews", "review collection"),
  mapped(`${M}/reviews/[token]/route.ts`, "/api/media/reviews/[token]", "/api/studio/v1/collaboration/public/reviews/[token]", "public token resolve stays token-governed; legacy path 307-redirects (see next.config)"),
  mapped(`${M}/reviews/decisions/route.ts`, "/api/media/reviews/decisions", "/api/studio/v1/collaboration/reviews/[reviewId]/decide", "review decisions"),
  retired(`${M}/shell/job-presentation/route.ts`, "/api/media/shell/job-presentation", "JobPanel slot projection retired with the legacy shell binding"),
  mapped(`${M}/upload/route.ts`, "/api/media/upload", "/api/studio/v1/media/ingest", "media upload is V1 ingest"),
  mapped(`${M}/video/commands/route.ts`, "/api/media/video/commands", "/api/studio/v1/gateway/compat/generate", "video command via the gateway compat adapter"),
  mapped(`${M}/video/exports/route.ts`, "/api/media/video/exports", "/api/studio/v1/media/downloads", "signed-URL delivery moves to protected downloads"),
  mapped(`${M}/video/inbox/route.ts`, "/api/media/video/inbox", "/api/studio/v1/gateway/webhooks", "provider callbacks are gateway webhook deliveries"),
  mapped(`${M}/video/jobs/[id]/route.ts`, "/api/media/video/jobs/[id]", "/api/studio/v1/jobs/[jobId]", "video job reads"),
  mapped(`${M}/video/jobs/[id]/events/route.ts`, "/api/media/video/jobs/[id]/events", "/api/studio/v1/jobs/[jobId]", "job events via the job item route"),
  retired(`${M}/video/route.ts`, "/api/media/video", "direct text-to-video was already a disabled stub; never a capability"),
  mapped(`${M}/workflows/route.ts`, "/api/media/workflows", "/api/studio/v1/workflows/graphs", "workflow definitions are versioned graphs"),
  mapped(`${M}/workflows/[id]/route.ts`, "/api/media/workflows/[id]", "/api/studio/v1/workflows/graphs/[graphId]", "definition reads"),
  mapped(`${M}/workflows/[id]/runs/route.ts`, "/api/media/workflows/[id]/runs", "/api/studio/v1/workflows/runs", "bounded runs move to the V1 runs collection"),
] as const;

export const STUDIO_MEDIA_CUTOVER_COUNT = STUDIO_MEDIA_CUTOVER.length;

export function findMediaCutoverEntry(legacyFile: string): MediaCutoverEntry | null {
  return (STUDIO_MEDIA_CUTOVER as readonly MediaCutoverEntry[]).find((entry) => entry.legacyFile === legacyFile) ?? null;
}
