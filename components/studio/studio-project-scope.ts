/**
 * Studio V3 Job 4 / V5 M1 — recoverable project/job/view identity.
 *
 * V5 M1: the ACTIVE PROJECT is no longer tab-scoped. Its source of truth is
 * the canonical active-project contract (`lib/studio-v5/active-project.ts`):
 * the `ethen_studio_project` cookie resolved server-side, overridden by a
 * URL `projectId`, auto-selected when exactly one project exists, and
 * validated through `/api/studio/v1/projects/active`. This module exposes it
 * to client surfaces through `StudioActiveProjectProvider` +
 * `useStudioIdentity()`.
 *
 * sessionStorage keeps only per-tab UX hints (last open job per project,
 * last workspace view) — never the project.
 */

"use client";

import * as React from "react";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { normalizeProjectId } from "../../lib/studio-v5/active-project";

export const STUDIO_IDENTITY_STORAGE_KEY = "ethen.studio.identity.v1";

export interface StudioRecoverableIdentity {
  projectId: string | null;
  lastJobByProject: Record<string, string>;
  lastViewByProject: Record<string, string>;
  updatedAt: string | null;
}

export const EMPTY_STUDIO_IDENTITY: StudioRecoverableIdentity = {
  projectId: null,
  lastJobByProject: {},
  lastViewByProject: {},
  updatedAt: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.trim()) out[key] = entry;
  }
  return out;
}

/** Parse persisted identity; corrupt input fails closed to empty (never throws). */
export function parseStudioIdentity(raw: string | null | undefined): StudioRecoverableIdentity {
  if (!raw) return { ...EMPTY_STUDIO_IDENTITY };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...EMPTY_STUDIO_IDENTITY };
    const projectId = typeof parsed.projectId === "string" && parsed.projectId.trim() ? parsed.projectId : null;
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
    return { projectId, lastJobByProject: asStringMap(parsed.lastJobByProject), lastViewByProject: asStringMap(parsed.lastViewByProject), updatedAt };
  } catch {
    return { ...EMPTY_STUDIO_IDENTITY };
  }
}

export function serializeStudioIdentity(identity: StudioRecoverableIdentity): string {
  return JSON.stringify({ ...identity, updatedAt: new Date().toISOString() });
}

export function withProjectSelected(identity: StudioRecoverableIdentity, projectId: string): StudioRecoverableIdentity {
  return { ...identity, projectId, updatedAt: new Date().toISOString() };
}

export function withJobOpened(identity: StudioRecoverableIdentity, projectId: string, jobId: string): StudioRecoverableIdentity {
  return { ...identity, lastJobByProject: { ...identity.lastJobByProject, [projectId]: jobId }, updatedAt: new Date().toISOString() };
}

export function withViewOpened(identity: StudioRecoverableIdentity, projectId: string, view: string): StudioRecoverableIdentity {
  return { ...identity, lastViewByProject: { ...identity.lastViewByProject, [projectId]: view }, updatedAt: new Date().toISOString() };
}

export const STUDIO_HANDOFF_KEY = "ethen.studio.handoff.v1";

export interface StudioAnimateHandoff {
  projectId: string;
  assetId: string;
  title: string;
  kind: string;
  at: string;
}

/**
 * Hero-frame → video handoff (Job 6 §8): carries an image result into a
 * compatible video/edit workflow without re-upload. Tab-scoped,
 * project-validated, consumed exactly once.
 */
export function writeAnimateHandoff(handoff: Omit<StudioAnimateHandoff, "at">): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STUDIO_HANDOFF_KEY, JSON.stringify({ ...handoff, at: new Date().toISOString() }));
  } catch {
    // Private mode: the handoff is dropped; the workflow still opens.
  }
}

