"use client";

/**
 * Studio V3 Job 1 — versioned Studio preference store.
 *
 * Local-first (correct before any network), same pattern as
 * `chat-lab/chat-settings`: every visible Studio setting reads its real
 * value, edits save, reloads persist, failures surface. A custom event
 * notifies open surfaces so saves apply without a reload (Job 4 consumes).
 *
 * Consumer contract for Jobs 2-4:
 * - `import { loadStudioSettings, saveStudioSettings, subscribeStudioSettings,
 *   DEFAULT_STUDIO_SETTINGS, STUDIO_SETTINGS_VERSION } from
 *   "@ethen/ui/settings/studio-settings"`
 * - Storage key `ethen.studio.settings.v1`, event `ethen:studio-settings`.
 * - Job 4 wires these prefs into generation/routing/assets/video/export/
 *   keyboard behavior. Until then the settings UI marks effects as pending
 *   (saved, takes effect in Job 4) — never fake-successful.
 * - Validation: `validateStudioSettings` coerces unknown input to valid
 *   prefs + a problems list. `saveStudioSettings` persists valid prefs and
 *   returns an error string only when browser storage fails.
 */

export const STUDIO_SETTINGS_VERSION = 1;
export const STUDIO_SETTINGS_STORAGE_KEY = "ethen.studio.settings.v1";
export const STUDIO_SETTINGS_EVENT = "ethen:studio-settings";

export type StudioQuality = "draft" | "standard" | "high";
export type StudioProvider = "auto" | "fal" | "replicate" | "local";
export type StudioQueuePriority = "standard" | "high";
export type StudioRetentionDays = 7 | 30 | 90 | 365;
export type StudioVideoResolution = "720p" | "1080p" | "4k";
export type StudioVideoFps = 24 | 30 | 60;
export type StudioExportFormat = "png" | "jpg" | "webp" | "mp4";

export interface StudioGenerationPrefs {
  defaultQuality: StudioQuality;
  steps: number;
  guidance: number;
  lockSeed: boolean;
}

export interface StudioRoutingPrefs {
  preferredProvider: StudioProvider;
  allowFallback: boolean;
  queuePriority: StudioQueuePriority;
}

export interface StudioAssetsPrefs {
  retentionDays: StudioRetentionDays;
  keepVersions: boolean;
}

export interface StudioVideoPrefs {
  defaultResolution: StudioVideoResolution;
  defaultFps: StudioVideoFps;
  captions: boolean;
}

export interface StudioExportPrefs {
  defaultFormat: StudioExportFormat;
  quality: number;
  watermark: boolean;
}

export interface StudioKeyboardPrefs {
  shortcutsEnabled: boolean;
}

export interface StudioSettings {
  version: number;
  generation: StudioGenerationPrefs;
  routing: StudioRoutingPrefs;
  assets: StudioAssetsPrefs;
  video: StudioVideoPrefs;
  export: StudioExportPrefs;
  keyboard: StudioKeyboardPrefs;
}

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  version: STUDIO_SETTINGS_VERSION,
  generation: { defaultQuality: "standard", steps: 20, guidance: 7.5, lockSeed: false },
  routing: { preferredProvider: "auto", allowFallback: true, queuePriority: "standard" },
  assets: { retentionDays: 30, keepVersions: true },
  video: { defaultResolution: "1080p", defaultFps: 30, captions: false },
  export: { defaultFormat: "png", quality: 90, watermark: false },
  keyboard: { shortcutsEnabled: true },
};

