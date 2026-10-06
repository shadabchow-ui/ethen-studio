/**
 * STUDIO_14 — Cinema route adapter.
 * Binds /studio/pro/cinema to the V1 Cinema routes: sequences plus
 * scene/shot detail with the renamed take binding.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useStudioAccess } from "@/components/studio/auth/use-studio-access";
import { StudioEmptyState, StudioErrorState, StudioPageHeader, StudioSetupState } from "../shell";
import { studioProTitleForTool } from "../shell/navigation-model";
import { CinemaBoard } from "./CinemaBoard";
import type { CinemaSceneView, CinemaSequenceView, CinemaShotView } from "./types";
import { WorkbenchApiError, createSequence, fetchSequenceDetail, fetchSequences } from "./workbench-api-client";

function messageOf(failure: unknown): string {
  return failure instanceof WorkbenchApiError ? failure.message : "Request failed.";
}

export function CinemaRouteAdapter({ projectId }: { projectId: string | null }) {
  const [sequences, setSequences] = useState<CinemaSequenceView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<CinemaSceneView[]>([]);
  const [shots, setShots] = useState<CinemaShotView[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [setupDependency, setSetupDependency] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // RC4: no-project renders the gate's reason + action (never a dead
  // Retry); Retry survives only on real fetch errors, and re-fetches.
  const access = useStudioAccess({ requiresProject: true, projectId, actionLabel: "cinema-open" });

  // Render-time readiness when no project scopes the workspace.
  if (!projectId && !loaded) setLoaded(true);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetchSequences(projectId)
      .then((rows) => {
        if (cancelled) return;
        setSequences(rows);
        setLoaded(true);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        if (failure instanceof WorkbenchApiError && failure.code === "SETUP_REQUIRED") {
          setSetupDependency(failure.dependency);
        } else {
          setFailed(messageOf(failure));
        }
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken]);

  const selectSequence = useCallback(
    async (sequenceId: string) => {
      if (!projectId) return;
      setSelectedId(sequenceId);
      setNotice(null);
      try {
        const detail = await fetchSequenceDetail(projectId, sequenceId);
        setScenes(detail.scenes);
        setShots(detail.shots);
      } catch (failure) {
        setNotice(messageOf(failure));
      }
    },
    [projectId],
  );

  const onCreate = useCallback(async () => {
    if (!projectId || !title.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const created = await createSequence({ projectId, title: title.trim(), fps: { num: 24, den: 1 } });
      setSequences((rows) => [created.sequence, ...rows]);
      setTitle("");
      await selectSequence(created.sequence.sequenceId);
    } catch (failure) {
      setNotice(messageOf(failure));
    } finally {
      setBusy(false);
    }
  }, [projectId, title, selectSequence]);

  return (
    <div data-testid="cinema-workspace" className="flex flex-col gap-4">
      <StudioPageHeader
        eyebrow="CINEMA"
        title={studioProTitleForTool("cinema") ?? "Cinema"}
        description="Sequences, scenes and shots over canonical takes. Selection pins takes; the board stores no bytes."
      />
      {!projectId ? (
        <StudioEmptyState
          title={access.title}
          description={access.reason ?? "Cinema is project-scoped. Pick a project to browse sequences."}
          actionLabel={access.primaryAction?.label}
          onAction={access.primaryAction?.run}
        />
      ) : !loaded ? (
        <p data-testid="cinema-loading" className="py-10 text-center text-[13px] text-[var(--text-secondary)]">Loading Cinema…</p>
      ) : setupDependency !== null ? (
        <div data-testid="cinema-setup">
          <StudioSetupState
            what="Cinema sequences"
            dependency={setupDependency}
            primaryLabel="Go to Assets"
            primaryHref={projectId ? `/studio/work/assets?projectId=${encodeURIComponent(projectId)}` : "/studio/work/assets"}
          />
        </div>
      ) : failed ? (
        <div data-testid="cinema-error">
          <StudioErrorState
            title="Cinema unavailable"
            description={failed}
            retryLabel="Retry"
            onRetry={() => {
              setFailed(null);
              setLoaded(false);
              setReloadToken((token) => token + 1);
            }}
          />
        </div>
      ) : (
        <CinemaBoard
          sequences={sequences}
          selectedSequenceId={selectedId}
          scenes={scenes}
          shots={shots}
          onSelectSequence={(id) => void selectSequence(id)}
          onCreateSequence={() => void onCreate()}
          newTitle={title}
          onNewTitle={setTitle}
          busy={busy}
          notice={notice}
        />
      )}
    </div>
  );
}
