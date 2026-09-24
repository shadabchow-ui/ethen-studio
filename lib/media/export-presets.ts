/**
 * Studio V2 Job 07 — versioned export presets.
 * Every export pins preset name + version in its manifest. Formats without
 * runtime decode or certification stay out of this registry: unsupported
 * advanced codecs, HDR claims, and previz are deferred, not advertised.
 */

export const EXPORT_PRESETS = Object.freeze({
  original: { version: "v1", label: "Original bytes", mimeType: null as string | null },
  "handoff-zip": { version: "v1", label: "Asset handoff bundle", mimeType: "application/zip" },
  "png-sequence": { version: "v1", label: "PNG frame sequence", mimeType: "application/zip" },
  fcpxml: { version: "v1", label: "FCPXML timeline", mimeType: "application/xml" },
  "c2pa-sidecar": { version: "v1", label: "Provenance sidecar", mimeType: "application/json" },
} as const);

export type ExportPresetName = keyof typeof EXPORT_PRESETS;

export function assertExportPreset(preset: string): asserts preset is ExportPresetName {
  if (!(preset in EXPORT_PRESETS)) {
    throw new Error(`EXPORT_PRESET_UNKNOWN: preset ${preset} is not an advertised V1 export.`);
  }
}

export function exportPresetVersion(preset: ExportPresetName): string {
  return EXPORT_PRESETS[preset].version;
}