const QUALITIES: readonly StudioQuality[] = ["draft", "standard", "high"];
const PROVIDERS: readonly StudioProvider[] = ["auto", "fal", "replicate", "local"];
const PRIORITIES: readonly StudioQueuePriority[] = ["standard", "high"];
const RETENTIONS: readonly StudioRetentionDays[] = [7, 30, 90, 365];
const RESOLUTIONS: readonly StudioVideoResolution[] = ["720p", "1080p", "4k"];
const FPSES: readonly StudioVideoFps[] = [24, 30, 60];
const FORMATS: readonly StudioExportFormat[] = ["png", "jpg", "webp", "mp4"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickInt(value: unknown, allowed: readonly number[], fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && allowed.includes(value)
    ? value
    : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function validateStudioSettings(value: unknown): { settings: StudioSettings; problems: string[] } {
  const problems: string[] = [];
  const root = isObject(value) ? value : {};
  if (value !== undefined && !isObject(value)) problems.push("settings must be an object");
  const generation = isObject(root.generation) ? root.generation : {};
  const routing = isObject(root.routing) ? root.routing : {};
  const assets = isObject(root.assets) ? root.assets : {};
  const video = isObject(root.video) ? root.video : {};
  const exp = isObject(root.export) ? root.export : {};
  const keyboard = isObject(root.keyboard) ? root.keyboard : {};
  const d = DEFAULT_STUDIO_SETTINGS;

  const settings: StudioSettings = {
    version: STUDIO_SETTINGS_VERSION,
    generation: {
      defaultQuality: pickEnum(generation.defaultQuality, QUALITIES, d.generation.defaultQuality),
      steps: Math.round(clampNumber(generation.steps, 1, 50, d.generation.steps)),
      guidance: clampNumber(generation.guidance, 0, 20, d.generation.guidance),
      lockSeed: generation.lockSeed === true,
    },
    routing: {
      preferredProvider: pickEnum(routing.preferredProvider, PROVIDERS, d.routing.preferredProvider),
      allowFallback: routing.allowFallback !== false,
      queuePriority: pickEnum(routing.queuePriority, PRIORITIES, d.routing.queuePriority),
    },
    assets: {
      retentionDays: pickInt(assets.retentionDays, RETENTIONS, d.assets.retentionDays) as StudioRetentionDays,
      keepVersions: assets.keepVersions !== false,
    },
    video: {
      defaultResolution: pickEnum(video.defaultResolution, RESOLUTIONS, d.video.defaultResolution),
      defaultFps: pickInt(video.defaultFps, FPSES, d.video.defaultFps) as StudioVideoFps,
      captions: video.captions === true,
    },
    export: {
      defaultFormat: pickEnum(exp.defaultFormat, FORMATS, d.export.defaultFormat),
      quality: Math.round(clampNumber(exp.quality, 1, 100, d.export.quality)),
      watermark: exp.watermark === true,
    },
    keyboard: {
      shortcutsEnabled: keyboard.shortcutsEnabled !== false,
    },
  };

  if (root.version !== undefined && root.version !== STUDIO_SETTINGS_VERSION) {
    problems.push(`version ${String(root.version)} migrated to ${STUDIO_SETTINGS_VERSION}`);
  }
  return { settings, problems };
}

export function loadStudioSettings(): StudioSettings {
  if (typeof window === "undefined") return structuredClone(DEFAULT_STUDIO_SETTINGS);
  try {
    const raw = window.localStorage.getItem(STUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STUDIO_SETTINGS);
    return validateStudioSettings(JSON.parse(raw) as unknown).settings;
  } catch {
    return structuredClone(DEFAULT_STUDIO_SETTINGS);
  }
}

export function saveStudioSettings(settings: StudioSettings): string | null {
  try {
    const { settings: valid } = validateStudioSettings(settings);
    window.localStorage.setItem(STUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(valid));
    window.dispatchEvent(new CustomEvent(STUDIO_SETTINGS_EVENT, { detail: valid }));
    return null;
  } catch {
    return "Studio preferences could not be saved. Check your browser storage and try again.";
  }
}

let cachedRaw: string | null | undefined;
let cachedSettings: StudioSettings = DEFAULT_STUDIO_SETTINGS;

/** useSyncExternalStore snapshot (cached by raw payload — same ref unless changed). */
export function getStudioSettingsSnapshot(): StudioSettings {
  if (typeof window === "undefined") return DEFAULT_STUDIO_SETTINGS;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STUDIO_SETTINGS_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedSettings;
  cachedRaw = raw;
  try {
    cachedSettings = raw
      ? validateStudioSettings(JSON.parse(raw) as unknown).settings
      : structuredClone(DEFAULT_STUDIO_SETTINGS);
  } catch {
    cachedSettings = structuredClone(DEFAULT_STUDIO_SETTINGS);
  }
  return cachedSettings;
}

export function getStudioSettingsServerSnapshot(): StudioSettings {
  return DEFAULT_STUDIO_SETTINGS;
}

export function subscribeStudioSettings(listener: (settings: StudioSettings) => void): () => void {
  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent).detail as StudioSettings | undefined;
    listener(detail ?? loadStudioSettings());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STUDIO_SETTINGS_STORAGE_KEY && event.key !== null) return;
    listener(loadStudioSettings());
  };
  window.addEventListener(STUDIO_SETTINGS_EVENT, onEvent);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STUDIO_SETTINGS_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
}
