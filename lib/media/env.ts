import "server-only";

import { getServerEnv, hasConfiguredServerEnv } from "@ethen/config/env";

export const CORTEX_API_KEY = "CORTEX_API_KEY";
export const CORTEX_API_BASE_URL = "CORTEX_API_BASE_URL";
export const CORTEX_DEFAULT_IMAGE_MODEL = "CORTEX_DEFAULT_IMAGE_MODEL";
export const CORTEX_DEFAULT_VIDEO_MODEL = "CORTEX_DEFAULT_VIDEO_MODEL";
export const CORTEX_DEFAULT_AUDIO_MODEL = "CORTEX_DEFAULT_AUDIO_MODEL";

export function getCortexApiKey(): string | undefined {
  return getServerEnv(CORTEX_API_KEY);
}

export function getCortexBaseUrl(): string | undefined {
  return getServerEnv(CORTEX_API_BASE_URL);
}

export function hasCortexConfig(): boolean {
  return hasConfiguredServerEnv(CORTEX_API_KEY);
}

export function getCortexDefaultImageModel(): string | undefined {
  return getServerEnv(CORTEX_DEFAULT_IMAGE_MODEL);
}

export function getCortexDefaultVideoModel(): string | undefined {
  return getServerEnv(CORTEX_DEFAULT_VIDEO_MODEL);
}

export function getCortexDefaultAudioModel(): string | undefined {
  return getServerEnv(CORTEX_DEFAULT_AUDIO_MODEL);
}
