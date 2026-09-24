"use client";

/**
 * STUDIO_10 — voice selector (My / Stock / Favorites / Recent).
 *
 * A separate identity control from the model picker: it selects a
 * VoiceIdentity reference, shows compatibility as explanation, and
 * offers Design/Clone as explicit flows — never as model choices.
 * Voice and model stay independently selectable.
 */
import { useState } from "react";
import { StudioEmptyState, StudioErrorState } from "../shell/states";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { StudioDataState } from "../shell/types";
import { consentBadgeFor } from "./identity-api-client";
import { IDENTITY_LIBRARY_TABS, IDENTITY_TAB_LABELS, type CompatibleModelView, type IdentityLibraryTab, type IdentityListItem } from "./types";
import { VoicePreview } from "./VoicePreview";

export interface VoiceSelectorProps {
  projectId: string | null;
  state: StudioDataState;
  tab: IdentityLibraryTab;
  onTabChange: (tab: IdentityLibraryTab) => void;
  search: string;
  onSearchChange: (value: string) => void;
  voices: IdentityListItem[];
  missingFavoriteIds: readonly string[];
  selection: string | null;
  onSelect: (identityId: string) => void;
  onToggleFavorite: (identityId: string, favorite: boolean) => void;
  onOpenVersions: (identity: IdentityListItem) => void;
  onDesign: () => void;
  onClone: () => void;
  /** Compatibility explanation for the current selection (voice-independent model state). */
  compatible: readonly CompatibleModelView[];
  compatibleState: StudioDataState | "idle";
  onRetry: () => void;
  /** Compact slot rendering for create-tool embedding. */
  compact?: boolean;
}

function OriginBadge({ origin, stock }: { origin: string; stock: boolean }): React.JSX.Element {
  const label = stock ? "Stock" : origin === "designed" ? "Designed" : origin === "cloned" ? "Cloned" : "Imported";
  return (
    <span className="inline-flex items-center rounded-[6px] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
      {label}
    </span>
  );
}

