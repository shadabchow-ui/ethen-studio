"use client";

import { useMemo, useState } from "react";
import type { StudioComposerSlotProps } from "@ethen/app-shell";
import { V2Composer, type V2ComposerState } from "@ethen/ui/design-system/v2/Composer";
import { studioCapabilityLabel } from "../studio-capability-truth";
import { qualifiedComposerModels } from "./composer-models";
import { useStudioWorkbenchSelectionOptional } from "./selection-context";
import { SlotPanel } from "./slot-primitives";

/**
 * Studio V2 Job 13 — Composer slot implementation.
 *
 * The shared V2Composer wired to Studio capability truth: models come only
 * from qualified catalog projections (`projectCapability`), so unqualified
 * routes (including text-to-video) are never offered. Catalog-only panels
 * render the composer disabled with the honest capability label. Prompts
 * submit through the page's live generation path (`onSubmit`); quota,
 * quote, and consent feedback travels back via the workbench status line.
 */

export function StudioComposerSlot({ placeholder, onSubmit }: StudioComposerSlotProps) {
  const selection = useStudioWorkbenchSelectionOptional();
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const composer = selection?.composer ?? null;
  const statusLine = selection?.composerStatus ?? null;

  const models = useMemo(() => {
    if (!composer) return [];
    return qualifiedComposerModels(composer.capability);
  }, [composer]);

  const effectiveModelId = selectedModelId ?? models[0]?.id ?? null;
  const disabledReason = composer?.disabledReason ?? null;
  const unqualified = composer !== null && models.length === 0;

  const state: V2ComposerState = !composer || disabledReason || unqualified ? "disabled" : sending ? "sending" : "idle";
  const statusText =
    statusLine ??
    (!composer
      ? "Open a generator to compose."
      : (disabledReason ?? (unqualified ? studioCapabilityLabel(composer.appId) : studioCapabilityLabel(composer.appId))));

  return (
    <SlotPanel label="Studio composer">
      <V2Composer
        value={value}
        onValueChange={setValue}
        onSend={(prompt) => {
          if (state === "disabled" || state === "sending") return;
          const trimmed = prompt.trim();
          if (!trimmed) return;
          setSending(true);
          try {
            onSubmit?.(trimmed);
          } finally {
            setSending(false);
          }
        }}
        models={models}
        selectedModelId={effectiveModelId}
        onModelSelect={(model) => setSelectedModelId(model.id)}
        state={state}
        statusText={statusText}
        placeholder={placeholder ?? "Describe the shot, style, and constraints…"}
      />
    </SlotPanel>
  );
}
