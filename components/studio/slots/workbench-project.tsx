"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSlotJson, isUnauthorizedStatus } from "./slot-primitives";
import { useStudioIdentity } from "../studio-project-scope";

/**
 * Studio V2 Job 13 — workbench project scope.
 *
 * Resolves the canonical project identity for slot composition: the
 * project list from the canonical graph, an explicit selection (defaulting
 * to the first project), and the project's canonical `organizationId`
 * (via `/api/media/projects?id=`). Ephemeral UI selection; canonical
 * project/tenant authority stays server-side.
 */

export interface WorkbenchProject {
  id: string;
  name: string;
}

export type WorkbenchProjectState =
  | { state: "loading"; projects: WorkbenchProject[]; projectId: string | null; organizationId: string | null }
  | { state: "ready"; projects: WorkbenchProject[]; projectId: string; organizationId: string }
  | { state: "empty"; projects: WorkbenchProject[]; projectId: null; organizationId: null }
  | { state: "error"; message: string; projects: WorkbenchProject[]; projectId: null; organizationId: null }
  | { state: "unauthorized"; message: string; projects: WorkbenchProject[]; projectId: null; organizationId: null };

export function useWorkbenchProject() {
  // V5 M1: default to the canonical active project when it is listed.
  const { identity } = useStudioIdentity();
  const activeProjectId = identity.projectId;
  const [projects, setProjects] = useState<WorkbenchProject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [listState, setListState] = useState<"loading" | "ready" | "empty" | "error" | "unauthorized">("loading");
  const [message, setMessage] = useState("");
  const [scopeLoading, setScopeLoading] = useState(false);

  useEffect(() => {
    void fetchSlotJson("/api/media/graph/projects")
      .then(({ status, body }) => {
        if (isUnauthorizedStatus(status)) {
          setListState("unauthorized");
          setMessage("Project listing requires a signed-in session.");
          return;
        }
        const record = body as { ok?: boolean; data?: { projects?: Array<{ id: string; name: string }> } } | null;
        const list = Array.isArray(record?.data?.projects) ? record.data.projects : [];
        if (!record?.ok) {
          setListState("error");
          setMessage("Project listing is unavailable.");
          return;
        }
        setProjects(list.map((project) => ({ id: project.id, name: project.name })));
        if (list.length === 0) {
          setListState("empty");
          return;
        }
        setListState("ready");
        setSelectedId((current) => current ?? (list.some((project) => project.id === activeProjectId) ? activeProjectId : list[0]!.id));
      })
      .catch(() => {
        setListState("error");
        setMessage("Network error reading projects.");
      });
  }, [activeProjectId]);

  useEffect(() => {
    if (!selectedId) {
      setOrganizationId(null);
      return;
    }
    setScopeLoading(true);
    void fetchSlotJson(`/api/media/projects?id=${encodeURIComponent(selectedId)}`)
      .then(({ body }) => {
        const record = body as { ok?: boolean; project?: { organizationId?: string } } | null;
        setOrganizationId(
          record?.ok && typeof record.project?.organizationId === "string" ? record.project.organizationId : null,
        );
        setScopeLoading(false);
      })
      .catch(() => {
        setOrganizationId(null);
        setScopeLoading(false);
      });
  }, [selectedId]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setOrganizationId(null);
  }, []);

  const combined: WorkbenchProjectState =
    listState === "loading" || (listState === "ready" && (scopeLoading || !selectedId || !organizationId))
      ? { state: "loading", projects, projectId: null, organizationId: null }
      : listState === "unauthorized"
        ? { state: "unauthorized", message, projects, projectId: null, organizationId: null }
        : listState === "error"
          ? { state: "error", message, projects, projectId: null, organizationId: null }
          : listState === "empty" || !selectedId || !organizationId
            ? { state: "empty", projects, projectId: null, organizationId: null }
            : { state: "ready", projects, projectId: selectedId, organizationId };

  return { ...combined, select };
}

export function WorkbenchProjectPicker({
  projects,
  projectId,
  onSelect,
  id,
}: {
  projects: WorkbenchProject[];
  projectId: string | null;
  onSelect: (id: string | null) => void;
  id: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-[11.5px] text-[var(--text-secondary)]">
        Project
      </label>
      <select
        id={id}
        value={projectId ?? ""}
        onChange={(event) => onSelect(event.target.value || null)}
        className="rounded-[7px] bg-[var(--bg-surface)] px-3 py-1.5 text-[11.5px] text-[var(--text-primary)]"
      >
        <option value="">Select a project…</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </div>
  );
}