export function consumeAnimateHandoff(projectId: string): StudioAnimateHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STUDIO_HANDOFF_KEY);
    window.sessionStorage.removeItem(STUDIO_HANDOFF_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const assetId = typeof parsed.assetId === "string" ? parsed.assetId : "";
    if (!assetId || parsed.projectId !== projectId) return null;
    return {
      projectId,
      assetId,
      title: typeof parsed.title === "string" ? parsed.title : "Reference",
      kind: typeof parsed.kind === "string" ? parsed.kind : "image",
      at: typeof parsed.at === "string" ? parsed.at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}


function readStoredHints(): Pick<StudioRecoverableIdentity, "lastJobByProject" | "lastViewByProject"> {
  if (typeof window === "undefined") return { lastJobByProject: {}, lastViewByProject: {} };
  try {
    const parsed = parseStudioIdentity(window.sessionStorage.getItem(STUDIO_IDENTITY_STORAGE_KEY));
    return { lastJobByProject: parsed.lastJobByProject, lastViewByProject: parsed.lastViewByProject };
  } catch {
    return { lastJobByProject: {}, lastViewByProject: {} };
  }
}

function writeStoredHints(identity: StudioRecoverableIdentity): void {
  if (typeof window === "undefined") return;
  try {
    // projectId is deliberately not persisted here (cookie is the authority).
    window.sessionStorage.setItem(STUDIO_IDENTITY_STORAGE_KEY, serializeStudioIdentity({ ...identity, projectId: null }));
  } catch {
    // Private-mode storage failure: hints stay in memory for the session.
  }
}

export type ActiveProjectStatus = "resolving" | "ready" | "none" | "invalid" | "error";

export interface StudioActiveProjectProject {
  projectId: string;
  name: string;
}

interface ActiveProjectContextValue {
  identity: StudioRecoverableIdentity;
  status: ActiveProjectStatus;
  projects: readonly StudioActiveProjectProject[];
  selectProject: (projectId: string) => void;
  clearProject: () => void;
  openJob: (projectId: string, jobId: string) => void;
  openView: (projectId: string, view: string) => void;
}

const noop = () => {};
const ActiveProjectContext = React.createContext<ActiveProjectContextValue>({
  identity: EMPTY_STUDIO_IDENTITY,
  status: "none",
  projects: [],
  selectProject: noop,
  clearProject: noop,
  openJob: noop,
  openView: noop,
});

const ACTIVE_ENDPOINT = "/api/studio/v1/projects/active";

type ActiveResponse = {
  ok?: boolean;
  data?: { projectId?: string | null; rejected?: string[]; projects?: StudioActiveProjectProject[] };
};

/** Reports the URL `projectId` to the provider (isolated for Suspense). */
function UrlProjectReader({ onUrlProject }: { onUrlProject: (projectId: string | null) => void }) {
  const params = useSearchParams();
  const urlProjectId = normalizeProjectId(params?.get("projectId"));
  React.useEffect(() => {
    onUrlProject(urlProjectId);
  }, [urlProjectId, onUrlProject]);
  return null;
}

/**
 * Canonical active-project provider (V5 M1). Seeded from the server-read
 * cookie so first paint is already scoped; reconciles once per URL override
 * against the membership-checked endpoint, and refreshes server components
 * when the resolved project differs from what they rendered with.
 */
export function StudioActiveProjectProvider({
  initialProjectId,
  children,
}: {
  initialProjectId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [projectId, setProjectId] = React.useState<string | null>(initialProjectId);
  const [status, setStatus] = React.useState<ActiveProjectStatus>("resolving");
  const [projects, setProjects] = React.useState<readonly StudioActiveProjectProject[]>([]);
  // Hints never render into markup, so reading them lazily cannot cause a
  // hydration mismatch (the server returns empty maps).
  const [hints, setHints] = React.useState(readStoredHints);
  const renderedWith = React.useRef<string | null>(initialProjectId);
  const lastResolvedUrl = React.useRef<string | null | undefined>(undefined);

  const applyResolved = React.useCallback(
    (next: string | null, nextStatus: ActiveProjectStatus) => {
      setProjectId(next);
      setStatus(nextStatus);
      if (next !== renderedWith.current) {
        renderedWith.current = next;
        router.refresh();
      }
    },
    [router],
  );

  const resolve = React.useCallback(
    async (urlProjectId: string | null) => {
      try {
        const query = urlProjectId ? `?projectId=${encodeURIComponent(urlProjectId)}` : "";
        const response = await fetch(`${ACTIVE_ENDPOINT}${query}`, { cache: "no-store", credentials: "same-origin" });
        const body = (await response.json().catch(() => null)) as ActiveResponse | null;
        if (!response.ok || !body?.ok || !body.data) {
          setStatus("error");
          return;
        }
        setProjects(Array.isArray(body.data.projects) ? body.data.projects : []);
        const next = normalizeProjectId(body.data.projectId);
        const rejectedUrl = Array.isArray(body.data.rejected) && body.data.rejected.includes("url");
        applyResolved(next, rejectedUrl ? "invalid" : next ? "ready" : "none");
      } catch {
        setStatus("error");
      }
    },
    [applyResolved],
  );

  const onUrlProject = React.useCallback(
    (urlProjectId: string | null) => {
      if (lastResolvedUrl.current === urlProjectId) return;
      lastResolvedUrl.current = urlProjectId;
      void resolve(urlProjectId);
    },
    [resolve],
  );

  // Pathname changes without a URL project keep the resolved selection;
  // the reader above re-resolves only when the URL override changes.
  void pathname;

  const selectProject = useCallback(
    (next: string) => {
      const normalized = normalizeProjectId(next);
      if (!normalized) return;
      setProjectId(normalized);
      setStatus("ready");
      void fetch(ACTIVE_ENDPOINT, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ projectId: normalized }),
      })
        .then((response) => {
          void response.body?.cancel();
          if (!response.ok) {
            setStatus("invalid");
            void resolve(null);
            return;
          }
          if (normalized !== renderedWith.current) {
            renderedWith.current = normalized;
            router.refresh();
          }
        })
        .catch(() => setStatus("error"));
    },
    [resolve, router],
  );

  const clearProject = useCallback(() => {
    void fetch(ACTIVE_ENDPOINT, { method: "DELETE", credentials: "same-origin" })
      .then((response) => void response.body?.cancel())
      .catch(() => undefined)
      .finally(() => {
      applyResolved(null, "none");
    });
  }, [applyResolved]);

  const identity = React.useMemo<StudioRecoverableIdentity>(
    () => ({ projectId, lastJobByProject: hints.lastJobByProject, lastViewByProject: hints.lastViewByProject, updatedAt: null }),
    [projectId, hints],
  );

  const openJob = useCallback(
    (forProject: string, jobId: string) => {
      setHints((current) => {
        const next = withJobOpened({ ...identity, ...current }, forProject, jobId);
        writeStoredHints(next);
        return { lastJobByProject: next.lastJobByProject, lastViewByProject: next.lastViewByProject };
      });
    },
    [identity],
  );
  const openView = useCallback(
    (forProject: string, view: string) => {
      setHints((current) => {
        const next = withViewOpened({ ...identity, ...current }, forProject, view);
        writeStoredHints(next);
        return { lastJobByProject: next.lastJobByProject, lastViewByProject: next.lastViewByProject };
      });
    },
    [identity],
  );

  const value = React.useMemo<ActiveProjectContextValue>(
    () => ({ identity, status, projects, selectProject, clearProject, openJob, openView }),
    [identity, status, projects, selectProject, clearProject, openJob, openView],
  );

  return React.createElement(
    ActiveProjectContext.Provider,
    { value },
    React.createElement(React.Suspense, { fallback: null }, React.createElement(UrlProjectReader, { onUrlProject })),
    children,
  );
}

/** Full active-project state (status + visible projects). */
export function useActiveProject() {
  return React.useContext(ActiveProjectContext);
}

/**
 * Workspace identity hook (API preserved for existing consumers): the
 * active project comes from the canonical contract; job/view hints are
 * tab-scoped.
 */
export function useStudioIdentity() {
  const { identity, selectProject, openJob, openView } = React.useContext(ActiveProjectContext);
  return { identity, selectProject, openJob, openView };
}

/**
 * Legacy panel binding (M1): panels that keep their own project `<select>`
 * read and write the canonical active project instead of local state.
 * `fixedProjectId` (project-scoped routes) always wins.
 */
export function useActiveProjectState(fixedProjectId?: string | null): [string | null, (next: string | null) => void] {
  const { identity, selectProject, clearProject } = React.useContext(ActiveProjectContext);
  const [fixedOverride, setFixedOverride] = React.useState<string | null>(fixedProjectId ?? null);
  const setter = useCallback(
    (next: string | null) => {
      if (fixedProjectId) {
        setFixedOverride(next);
        return;
      }
      if (next) selectProject(next);
      else clearProject();
    },
    [fixedProjectId, selectProject, clearProject],
  );
  return [fixedProjectId ? fixedOverride : identity.projectId, setter];
}
