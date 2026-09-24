/**
 * STUDIO_11 — speaker→voice map editor.
 *
 * One voice slot per transcript speaker, reusing the 10
 * CreateVoiceSlotBinding (identity references only, never provider
 * blobs). Every speaker must map before synthesis stages can run.
 */

"use client";

import * as React from "react";
import { CreateVoiceSlotBinding } from "../../identity/CreateVoiceSlotBinding";
import type { CreateVoiceSlotState } from "../types";
import type { AudioSpeakerView } from "./types";

export function SpeakerMapEditor({
  projectId,
  speakers,
  value,
  onChange,
}: {
  projectId: string | null;
  speakers: readonly AudioSpeakerView[];
  value: Readonly<Record<string, string>>;
  onChange: (next: Readonly<Record<string, string>>) => void;
}) {
  const unmapped = speakers.filter((speaker) => !value[speaker.speakerId]);
  return (
    <section aria-label="Speaker voices" className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
      <h2 className="text-[13px] font-medium text-[var(--text-primary)]">Speaker voices</h2>
      <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">
        Each transcript speaker needs one voice identity. Consent is checked at every stage dispatch.
      </p>
      {unmapped.length > 0 ? (
        <p role="status" data-testid="speaker-map-unmapped" className="mt-2 text-[12.5px] text-[var(--text-secondary)]">
          Unmapped speakers: {unmapped.map((speaker) => speaker.speakerId).join(", ")}
        </p>
      ) : (
        <p role="status" data-testid="speaker-map-complete" className="mt-2 text-[12.5px] text-[var(--text-secondary)]">
          All {speakers.length} speaker{speakers.length === 1 ? "" : "s"} mapped.
        </p>
      )}
      <div className="mt-3 space-y-4">
        {speakers.map((speaker) => {
          const slot: CreateVoiceSlotState = {
            voiceIdentityId: value[speaker.speakerId] ?? speaker.voiceIdentityId,
            bound: true,
          };
          return (
            <div key={speaker.speakerId} className="rounded-[12px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
              <h3 className="text-[12.5px] font-medium text-[var(--text-primary)]">
                {speaker.speakerId}
                {speaker.label ? <span className="font-normal text-[var(--text-tertiary)]"> · {speaker.label}</span> : null}
              </h3>
              <div className="mt-2">
                <CreateVoiceSlotBinding
                  projectId={projectId}
                  value={slot}
                  onChange={(next) => {
                    if (!next.voiceIdentityId) return;
                    onChange({ ...value, [speaker.speakerId]: next.voiceIdentityId });
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
