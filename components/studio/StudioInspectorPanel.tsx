"use client";

import type { ReactNode } from "react";

/** M5: result-phase types relocated from the retired mock generation core. */
export type MockPhase =
  | "idle"
  | "validating"
  | "estimating"
  | "generating"
  | "finalizing"
  | "completed";

export interface MockResult {
  id: string;
  title: string;
  meta: string;
  aspect: "wide" | "square" | "portrait";
  mockPreview: boolean;
  isMock?: boolean;
  assetUrl?: string | null;
  previewUrl?: string | null;
  jobId?: string;
  isVideo?: boolean;
  processing?: boolean;
  providerLabel?: string;
  errorMessage?: string;
  promptText?: string;
  truthLabel?: string;
  hasRealImageReference?: boolean;
  persistedAssetId?: string | null;
  inspectorValues?: Record<string, string>;
}

interface StudioInspectorPanelProps {
  panelTitle: string;
  category: "image" | "video" | "marketing";
  statusLabel: string;
  helperText?: string;
  promptValue?: string;
  referenceLabel?: string;
  referenceValue?: string;
  fields: string[];
  phase: MockPhase;
  selectedResult: MockResult | undefined;
  controlSelections: Record<string, string>;
  sliderValues: Record<string, number>;
  safetyNotice?: ReactNode;
  contextValues?: Record<string, string>;
}

function resolveValue(
  field: string,
  promptValue: string | undefined,
  referenceValue: string | undefined,
  selectedResult: MockResult | undefined,
  controlSelections: Record<string, string>,
  sliderValues: Record<string, number>,
  contextValues: Record<string, string> | undefined,
): string {
  const directContext = contextValues?.[field];
  if (directContext) return directContext;

  const directInspectorValue = selectedResult?.inspectorValues?.[field];
  if (directInspectorValue) return directInspectorValue;

  const fieldLower = field.toLowerCase();

  if (fieldLower.includes("prompt")) return selectedResult?.promptText ?? promptValue?.trim() ?? "—";
  if (fieldLower.includes("source handling")) return contextValues?.[field] ?? "—";
  if (fieldLower.includes("claim review")) return contextValues?.[field] ?? "Needs review";
  if (fieldLower.includes("status")) return contextValues?.[field] ?? "Needs review";
  if (fieldLower.includes("style")) return controlSelections.style ?? "photoreal";
  if (fieldLower.includes("aspect")) return controlSelections.aspect ?? controlSelections["aspect-ratio"] ?? "1:1";
  if (fieldLower.includes("duration")) return controlSelections.duration ?? "5s";
  if (fieldLower.includes("camera")) return controlSelections.camera ?? "static";
  if (fieldLower.includes("source frame")) return referenceValue?.trim() || "Not provided";
  if (fieldLower.includes("shot")) return controlSelections.shot ?? "wide";
  if (fieldLower.includes("lens")) return controlSelections.lens ?? "35mm";
  if (fieldLower.includes("mood")) return controlSelections.mood ?? "warm";
  if (fieldLower.includes("tone")) return controlSelections.tone ?? "premium";
  if (fieldLower.includes("platform")) return controlSelections.platform ?? "instagram";
  if (fieldLower.includes("audience")) return controlSelections.audience ?? "broad";
  if (fieldLower.includes("format")) return controlSelections.format ?? "static";
  if (fieldLower.includes("outfit")) return controlSelections.outfit ?? "casual";
  if (fieldLower.includes("location")) return controlSelections.location ?? "studio-set";
  if (fieldLower.includes("pose")) return controlSelections.pose ?? "portrait";
  if (fieldLower.includes("action preset") || fieldLower.includes("action")) return controlSelections.action ?? "walk";
  if (fieldLower.includes("intensity") || fieldLower.includes("motion intensity")) return String(sliderValues.intensity ?? 3);
  if (fieldLower.includes("asset type")) return controlSelections["asset-type"] ?? "character";
  if (fieldLower.includes("style pack")) return controlSelections["style-pack"] ?? "pixel";
  if (fieldLower.includes("quality")) return String(sliderValues.quality ?? 2);
  if (fieldLower.includes("seed")) return selectedResult?.id ?? "—";
  if (fieldLower.includes("model")) return selectedResult?.providerLabel ?? "Default model lane";
  if (fieldLower.includes("goal")) return controlSelections.goal ?? "awareness";
  if (fieldLower.includes("brand")) return controlSelections.brand ?? "product-solo";
  if (fieldLower.includes("consent")) return "Consent mock — no real identity used";
  if (fieldLower.includes("grid")) return "4x4 mock grid";
  if (fieldLower.includes("frame count")) return "4 frames";
  if (fieldLower.includes("camera angle")) return controlSelections.shot ?? "wide";
  if (fieldLower.includes("copy variant")) return "Variant A";

  return controlSelections[field] ?? selectedResult?.meta ?? "—";
}

export function StudioInspectorPanel({
  promptValue,
  referenceValue,
  fields,
  phase,
  selectedResult,
  controlSelections,
  sliderValues,
  safetyNotice,
  contextValues,
}: StudioInspectorPanelProps) {
  const hasResult = selectedResult !== undefined;
  const isIdle = phase === "idle";

  return (
    <section className="ethen-panel-smoked-quiet space-y-4 rounded-[20px] px-4 py-4">
      <h2 className="text-[12px] font-medium text-[var(--text-secondary)] tracking-wide">Inspector</h2>

      {hasResult ? (
        <div className="space-y-2">
          {fields.map((field) => (
            <div
              key={field}
              className="flex items-center justify-between gap-3 px-1 py-1.5"
            >
              <span className="text-[11.5px] text-[var(--text-secondary)]">{field}</span>
              <span className="max-w-[180px] text-right text-[11.5px] font-medium text-[var(--text-secondary)]">
                {resolveValue(field, promptValue, referenceValue, selectedResult, controlSelections, sliderValues, contextValues)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11.5px] text-[var(--text-secondary)]">
          {isIdle ? "No selection" : "Inspecting..."}
        </p>
      )}

      {safetyNotice ? <div className="pt-2">{safetyNotice}</div> : null}
    </section>
  );
}
