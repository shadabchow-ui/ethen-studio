/**
 * STUDIO_11 — V5 transcript editor.
 *
 * Readable segments with timestamps and speaker labels; each segment's
 * text edits in place and saving appends a revision that invalidates
 * downstream stages. Recovered interaction patterns from the legacy
 * TranscriptEditor (segment list, per-segment edit, explicit save);
 * the legacy component stays read-only and untouched.
 */

"use client";

import * as React from "react";
import { STUDIO_FOCUS_RING_CLASS } from "../../shell/tokens";
import type { AudioTranscriptSegmentView } from "./types";

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.max(0, ms % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function TranscriptEditor({
  language,
  revision,
  segments,
  saving,
  saveError,
  onSave,
}: {
  language: string;
  revision: number;
  segments: readonly AudioTranscriptSegmentView[];
  saving: boolean;
  saveError: string | null;
  onSave: (texts: readonly string[]) => void;
}) {
  // Parents key by revision, so drafts initialize once per revision.
  const [drafts, setDrafts] = React.useState<readonly string[]>(() => segments.map((segment) => segment.text));
  const [editing, setEditing] = React.useState(false);

  const dirty = editing && drafts.some((draft, index) => draft !== segments[index]?.text);

  return (
    <section aria-label="Transcript" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium text-[var(--text-primary)]">
          Transcript <span className="font-normal text-[var(--text-tertiary)]">· {language} · revision {revision}</span>
        </h2>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`rounded-[8px] border border-[var(--border-default)] px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
          >
            Edit transcript
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDrafts(segments.map((segment) => segment.text));
                setEditing(false);
              }}
              className={`rounded-[8px] px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => onSave(drafts)}
              className={`rounded-[8px] bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent-fg)] disabled:cursor-not-allowed disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
            >
              {saving ? "Saving…" : "Save revision"}
            </button>
          </div>
        )}
      </div>
      <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">
        Saving appends a revision; downstream stages rerun from the new text. Settled cost is never rewritten.
      </p>
      {saveError ? (
        <p role="alert" className="mt-2 text-[12.5px] text-[var(--danger, #c03535)]">
          {saveError}
        </p>
      ) : null}
      <ol className="mt-3 space-y-2">
        {segments.map((segment, index) => (
          <li
            key={segment.index}
            className="rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-[var(--text-tertiary)]">
              <span className="font-medium text-[var(--text-secondary)]">{segment.speakerId}</span>
              <span aria-label={`Segment ${index + 1} timing`}>
                {formatTimestamp(segment.startMs)} → {formatTimestamp(segment.endMs)}
              </span>
              {segment.confidence !== null ? <span>confidence {segment.confidence.toFixed(2)}</span> : null}
            </div>
            {editing ? (
              <label className="mt-1 block">
                <span className="sr-only">Segment {index + 1} text</span>
                <textarea
                  value={drafts[index] ?? ""}
                  onChange={(event) =>
                    setDrafts((prev) => prev.map((draft, at) => (at === index ? event.target.value : draft)))
                  }
                  rows={2}
                  className="mt-1 w-full rounded-[8px] bg-[var(--bg-elevated)] px-2 py-1.5 text-[13px] text-[var(--text-primary)]"
                />
              </label>
            ) : (
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-primary)]">{segment.text}</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
