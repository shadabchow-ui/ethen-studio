/**
 * STUDIO_11 — audio barrel. All V5 audio consumers import from here.
 */
export * from "./types";
export * from "./audio-tool-bindings";
export * from "./audio-api-client";
export { useAudioJob } from "./useAudioJob";
export { AUDIO_HISTORY_FINAL_STAGE, toAudioHistoryEntry } from "./audio-history";
export { TranscriptEditor } from "./TranscriptEditor";
export { SpeakerMapEditor } from "./SpeakerMapEditor";
export { StageList } from "./StageList";
export { VoiceFrame } from "./VoiceFrame";
export { TranscribeFrame } from "./TranscribeFrame";
export { DubbingFrame } from "./DubbingFrame";
export { ChangerFrame } from "./ChangerFrame";
export { AudioCreateRouteAdapter } from "./AudioCreateRouteAdapter";
