import "server-only";

import { headers } from "next/headers";

/** Isolated, deterministic identity for the loopback Studio inspection lane. */
export const STUDIO_LOCAL_USER_ID = "0d5d0000-0000-4000-8000-000000000001";
export const STUDIO_LOCAL_TENANT_ID = "0d5d0000-0000-4000-8000-000000000002";
export const STUDIO_LOCAL_PROJECT_ID = "0d5d0000-0000-4000-8000-000000000003";
export const STUDIO_LOCAL_WORKSPACE_ID = "default";

type LocalProject = { id: string; name: string; createdAt: string };
type LocalProjectsState = { projects: Map<string, LocalProject>; keys: Map<string, string> };
const stateKey = "__ethenStudioLocalProjects";

function localState(): LocalProjectsState {
  const state = globalThis as typeof globalThis & { [stateKey]?: LocalProjectsState };
  if (!state[stateKey]) {
    state[stateKey] = { projects: new Map([[STUDIO_LOCAL_PROJECT_ID, {
      id: STUDIO_LOCAL_PROJECT_ID, name: "Local Studio Project", createdAt: "2026-01-01T00:00:00.000Z",
    }]]), keys: new Map() };
  }
  return state[stateKey];
}

export function listStudioLocalProjects(): LocalProject[] {
  return [...localState().projects.values()];
}

export function hasStudioLocalProject(projectId: string): boolean {
  return localState().projects.has(projectId);
}

export function createStudioLocalProject(key: string, name: string): { project: LocalProject; replayed: boolean } {
  const state = localState();
  const existingId = state.keys.get(key);
  if (existingId) return { project: state.projects.get(existingId)!, replayed: true };
  const project = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
  state.projects.set(project.id, project);
  state.keys.set(key, project.id);
  return { project, replayed: false };
}

export function isStudioLocalBypass(input: {
  host: string | null;
  env?: Readonly<Record<string, string | undefined>>;
}): boolean {
  const env = input.env ?? process.env;
  if (env.NODE_ENV !== "development" || env.ETHEN_STUDIO_LOCAL_AUTH_BYPASS !== "true") return false;
  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") return false;
  const host = input.host?.toLowerCase().trim() ?? "";
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
}

/** Request-scoped check; never trust a caller-provided actor or query flag. */
export async function isStudioLocalRequest(): Promise<boolean> {
  try {
    const requestHeaders = await headers();
    return isStudioLocalBypass({ host: requestHeaders.get("host") });
  } catch {
    return false;
  }
}
