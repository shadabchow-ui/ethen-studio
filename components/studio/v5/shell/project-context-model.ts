/**
 * STUDIO_08 — project context model (pure, browser-safe).
 *
 * Real continue/recent state: parse the V1 projects/assets API envelopes
 * defensively, resolve the Continue target from recoverable identity, and
 * compute project-switch transitions. Rendering lives in ProjectContext.
 */

import type { StudioContinueTarget, StudioDataState, StudioProjectSummary, StudioRecentAsset } from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dataOf(body: unknown): Record<string, unknown> {
  const envelope = asRecord(body);
  const data = envelope.data !== undefined ? envelope.data : envelope;
  return asRecord(data);
}

function errorCodeOf(body: unknown): string | null {
  const envelope = asRecord(body);
  if (envelope.ok === false) {
    const error = asRecord(envelope.error);
    return typeof error.code === "string" ? error.code : "UNKNOWN";
  }
  return null;
}

function stateForError(code: string | null): StudioDataState {
  if (code === "SETUP_REQUIRED") return "setup";
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return "permission";
  return "error";
}

export interface ParsedProjects {
  state: StudioDataState;
  projects: StudioProjectSummary[];
}

export function parseProjectsResponse(body: unknown): ParsedProjects {
  const code = errorCodeOf(body);
  if (code) return { state: stateForError(code), projects: [] };
  const data = dataOf(body);
  const raw = data.projects ?? data.items;
  if (!Array.isArray(raw)) return { state: "error", projects: [] };
  const projects: StudioProjectSummary[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const id = typeof record.id === "string" ? record.id : record.projectId;
    if (typeof id !== "string" || !id) continue;
    projects.push({
      id,
      name: typeof record.name === "string" && record.name ? record.name : "Untitled project",
      assetCount: typeof record.assetCount === "number" ? record.assetCount : undefined,
    });
  }
  return { state: projects.length === 0 ? "empty" : "ready", projects };
}

export function parseAssetsResponse(body: unknown): { state: StudioDataState; assets: StudioRecentAsset[] } {
  const code = errorCodeOf(body);
  if (code) return { state: stateForError(code), assets: [] };
  const data = dataOf(body);
  // V1 `/api/studio/v1/assets` answers `items` rows keyed by `assetId`
  // (the same rows the Work client parses); older reads used assets/versions.
  const raw = data.assets ?? data.versions ?? data.items;
  if (!Array.isArray(raw)) return { state: "error", assets: [] };
  const assets: StudioRecentAsset[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const id = typeof record.id === "string" ? record.id : typeof record.assetId === "string" ? record.assetId : null;
    if (!id) continue;
    assets.push({
      id,
      title:
        typeof record.title === "string" && record.title
          ? record.title
          : typeof record.filename === "string" && record.filename
            ? record.filename
            : "Untitled",
      kind: typeof record.kind === "string" ? record.kind : typeof record.asset_kind === "string" ? record.asset_kind : "asset",
      thumbnailUrl: typeof record.thumbnailUrl === "string" ? record.thumbnailUrl : undefined,
    });
  }
  return { state: assets.length === 0 ? "empty" : "ready", assets };
}

export interface StudioRecoverableIdentityInput {
  projectId: string | null;
  lastJobByProject: Record<string, string>;
  lastViewByProject: Record<string, string>;
}

/**
 * Resolve the Continue target. Returns null when there is nothing to
 * continue — the Home Continue section is omitted when empty.
 */
export function resolveContinueTarget(
  identity: StudioRecoverableIdentityInput,
  projects: readonly StudioProjectSummary[],
): StudioContinueTarget | null {
  if (!identity.projectId) return null;
  const project = projects.find((candidate) => candidate.id === identity.projectId);
  if (!project) return null;
  const lastView = identity.lastViewByProject[project.id];
  const lastJob = identity.lastJobByProject[project.id] ?? null;
  if (!lastView && !lastJob) return null;
  const viewPath = lastView && lastView.startsWith("/") ? lastView : lastJob ? "/review" : "/assets";
  return {
    projectId: project.id,
    projectName: project.name,
    href: `/studio/projects/${encodeURIComponent(project.id)}${viewPath}`,
    jobLabel: lastJob ? lastJob.slice(0, 8) : null,
  };
}

export interface ProjectSwitchTransition {
  nextProjectId: string;
  /** Scoped selections reset on switch; unsaved edits prompt in the consumer. */
  resetSelections: boolean;
  href: string;
}

export function projectSwitchTransition(nextProjectId: string): ProjectSwitchTransition {
  return {
    nextProjectId,
    resetSelections: true,
    href: `/studio/projects/${encodeURIComponent(nextProjectId)}`,
  };
}
