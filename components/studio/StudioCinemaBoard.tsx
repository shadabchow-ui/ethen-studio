"use client";

import { useActiveProjectState } from "./studio-project-scope";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StudioPageFrame } from "./StudioPageFrame";
import { StudioStatusPill } from "./StudioStatusPill";
import {
  WorkbenchApiError,
  createSequence,
  fetchSequenceDetail,
  fetchSequences,
} from "./v5/workbench/workbench-api-client";

interface ProjectOption {
  id: string;
  name: string;
}

interface SequenceSummary {
  id: string;
  title: string;
  status: string;
  fps: number;
}

interface TimelineShot {
  shotId: string;
  title: string;
  takeId: string | null;
}

interface TimelineScene {
  sceneId: string;
  title: string;
  shots: TimelineShot[];
}

interface SequenceDetail {
  sequenceId: string;
  title: string;
  fps: number;
  scenes: TimelineScene[];
}

/**
 * Studio V2 Job 09 — cinema board, drained to V1 (M5 D3).
 * Sequences, scenes, and shots organize canonical takes by reference.
 * The V1 editorial layer carries no measured take durations, so the
 * board shows take bindings (selected/unselected) instead of timeline
 * totals. Continuity evaluation has no V1 successor; j20 retires this
 * board in favor of /studio/pro/cinema.
 */
export function StudioCinemaBoard() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useActiveProjectState();
  const [sequences, setSequences] = useState<SequenceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SequenceDetail | null>(null);
  const [title, setTitle] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/studio/v1/projects")
      .then((response) => response.json())
      .then((body: { ok?: boolean; data?: { items?: ProjectOption[] } }) => {
        if (cancelled) return;
        if (body?.ok && Array.isArray(body?.data?.items)) {
          setProjects(
            (body.data.items ?? []).map((item) => ({ id: item.id, name: item.name })),
          );
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSequences = useCallback((pid: string) => {
    void fetchSequences(pid)
      .then((rows) => {
        setSequences(
          rows.map((row) => ({
            id: row.sequenceId,
            title: row.title,
            status: row.status,
            fps: row.fpsDen === 0 ? row.fpsNum : row.fpsNum / row.fpsDen,
          })),
        );
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (projectId) refreshSequences(projectId);
  }, [projectId, refreshSequences]);

  const refreshDetail = useCallback(async (pid: string, sequenceId: string) => {
    try {
      const body = await fetchSequenceDetail(pid, sequenceId);
      const shotsByScene = new Map<string, TimelineShot[]>();
      for (const shot of body.shots) {
        const list = shotsByScene.get(shot.sceneId) ?? [];
        list.push({ shotId: shot.shotId, title: shot.title, takeId: shot.selectedTakeId });
        shotsByScene.set(shot.sceneId, list);
      }
      setDetail({
        sequenceId: body.sequence.sequenceId,
        title: body.sequence.title,
        fps: body.sequence.fpsDen === 0 ? body.sequence.fpsNum : body.sequence.fpsNum / body.sequence.fpsDen,
        scenes: body.scenes.map((scene) => ({
          sceneId: scene.sceneId,
          title: scene.title,
          shots: shotsByScene.get(scene.sceneId) ?? [],
        })),
      });
    } catch {
      setDetail(null);
    }
  }, []);

  const createSequenceCallback = useCallback(async () => {
    if (!projectId || !title.trim()) return;
    setFeedback(null);
    try {
      await createSequence({ projectId, title: title.trim(), fps: { num: 30, den: 1 } });
    } catch (error) {
      setFeedback(error instanceof WorkbenchApiError ? error.message : "Sequence creation failed.");
      return;
    }
    setTitle("");
    refreshSequences(projectId);
  }, [projectId, title, refreshSequences]);

  const sceneCount = detail?.scenes.length ?? 0;
  const shotCount = detail?.scenes.reduce((total, scene) => total + scene.shots.length, 0) ?? 0;

  return (
    <StudioPageFrame
      eyebrow="CINEMA"
      
      routeMarker="/studio/cinema"
      title="Cinema"
      description="Sequences, scenes, and shots over canonical takes. Selection pins takes; durations are unmeasured on the V1 reference layer."
      actions={
        <Link href="/studio/assets" className="inline-flex rounded-[9px] bg-[var(--bg-surface)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]">
          Open Assets
        </Link>
      }
      statusPills={
        <>
          <StudioStatusPill label="Reference layer" tone="live" />
          {detail ? <StudioStatusPill label={`${sceneCount} scenes · ${shotCount} shots`} tone="neutral" /> : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="cinema-project" className="text-[11.5px] text-[var(--text-secondary)]">Project</label>
        <select id="cinema-project" value={projectId ?? ""} onChange={(event) => { setProjectId(event.target.value || null); setSelectedId(null); setDetail(null); }} className="rounded-[7px] bg-[var(--bg-surface)] px-3 py-1.5 text-[11.5px]">
          <option value="">Select a project…</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New sequence title" className="rounded-[7px] bg-[var(--bg-surface)] px-3 py-1.5 text-[11.5px] outline-none" />
        <button type="button" onClick={createSequenceCallback} disabled={!projectId || !title.trim()} className="rounded-[7px] bg-[var(--accent)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--accent-fg)] disabled:opacity-50">
          Create
        </button>
      </div>

      {!projectId ? (
        <div className="rounded-[20px] bg-[var(--bg-surface)] px-6 py-14 text-center text-[13px] text-[var(--text-secondary)]">
          Select a project. Cinema organizes canonical takes; it stores no bytes.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
          <div className="space-y-2">
            {sequences.map((sequence) => (
              <button key={sequence.id} type="button" onClick={() => { setSelectedId(sequence.id); if (projectId) void refreshDetail(projectId, sequence.id); }} className={`w-full rounded-[12px] px-4 py-3 text-left ${selectedId === sequence.id ? "bg-[var(--bg-elevated)] ring-1 ring-[var(--border-default)]" : "bg-[var(--bg-surface)]"}`}>
                <p className="text-[13.5px] text-[var(--text-primary)]">{sequence.title}</p>
                <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">{sequence.status} · {sequence.fps}fps</p>
              </button>
            ))}
            {sequences.length === 0 ? <p className="text-[12px] text-[var(--text-tertiary)]">No sequences yet.</p> : null}
          </div>
          <div>
            {!detail ? (
              <div className="rounded-[18px] bg-[var(--bg-surface)] px-6 py-14 text-center text-[13px] text-[var(--text-secondary)]">
                Select a sequence to see its scenes, shots, and take bindings.
              </div>
            ) : (
              <div className="space-y-4 rounded-[18px] bg-[var(--bg-surface)] px-5 py-5">
                <h2 className="text-[16px] text-[var(--text-primary)]">{detail.title}</h2>
                {detail.scenes.map((scene) => (
                  <div key={scene.sceneId} className="rounded-[12px] bg-[var(--bg-inset)] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="mr-auto text-[13px] text-[var(--text-primary)]">{scene.title}</p>
                      <span className="text-[11px] text-[var(--text-tertiary)]">{scene.shots.length} shots</span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {scene.shots.map((shot) => (
                        <li key={shot.shotId} className="flex justify-between gap-2 text-[12px] text-[var(--text-secondary)]">
                          <span>{shot.title}</span>
                          <span>{shot.takeId ? "take selected" : "no take selected"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {feedback ? <p className="text-[12px] text-[var(--text-secondary)]">{feedback}</p> : null}
              </div>
            )}
          </div>
        </div>
      )}
    </StudioPageFrame>
  );
}
