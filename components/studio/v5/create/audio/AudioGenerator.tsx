/**
 * Studio V5 — audio slots for the restored generator grammar.
 *
 * Audio tools do not borrow image controls: the stage is the transcript,
 * speaker map, stages or playback; the composer is the primary input
 * (script or source) plus the estimate and the one primary action; tool
 * settings (voice, languages, model) live in the Run settings inspector
 * supplied by each frame.
 */

"use client";

import * as React from "react";
import { GeneratorComposer } from "../GeneratorComposer";

/**
 * The audio stage, in the same grammar as the visual stage: a centred title
 * and lead over the working material (transcript, speaker map, stages,
 * result). The primary input itself lives in the bottom composer, so with
 * nothing to show yet the stage is just the centred state, as on Image.
 */
export function AudioStagePanel({ title, lead, children }: { title: string; lead: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8 lg:py-12">
      <div className="w-full max-w-[430px] text-center">
        <svg aria-hidden="true" viewBox="0 0 120 32" className="mx-auto mb-5 h-8 w-[120px] text-[var(--text-tertiary)]" fill="currentColor">
          {Array.from({ length: 30 }, (_, index) => {
            const height = 4 + Math.round(Math.abs(Math.sin(index * 1.7)) * 22);
            return <rect key={index} x={index * 4} y={(32 - height) / 2} width="2" height={height} rx="1" />;
          })}
        </svg>
        {/* Visual title; the page h1 (with the route identity marker) lives in GeneratorLayout. */}
        <p aria-hidden="true" className="text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[34px]">{title}</p>
        <p className="mt-3 text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">{lead}</p>
      </div>
      {React.Children.toArray(children).length > 0 ? <div className="mt-8 w-full max-w-[760px] space-y-4">{children}</div> : null}
    </div>
  );
}

/**
 * Legacy audio composer adapter (STUDIO_M3A): the historical AudioComposer
 * props over the one GeneratorComposer. Frames render GeneratorComposer
 * directly; this adapter preserves the old behavior for existing
 * consumers. The audio estimate/action/error assembly stays in the
 * children, exactly as before.
 *
 * @deprecated Render GeneratorComposer with a composer-registry entry.
 */
export function AudioComposer({
  label,
  locked = false,
  openSettings,
  input,
  children,
}: {
  label: string;
  locked?: boolean;
  openSettings?: (() => void) | null;
  /** The tool's primary input: the script for Voice, the source asset for transforms. */
  input?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <GeneratorComposer label={label} locked={locked} openSettings={openSettings} input={input}>
      {children}
    </GeneratorComposer>
  );
}
