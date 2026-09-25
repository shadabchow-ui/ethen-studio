"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStudioIdentity } from "../../studio-project-scope";
import { useAuthActionGate } from "@/components/studio/auth/studio-auth-action";
import type { StudioDataState, StudioProjectSummary } from "./types";
import { parseProjectsResponse, type ParsedProjects } from "./project-context-model";
import { STUDIO_FOCUS_RING_CLASS } from "./tokens";

async function readJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const body = (await response.json().catch(() => null)) as unknown;
  return body;
}

async function fetchProjects(): Promise<ParsedProjects> {
  return parseProjectsResponse(await readJson("/api/studio/v1/projects"));
}

/**
 * STUDIO_08 — create the authenticated default project on first real
 * creation. The server creates the project only after this authenticated
 * action; never global anonymous storage. Idempotency-keyed.
 */
export async function ensureDefaultProjectClient(name = "Untitled project"): Promise<{ projectId: string } | { error: string }> {
  const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  try {
    const body = (await readJson("/api/studio/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey, name }),
    })) as { ok?: boolean; data?: { project?: { id?: string } }; error?: { message?: string } };
    const id = body?.data?.project?.id ?? (body?.data?.project as { projectId?: string } | undefined)?.projectId;
    if (body?.ok && typeof id === "string" && id) return { projectId: id };
    return { error: body?.error?.message ?? "Project creation failed." };
  } catch {
    return { error: "Project creation failed." };
  }
}

/**
 * STUDIO_08 — workspace/project context bar with New. Owns project
 * selection: switching resets scoped selection (last job/view) and
 * preserves the selection for resume. New with no project creates the
 * authenticated default project, then enters creation.
 */
export function StudioProjectContextBar({ testId }: { testId?: string }) {
  const router = useRouter();
  const { identity, selectProject } = useStudioIdentity();
  const [projects, setProjects] = useState<StudioProjectSummary[]>([]);
  const [state, setState] = useState<StudioDataState>("loading");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const parsed = await fetchProjects();
      setProjects(parsed.projects);
      setState(parsed.state);
      // A completed load supersedes any earlier creation notice.
      setNotice(null);
    } catch {
      setProjects([]);
      setState("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const parsed = await fetchProjects();
        if (cancelled) return;
        setProjects(parsed.projects);
        setState(parsed.state);
        setNotice(null);
      } catch {
        if (cancelled) return;
        setProjects([]);
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Adopt the first project when nothing is selected yet (selection only;
  // the server creates projects solely on authenticated action).
  useEffect(() => {
    if (state === "ready" && !identity.projectId && projects[0]) {
      selectProject(projects[0].id);
    }
  }, [state, identity.projectId, projects, selectProject]);

  const onSelect = useCallback(
    (projectId: string) => {
      selectProject(projectId);
      setNotice(null);
      router.push(`/studio/projects/${encodeURIComponent(projectId)}`);
    },
    [router, selectProject],
  );

  // S4C: anonymous New opens the Clerk modal instead of firing the
  // authenticated project-creation POST.
  const authGate = useAuthActionGate();
  const runNew = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setNotice(null);
    try {
      if (identity.projectId) {
        router.push(`/studio/projects/${encodeURIComponent(identity.projectId)}/create/image`);
        return;
      }
      const result = await ensureDefaultProjectClient();
      if ("projectId" in result) {
        selectProject(result.projectId);
        router.push(`/studio/projects/${encodeURIComponent(result.projectId)}/create/image`);
      } else {
        setNotice(result.error);
      }
    } finally {
      setCreating(false);
    }
  }, [creating, identity.projectId, router, selectProject]);
  const onNew = useCallback(() => {
    // Navigation to an existing project's Create surface is public (the
    // page renders signed-out; Generate itself is pre-gated). Only project
    // CREATION requires the modal.
    if (identity.projectId) {
      router.push(`/studio/projects/${encodeURIComponent(identity.projectId)}/create/image`);
      return;
    }
    authGate.runAuthed(() => void runNew(), "project-new");
  }, [authGate, runNew, identity.projectId, router]);

  const selected = projects.find((project) => project.id === identity.projectId) ?? null;

  return (
    <div
      data-testid={testId ?? "studio-project-context"}
      className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2"
    >
      <label className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          Project
        </span>
        <span className="sr-only">Active project</span>
        {state === "loading" ? (
          <span role="status" className="truncate text-[13px] text-[var(--text-tertiary)]">
            Loading projects…
          </span>
        ) : state === "ready" ? (
          <select
            aria-label="Active project"
            value={identity.projectId ?? ""}
            onChange={(event) => onSelect(event.target.value)}
            className={`min-h-[44px] w-full min-w-0 flex-1 truncate rounded-[10px] bg-transparent px-2 py-1 text-[13px] font-medium text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        ) : state === "empty" ? (
          <span className="truncate text-[13px] text-[var(--text-secondary)]">No projects yet</span>
        ) : state === "permission" ? (
          <span className="truncate text-[13px] text-[var(--text-secondary)]">
            Sign in to see projects.{" "}
            <Link href="/sign-in" className={`underline ${STUDIO_FOCUS_RING_CLASS}`}>
              Sign in
            </Link>
          </span>
        ) : state === "setup" ? (
          <span className="truncate text-[13px] text-[var(--text-secondary)]">Project storage is being set up.</span>
        ) : (
          <span className="truncate text-[13px] text-[var(--text-secondary)]">
            Projects unavailable.{" "}
            <button type="button" onClick={() => void load()} className={`underline ${STUDIO_FOCUS_RING_CLASS}`}>
              Retry
            </button>
          </span>
        )}
      </label>
      <button
        type="button"
        onClick={() => void onNew()}
        disabled={creating}
        aria-label={selected ? `New creation in ${selected.name}` : "New creation (creates your first project)"}
        className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--bg-elevated)] px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--studio-bg-selected)] disabled:opacity-60 ${STUDIO_FOCUS_RING_CLASS}`}
      >
        {creating ? "Creating…" : "New"}
      </button>
      {notice ? (
        <p role="alert" className="w-full text-[12px] text-[var(--text-secondary)]">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
