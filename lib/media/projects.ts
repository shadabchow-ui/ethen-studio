import type { MediaProject, MediaProjectKind, MediaProjectStatus, MediaModality } from "./types";
import { STORAGE_STATUS_NON_DURABLE } from "./usage";

export type { MediaProject, MediaProjectKind } from "./types";

let projects: MediaProject[] = [];
let nextId = 1;

function generateId(): string {
  return `mock-project-${nextId++}-${Date.now()}`;
}

export function seedMockProjects(): MediaProject[] {
  const seeded: MediaProject[] = [
    {
      id: generateId(),
      name: "Summer Campaign 2026",
      description: "Brand imagery and social ads for the summer product launch campaign.",
      kind: "campaign",
      status: "active",
      modality: "image",
      assetIds: [],
      jobIds: [],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: generateId(),
      name: "Product Launch: Earbuds V3",
      description: "Product photography, lifestyle shots, and ad creatives for the new earbuds launch.",
      kind: "product_launch",
      status: "active",
      modality: "image",
      assetIds: [],
      jobIds: [],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: generateId(),
      name: "Explainer Video Series",
      description: "Concept art and storyboard for the fantasy RPG project.",
      kind: "video_concept",
      status: "active",
      modality: "video",
      assetIds: [],
      jobIds: [],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: generateId(),
      name: "Narration Voices",
      description: "Voice samples and audio assets for the explainer video series.",
      kind: "brand_kit",
      status: "active",
      modality: "audio",
      assetIds: [],
      jobIds: [],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: generateId(),
      name: "Brand Moodboard",
      description: "Visual direction and mood references for the rebrand.",
      kind: "moodboard",
      status: "active",
      modality: "image",
      assetIds: [],
      jobIds: [],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: generateId(),
      name: "Influencer Profile: Nova",
      description: "AI influencer persona for social campaigns.",
      kind: "ai_influencer_profile",
      status: "active",
      modality: "image",
      assetIds: [],
      jobIds: [],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: generateId(),
      name: "Game Asset Pack: Fantasy RPG",
      description: "Character sprites, environment tiles, and UI elements.",
      kind: "game_asset_pack",
      status: "draft",
      modality: "image",
      assetIds: [],
      jobIds: [],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: generateId(),
      name: "Holiday Ad Creative Set",
      description: "Multi-platform ad creatives for the holiday campaign.",
      kind: "ad_creative_set",
      status: "active",
      modality: "image",
      assetIds: [],
      jobIds: [],
      metadata: { seeded: true, source: "demo" },
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
  projects = seeded;
  return seeded;
}

export function getProjects(): MediaProject[] {
  return [...projects];
}

export function getProjectById(id: string): MediaProject | undefined {
  return projects.find((p) => p.id === id);
}

export function addProject(input: {
  ownerId?: string | null;
  name: string;
  description?: string | null;
  kind?: MediaProjectKind;
  modality?: MediaModality | null;
  status?: MediaProjectStatus;
  metadata?: Record<string, unknown> | null;
}): MediaProject {
  const now = new Date().toISOString();
  const created: MediaProject = {
    id: generateId(),
    ownerId: input.ownerId ?? null,
    name: input.name,
    description: input.description ?? null,
    kind: input.kind ?? "moodboard",
    status: input.status ?? "active",
    modality: input.modality ?? null,
    assetIds: [],
    jobIds: [],
    metadata: input.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  };
  projects.unshift(created);
  return created;
}

export function updateProject(
  id: string,
  changes: Partial<Pick<MediaProject, "name" | "description" | "kind" | "status" | "modality" | "metadata">>,
): MediaProject | undefined {
  const project = projects.find((p) => p.id === id);
  if (!project) return undefined;
  Object.assign(project, changes, { updatedAt: new Date().toISOString() });
  return { ...project };
}

export function deleteProject(id: string): boolean {
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return false;
  projects.splice(index, 1);
  return true;
}

export function addAssetToProject(projectId: string, assetId: string): MediaProject | undefined {
  const project = projects.find((p) => p.id === projectId);
  if (!project) return undefined;
  if (!project.assetIds.includes(assetId)) {
    project.assetIds.push(assetId);
    project.updatedAt = new Date().toISOString();
  }
  return { ...project };
}

export function addJobToProject(projectId: string, jobId: string): MediaProject | undefined {
  const project = projects.find((p) => p.id === projectId);
  if (!project) return undefined;
  if (!project.jobIds.includes(jobId)) {
    project.jobIds.push(jobId);
    project.updatedAt = new Date().toISOString();
  }
  return { ...project };
}

export function clearProjects(): void {
  projects = [];
  nextId = 1;
}

// ─── Durable storage hooks (called by server-side sync layer) ────────────

export function hydrateProjectStore(newProjects: MediaProject[], newNextId: number): void {
  projects = newProjects;
  nextId = newNextId;
}

export function snapshotProjectStore(): MediaProject[] {
  return [...projects];
}

export function snapshotProjectNextId(): number {
  return nextId;
}

// ── Durability & ownership ────────────────────────────────────────────────
//
// This module is imported by client components (e.g. components/workspaces/
// ImageWorkspace.tsx) and re-exported from lib/media/index.ts, so it must stay
// browser-safe. The durable Supabase-backed project functions live in
// ./projects-durable, which is server-only. They were previously here behind a
// dynamic import(), which Turbopack still traced into the client graph and
// which broke `next build` (GW-DEF-002).

/**
 * Media project store durability status.
 * Production uses durable Supabase repository + project tenancy; tests use memory.
 */
export const PROJECT_STORE_DURABILITY = "durable_supabase_proof" as const;
export const PROJECT_STORE_FALLBACK_DURABILITY = STORAGE_STATUS_NON_DURABLE;

/**
 * Ownership check: verifies a project belongs to a given session/user.
 * Currently, projects have no owner_id field — this always returns true
 * as a no-op until ownership persistence is implemented.
 */
export function projectBelongsToSession(
  project: MediaProject,
  sessionId: string | null,
): boolean {
  return Boolean(sessionId && project.ownerId === sessionId);
}
