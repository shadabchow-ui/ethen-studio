/**
 * STUDIO_14 — Cinema board: sequence/scene/shot/take browser over the V5
 * editorial tables. Shows the renamed take binding: editorial take id plus
 * the canonical generation job id. Reference layer; stores no bytes.
 */
"use client";

import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { CinemaSceneView, CinemaSequenceView, CinemaShotView } from "./types";

export function CinemaBoard({
  sequences,
  selectedSequenceId,
  scenes,
  shots,
  onSelectSequence,
  onCreateSequence,
  newTitle,
  onNewTitle,
  busy,
  notice,
}: {
  sequences: CinemaSequenceView[];
  selectedSequenceId: string | null;
  scenes: CinemaSceneView[];
  shots: CinemaShotView[];
  onSelectSequence: (sequenceId: string) => void;
  onCreateSequence: () => void;
  newTitle: string;
  onNewTitle: (title: string) => void;
  busy: boolean;
  notice: string | null;
}) {
  const selected = sequences.find((s) => s.sequenceId === selectedSequenceId) ?? null;
  return (
    <div data-testid="cinema-board" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="flex flex-col gap-2 rounded-[16px] bg-[var(--bg-surface)] p-4">
        <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">Sequences</h2>
        <div className="flex gap-1.5">
          <input
            value={newTitle}
            onChange={(event) => onNewTitle(event.target.value)}
            placeholder="New sequence title"
            aria-label="New sequence title"
            data-testid="cinema-new-title"
            className={`min-h-[44px] min-w-0 flex-1 rounded-[8px] bg-[var(--bg-inset)] px-3 py-1.5 text-[12px] outline-none ${STUDIO_FOCUS_RING_CLASS}`}
          />
          <button
            type="button"
            data-testid="cinema-create"
            disabled={busy || !newTitle.trim()}
            onClick={onCreateSequence}
            className={`inline-flex min-h-[44px] items-center rounded-[8px] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-fg)] disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
          >
            Create
          </button>
        </div>
        {sequences.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-[var(--text-tertiary)]">No sequences yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sequences.map((sequence) => {
              const active = sequence.sequenceId === selectedSequenceId;
              return (
                <li key={sequence.sequenceId}>
                  <button
                    type="button"
                    data-testid={`cinema-sequence-${sequence.sequenceId}`}
                    aria-pressed={active}
                    onClick={() => onSelectSequence(sequence.sequenceId)}
                    className={`min-h-[44px] w-full rounded-[12px] px-4 py-3 text-left ${STUDIO_FOCUS_RING_CLASS} ${active ? "bg-[var(--bg-elevated)] ring-1 ring-[var(--border-default)]" : "bg-[var(--bg-inset)]"}`}
                  >
                    <span className="block text-[13px] text-[var(--text-primary)]">{sequence.title}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--text-tertiary)]">
                      {sequence.status} · {sequence.fpsNum}/{sequence.fpsDen}fps
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-3 rounded-[16px] bg-[var(--bg-surface)] p-4">
        {!selected ? (
          <p data-testid="cinema-empty-detail" className="py-10 text-center text-[12.5px] text-[var(--text-secondary)]">
            Select a sequence to see its scenes, shots and selected takes.
          </p>
        ) : (
          <>
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{selected.title}</h2>
            {scenes.length === 0 ? (
              <p className="text-[12px] text-[var(--text-tertiary)]">No scenes yet.</p>
            ) : null}
            {scenes.map((scene) => (
              <div key={scene.sceneId} data-testid={`cinema-scene-${scene.sceneId}`} className="rounded-[12px] bg-[var(--bg-inset)] px-4 py-3">
                <p className="text-[13px] text-[var(--text-primary)]">{scene.title}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {shots
                    .filter((shot) => shot.sceneId === scene.sceneId)
                    .map((shot) => (
                      <li key={shot.shotId} data-testid={`cinema-shot-${shot.shotId}`} className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] text-[var(--text-secondary)]">
                        <span>{shot.title}</span>
                        <span data-testid={`cinema-shot-take-${shot.shotId}`} className="font-mono text-[11px] text-[var(--text-tertiary)]">
                          {shot.selectedTakeId
                            ? `take ${shot.selectedTakeId.slice(0, 8)} · job ${String(shot.selectedTakeJobId ?? "unknown").slice(0, 8)}`
                            : "no take selected"}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </>
        )}
        {notice ? <p data-testid="cinema-notice" className="text-[12px] text-[var(--text-secondary)]">{notice}</p> : null}
      </div>
    </div>
  );
}
