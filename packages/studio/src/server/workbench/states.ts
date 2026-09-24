/** Studio V5 workbench — typed UI states for consumers (STUDIO_14, server-only). */
import "server-only";

export type WorkbenchLoadState =
  | { state: "loading" }
  | { state: "empty"; action: string }
  | { state: "blocked"; reason: string; remediation: string }
  | { state: "error"; message: string; retryable: boolean }
  | { state: "ready" };

export type RenderUiStatus =
  | { state: "idle" }
  | { state: "queued"; renderId: string }
  | { state: "running"; renderId: string }
  | { state: "succeeded"; renderId: string; assetId: string | null }
  | { state: "failed"; renderId: string; message: string }
  | { state: "cancelled"; renderId: string };

export interface UnsupportedExportWarning {
  code: "INTERCHANGE_SUBSET" | "FEATURE_OMITTED" | "PROXY_ONLY" | "DESKTOP_REQUIRED";
  message: string;
}

export function interchangeWarnings(unsupportedFeatures: readonly string[], format: "otio" | "fcpxml"): UnsupportedExportWarning[] {
  const label = format === "otio" ? "OTIO" : "FCPXML";
  return [
    {
      code: "INTERCHANGE_SUBSET",
      message: `${label} export covers the V1 subset only: single video track, straight cuts, file clips.`,
    },
    ...unsupportedFeatures.map((feature): UnsupportedExportWarning => ({
      code: "FEATURE_OMITTED",
      message: `Unsupported feature omitted from ${label}: ${feature}.`,
    })),
  ];
}
