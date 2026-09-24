/**
 * Studio V5 M2 — preferences request logic (pure, lane-agnostic). The route
 * adapter injects the real guards and the lane store; the M2 suite drives
 * this module directly with fakes (the route itself is not importable in
 * the root harness: `@/` maps to the repo root, not `apps/studio`).
 */
import { cleanPreferenceIds } from "./memory-preferences";

export interface PreferencesActor {
  actorId: string | null;
  /** Set when the session guard already produced a response (passthrough). */
  response: Response | null;
}

export interface PreferencesAuthorizer {
  authorize(projectId: string): Promise<{ response: Response | null }>;
}

export interface PreferencesStore {
  get(projectId: string, userId: string): Promise<{ favorites: string[]; recents: string[] }>;
  put(
    projectId: string,
    userId: string,
    lists: { favorites?: readonly string[]; recents?: readonly string[] },
  ): Promise<{ favorites: string[]; recents: string[] }>;
}

export type PreferencesOutcome =
  | { kind: "passthrough"; response: Response }
  | { kind: "error"; code: "UNAUTHORIZED" | "VALIDATION_ERROR" | "SETUP_REQUIRED" | "INTERNAL_ERROR"; message: string }
  | { kind: "ok"; favorites: string[]; recents: string[] };

function asIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > 256) return null;
  }
  return [...value];
}

async function authorize(
  actor: PreferencesActor,
  projectId: string | null,
  authz: PreferencesAuthorizer,
): Promise<PreferencesOutcome | null> {
  if (actor.response) return { kind: "passthrough", response: actor.response };
  if (!actor.actorId) return { kind: "error", code: "UNAUTHORIZED", message: "Authenticated actor is required." };
  if (!projectId) return { kind: "error", code: "VALIDATION_ERROR", message: "projectId is required." };
  const decision = await authz.authorize(projectId);
  if (decision.response) return { kind: "passthrough", response: decision.response };
  return null;
}

export async function handlePreferencesGet(deps: {
  actor: PreferencesActor;
  projectId: string | null;
  authz: PreferencesAuthorizer;
  /** Opened after authz; null when the lane has no configured store. */
  openStore: () => Promise<PreferencesStore | null>;
}): Promise<PreferencesOutcome> {
  const gate = await authorize(deps.actor, deps.projectId, deps.authz);
  if (gate) return gate;
  const store = await deps.openStore();
  if (!store) return { kind: "error", code: "SETUP_REQUIRED", message: "Preferences store is not configured." };
  try {
    const lists = await store.get(deps.projectId!, deps.actor.actorId!);
    return { kind: "ok", favorites: lists.favorites, recents: lists.recents };
  } catch {
    return { kind: "error", code: "INTERNAL_ERROR", message: "Preferences lookup failed." };
  }
}

export async function handlePreferencesPut(deps: {
  actor: PreferencesActor;
  projectId: string | null;
  body: unknown;
  authz: PreferencesAuthorizer;
  /** Opened after authz; null when the lane has no configured store. */
  openStore: () => Promise<PreferencesStore | null>;
}): Promise<PreferencesOutcome> {
  const gate = await authorize(deps.actor, deps.projectId, deps.authz);
  if (gate) return gate;
  const body = deps.body && typeof deps.body === "object" && !Array.isArray(deps.body)
    ? (deps.body as Record<string, unknown>)
    : null;
  if (!body) return { kind: "error", code: "VALIDATION_ERROR", message: "Expected a JSON object." };
  const favorites = body.favorites === undefined ? undefined : asIdList(body.favorites);
  const recents = body.recents === undefined ? undefined : asIdList(body.recents);
  if (favorites === null || recents === null) {
    return { kind: "error", code: "VALIDATION_ERROR", message: "favorites and recents must be arrays of endpoint id strings." };
  }
  const store = await deps.openStore();
  if (!store) return { kind: "error", code: "SETUP_REQUIRED", message: "Preferences store is not configured." };
  try {
    const lists = await store.put(deps.projectId!, deps.actor.actorId!, {
      favorites: favorites === undefined ? undefined : cleanPreferenceIds(favorites, "favorite"),
      recents: recents === undefined ? undefined : cleanPreferenceIds(recents, "recent"),
    });
    return { kind: "ok", favorites: lists.favorites, recents: lists.recents };
  } catch {
    return { kind: "error", code: "INTERNAL_ERROR", message: "Preferences update failed." };
  }
}
