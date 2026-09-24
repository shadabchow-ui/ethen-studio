/**
 * STUDIO_09 — upload-transform frame.
 *
 * Upload/select asset, validated metadata, source→target settings, and
 * staged history for transcribe now; STUDIO_11 completes the execution
 * slots and reuses this layout for dubbing and batch voice changing.
 */

"use client";

import * as React from "react";
import { StudioPageHeader } from "../shell/PageHeader";
import { StudioEmptyState } from "../shell/states";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { CreateToolDefinition } from "./types";
import { toolUnavailableReason } from "./tool-definitions";
import { CreateHistoryList } from "./CreateResult";
import { useCreateHistory } from "./useCreateHistory";

export function UploadTransformFrame({ tool, projectId }: { tool: CreateToolDefinition; projectId: string | null }) {
  const [sourceAssetId, setSourceAssetId] = React.useState("");
  const [language, setLanguage] = React.useState("auto");
  const [speakers, setSpeakers] = React.useState("auto");
  const history = useCreateHistory(projectId, tool.id);
  const unavailableReason = toolUnavailableReason(tool);

  if (!projectId) {
    return (
      <div className="mx-auto w-full max-w-[1200px] space-y-4 px-4 py-6">
        <StudioPageHeader eyebrow="CREATE" title={tool.title} description={tool.description} routeMarker={tool.route} />
        <StudioEmptyState
          title="Select a project to start"
          description="Transcriptions belong to a project. Pick one to unlock source selection and history."
          actionLabel="Open projects"
          actionHref="/studio/projects"
          testId="create-no-project"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-4 px-4 py-6">
      <StudioPageHeader eyebrow="CREATE" title={tool.title} description={tool.description} routeMarker={tool.route} />

      {unavailableReason ? (
        <div role="status" data-testid="create-slot-unavailable" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">Not available yet</p>
          <p className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">{unavailableReason}</p>
        </div>
      ) : null}

      <section aria-label="Source audio" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
        <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Source</h2>
        <label className="mt-2 block space-y-1 text-[12.5px] text-[var(--text-secondary)]">
          Project audio asset id
          <input
            aria-label="Source audio asset id"
            value={sourceAssetId}
            onChange={(event) => setSourceAssetId(event.target.value)}
            placeholder="asset_…"
            className="w-full rounded-[10px] bg-[var(--bg-surface)] px-3 py-2.5 text-[13.5px] text-[var(--text-primary)]"
          />
        </label>
        <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">
          Only project assets are accepted — uploads are scanned before they become sources.
        </p>

        <h2 className="mt-4 text-[13px] font-medium text-[var(--text-primary)]">Target settings</h2>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="space-y-1 text-[12.5px] text-[var(--text-secondary)]">
            Language
            <select
              aria-label="Transcript language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="w-full rounded-[10px] bg-[var(--bg-surface)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
            >
              <option value="auto">Auto-detect</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="ja">Japanese</option>
            </select>
          </label>
          <label className="space-y-1 text-[12.5px] text-[var(--text-secondary)]">
            Speakers
            <select
              aria-label="Speaker count"
              value={speakers}
              onChange={(event) => setSpeakers(event.target.value)}
              className="w-full rounded-[10px] bg-[var(--bg-surface)] px-3 py-2 text-[13px] text-[var(--text-primary)]"
            >
              <option value="auto">Auto-detect</option>
              <option value="1">1 speaker</option>
              <option value="2">2 speakers</option>
              <option value="3">3 speakers</option>
              <option value="4+">4+ speakers</option>
            </select>
          </label>
        </div>

        <div className="mt-3">
          <button
            type="button"
            disabled
            aria-label={tool.actionLabel}
            title={unavailableReason ?? "Select a source asset first."}
            className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--accent)] px-6 py-2.5 text-[13.5px] font-medium text-[var(--accent-fg)] disabled:cursor-not-allowed disabled:opacity-50 ${STUDIO_FOCUS_RING_CLASS}`}
          >
            {tool.actionLabel}
          </button>
        </div>
      </section>

      <section aria-label="History" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-[var(--text-primary)]">History</h2>
          <button
            type="button"
            onClick={history.refresh}
            className={`rounded-[8px] px-2 py-1 text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
          >
            Refresh
          </button>
        </div>
        <CreateHistoryList entries={history.entries} />
      </section>
    </div>
  );
}
