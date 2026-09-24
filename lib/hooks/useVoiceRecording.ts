"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type VoiceState = "idle" | "recording" | "transcribing";

export interface VoiceRecordingHandle {
  voiceState: VoiceState;
  toggleRecording: () => void;
  discardRecording: () => void;
}

/**
 * Shared voice recording hook — used by EthenComposerV3 and other composer
 * surfaces that need push-to-talk transcription via /api/voice/transcribe.
 */
export function useVoiceRecording(
  onTranscript: (text: string) => void,
): VoiceRecordingHandle {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setVoiceState("transcribing");
      try {
        const formData = new FormData();
        formData.set("audio", blob, "voice-input.webm");

        const response = await fetch("/api/voice/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          setVoiceState("idle");
          return;
        }

        const data = (await response.json()) as {
          ok?: boolean;
          text?: string;
        };
        if (data.ok && data.text?.trim()) {
          onTranscript(data.text.trim());
        }
      } catch {
        // Silently fail — voice transcription is best-effort
      }
      setVoiceState("idle");
    },
    [onTranscript],
  );

  const startRecording = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      stopStream();
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      void transcribe(blob);
    };

    recorder.start();
    setVoiceState("recording");
  }, [stopStream, transcribe]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }, []);

  const discardRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    chunksRef.current = [];
    mediaRecorderRef.current = null;
    stopStream();
    setVoiceState("idle");
  }, [stopStream]);

  const toggleRecording = useCallback(() => {
    if (voiceState === "recording") {
      stopRecording();
    } else if (voiceState === "idle") {
      void startRecording();
    }
  }, [voiceState, startRecording, stopRecording]);

  return {
    voiceState,
    toggleRecording,
    discardRecording,
  };
}