export function VoiceSelector(props: VoiceSelectorProps): React.JSX.Element {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const selected = props.voices.find((voice) => voice.identityId === props.selection) ?? null;

  return (
    <section aria-label="Voice" className="space-y-3">
      <div className={props.compact ? "" : "flex flex-wrap items-center justify-between gap-2"}>
        {/* Compact (inspector) mode: the host section already titles the slot. */}
        <h2 className={props.compact ? "sr-only" : "text-[13px] font-semibold text-[var(--text-primary)]"}>Voice</h2>
        <div className={props.compact ? "grid grid-cols-2 gap-1.5" : "flex gap-1.5"}>
          <button
            type="button"
            onClick={props.onDesign}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-elevated)] ${props.compact ? "pointer-fine:min-h-[34px]" : ""} ${STUDIO_FOCUS_RING_CLASS}`}
          >
            Design voice
          </button>
          <button
            type="button"
            onClick={props.onClone}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-elevated)] ${props.compact ? "pointer-fine:min-h-[34px]" : ""} ${STUDIO_FOCUS_RING_CLASS}`}
          >
            Clone voice
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Voice libraries"
        className={props.compact ? "grid grid-cols-4 gap-0.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-[3px]" : "flex flex-wrap gap-1.5"}
      >
        {IDENTITY_LIBRARY_TABS.map((tab) => {
          const active = tab === props.tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => props.onTabChange(tab)}
              className={`inline-flex min-h-[44px] items-center font-medium transition ${props.compact ? "justify-center rounded-[8px] px-1 text-[12px] pointer-fine:min-h-[30px]" : "rounded-[10px] px-3.5 py-2 text-[12.5px]"} ${STUDIO_FOCUS_RING_CLASS} ${
                active
                  ? `bg-[var(--bg-elevated)] text-[var(--text-primary)] ${props.compact ? "shadow-[0_1px_2px_rgb(0_0_0/0.35)]" : ""}`
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
              }`}
            >
              {IDENTITY_TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>

      <label className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3">
        <span className="sr-only">Search voices</span>
        <input
          type="search"
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Search voices"
          aria-label="Search voices"
          className="w-full bg-transparent py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
      </label>

      {props.tab === "favorites" && props.missingFavoriteIds.length > 0 ? (
        <p role="status" className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
          {props.missingFavoriteIds.length} favorite{props.missingFavoriteIds.length === 1 ? " is" : "s are"} no longer
          available in this project and {props.missingFavoriteIds.length === 1 ? "was" : "were"} left out of the list.
        </p>
      ) : null}

      {props.state === "loading" ? (
        <p role="status" className={`rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] text-center text-[13px] text-[var(--text-tertiary)] motion-safe:animate-pulse ${props.compact ? "px-4 py-6" : "px-6 py-12"}`}>
          Loading voices…
        </p>
      ) : null}
      {props.state === "empty" ? (
        <StudioEmptyState
          title="No voices here yet"
          description={
            props.tab === "stock"
              ? "No stock voices are available. Stock voices arrive from provider catalogs, never invented."
              : props.tab === "favorites"
                ? "Star a voice to pin it here; favorites hydrate even when the library page is not loaded."
                : props.tab === "recent"
                  ? "Voices you open will appear here for quick re-selection."
                  : "Design or clone a voice to start your own library."
          }
          actionLabel={props.tab === "my" ? "Design a voice" : undefined}
          onAction={props.tab === "my" ? props.onDesign : undefined}
          testId="voice-empty-state"
          compact={props.compact}
        />
      ) : null}
      {props.state === "permission" ? (
        <StudioErrorState
          title="Voices need project access"
          description="Sign in with a project member account to browse voices."
          testId="voice-permission-state"
          compact={props.compact}
        />
      ) : null}
      {props.state === "setup" && props.projectId ? (
        // V5 M1: with an active project, "setup" means the voice identity
        // service is not configured — never tell the user to pick a project.
        <StudioErrorState
          title="Voice library setup required"
          description="Voice identities need the Studio data service, which is not configured in this environment."
          testId="voice-service-setup-state"
          compact={props.compact}
        />
      ) : null}
      {props.state === "setup" && !props.projectId ? (
        <StudioErrorState
          title="Pick a project first"
          description="Voice libraries are project-scoped. Select a project to continue."
          secondaryLabel="Go to projects"
          secondaryHref="/studio/work/projects"
          testId="voice-setup-state"
          compact={props.compact}
        />
      ) : null}
      {props.state === "error" ? (
        <StudioErrorState
          title="Voices are unavailable"
          description="The voice library could not be loaded. Your voices are not lost — retry to reload."
          retryLabel="Retry"
          onRetry={props.onRetry}
          testId="voice-error-state"
          compact={props.compact}
        />
      ) : null}

      {props.state === "ready" ? (
        <ul aria-label="Voices" className={`grid grid-cols-1 gap-2.5 ${props.compact ? "" : "sm:grid-cols-2"}`}>
          {props.voices.map((voice) => {
            const badge = consentBadgeFor(voice.consent);
            const isSelected = voice.identityId === props.selection;
            const previewing = previewId === voice.identityId;
            // Deterministic decorative waveform (aria-hidden; the voice
            // name, version, and consent text carry the meaning).
            const bars = Array.from(
              { length: 14 },
              (_, index) => 6 + ((voice.identityId.charCodeAt(index % voice.identityId.length) + index * 7) % 18),
            );
            return (
              <li
                key={voice.identityId}
                className={`rounded-[16px] border bg-[var(--bg-surface)] p-3.5 ${isSelected ? "border-[var(--accent)]" : "border-[var(--border-default)]"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => props.onSelect(voice.identityId)}
                    aria-pressed={isSelected}
                    aria-label={`Select voice ${voice.name}`}
                    className={`min-h-[44px] flex-1 rounded-[8px] px-2 py-1 text-left ${STUDIO_FOCUS_RING_CLASS}`}
                  >
                    <span aria-hidden className="mb-1.5 flex h-6 items-end gap-[3px]">
                      {bars.map((height, index) => (
                        <span
                          key={index}
                          style={{ height: `${height}px` }}
                          className="w-[3px] rounded-full bg-[var(--text-tertiary)] opacity-60"
                        />
                      ))}
                    </span>
                    <span className="block text-[13.5px] font-medium text-[var(--text-primary)]">{voice.name}</span>
                    <span className="mt-0.5 block text-[11.5px] text-[var(--text-tertiary)]">
                      Version {voice.currentVersion} · {badge.label}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onToggleFavorite(voice.identityId, !voice.favorite)}
                    aria-pressed={voice.favorite}
                    aria-label={voice.favorite ? `Remove ${voice.name} from favorites` : `Add ${voice.name} to favorites`}
                    className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[8px] text-[12px] font-medium transition ${STUDIO_FOCUS_RING_CLASS} ${
                      voice.favorite ? "text-[var(--accent)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {voice.favorite ? "Saved" : "Save"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 px-2">
                  <OriginBadge origin={voice.origin} stock={voice.stock} />
                  {voice.status === "quarantined" ? (
                    <span className="inline-flex items-center rounded-[6px] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
                      Quarantined
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => props.onOpenVersions(voice)}
                    className={`text-[11.5px] text-[var(--text-secondary)] underline-offset-2 hover:underline ${STUDIO_FOCUS_RING_CLASS}`}
                  >
                    Versions &amp; rights
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewId(previewing ? null : voice.identityId)}
                    aria-expanded={previewing}
                    className={`text-[11.5px] text-[var(--text-secondary)] underline-offset-2 hover:underline ${STUDIO_FOCUS_RING_CLASS}`}
                  >
                    {previewing ? "Hide preview" : "Preview"}
                  </button>
                </div>
                {previewing ? (
                  <div className="mt-2 border-t border-[var(--border-default)] px-2 pt-2">
                    <VoicePreview voiceName={voice.name} audioUrl={null} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {selected ? (
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
          <p className="text-[12px] font-medium text-[var(--text-primary)]">
            Model compatibility for {selected.name}
          </p>
          <p className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">
            Voice and model are chosen separately. This explains which models this voice can use — it never changes
            your model choice.
          </p>
          {props.compatibleState === "loading" ? (
            <p role="status" className="mt-2 text-[12px] text-[var(--text-tertiary)]">Checking compatible models…</p>
          ) : null}
          {props.compatibleState === "ready" ? (
            <ul className="mt-2 space-y-1.5">
              {props.compatible.map((candidate) => (
                <li key={candidate.endpointId} className="text-[12px] text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--text-primary)]">{candidate.label}</span>{" "}
                  <span>{candidate.executable ? "can use this voice." : "cannot use this voice."}</span>
                  <span className="block text-[11.5px] text-[var(--text-tertiary)]">{candidate.reasons.join(" ")}</span>
                </li>
              ))}
              {props.compatible.length === 0 ? (
                <li className="text-[12px] text-[var(--text-tertiary)]">No models serve this task yet.</li>
              ) : null}
            </ul>
          ) : null}
          {props.compatibleState === "error" ? (
            <p role="alert" className="mt-2 text-[12px] text-[var(--text-secondary)]">
              Compatibility could not be checked. Model selection stays unchanged.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
