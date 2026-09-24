/** Canonical vocabulary for evidence-backed static model capabilities. */
export const MI_CAPABILITY_KEYS = [
  "text", "code", "image", "audio", "video", "streaming", "tools",
  "structured-output", "reasoning", "embeddings", "rerank", "realtime",
  "prompt-caching",
] as const;

export type MICapabilityKey = (typeof MI_CAPABILITY_KEYS)[number];
export type MICapabilityState = true | false | null;
export type MICapabilityMap = Readonly<Record<MICapabilityKey, MICapabilityState>>;

export function emptyCapabilities(): MICapabilityMap {
  return Object.fromEntries(MI_CAPABILITY_KEYS.map((key) => [key, null])) as MICapabilityMap;
}
