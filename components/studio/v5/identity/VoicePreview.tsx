"use client";

/**
 * STUDIO_10 — voice preview with an explicit stop control.
 *
 * No autoplay, ever. When no preview audio exists the control is
 * disabled with the reason — never a dead button. Playback stops on
 * unmount and the stop control returns the preview to the start.
 */
import { useEffect, useRef, useState } from "react";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";

export function VoicePreview({
  voiceName,
  audioUrl,
  unavailableReason,
}: {
  voiceName: string;
  /** Preview audio URL, or null when no preview exists for this voice. */
  audioUrl: string | null;
  unavailableReason?: string;
}): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  if (!audioUrl) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled
          aria-disabled
          title={unavailableReason ?? "No preview audio is available for this voice yet."}
          className="inline-flex min-h-[44px] cursor-not-allowed items-center rounded-[10px] border border-[var(--border-default)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-tertiary)] opacity-70"
        >
          Preview voice
        </button>
        <p className="text-[11.5px] text-[var(--text-tertiary)]">
          {unavailableReason ?? "No preview audio is available for this voice yet."}
        </p>
      </div>
    );
  }

  const stop = (): void => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setPlaying(false);
  };

  const toggle = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      stop();
      return;
    }
    void audio.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  };

  return (
    <div className="flex items-center gap-2">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="none"
        aria-label={`Preview audio for ${voiceName}`}
        onEnded={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? `Stop previewing ${voiceName}` : `Preview ${voiceName}`}
        className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-elevated)] ${STUDIO_FOCUS_RING_CLASS}`}
      >
        {playing ? "Stop preview" : "Preview voice"}
      </button>
      <p aria-live="polite" className="text-[11.5px] text-[var(--text-tertiary)]">
        {playing ? "Playing preview…" : "Preview is explicit; nothing plays automatically."}
      </p>
    </div>
  );
}
