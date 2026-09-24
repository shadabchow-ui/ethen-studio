"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioAssetPanelSlotProps } from "@ethen/app-shell";
import { useStudioWorkbenchSelectionOptional } from "./selection-context";
import {
  SlotEmpty,
  SlotError,
  SlotLoading,
  SlotPanel,
  SlotUnauthorized,
  fetchSlotJson,
  isUnauthorizedStatus,
  type SlotFetchState,
} from "./slot-primitives";

/**
 * Studio V2 Job 13 — AssetPanel slot implementation.
 *
 * Real project-scoped assets from the canonical project graph
 * (`/api/media/graph?projectId=`). Uploads land through the secure object
 * lane (`/api/media/upload`, multipart) with a genuine uploading state.
 * No fake thumbnails, no placeholder counts.
 */

interface GraphAsset {
  id: string;
  kind: string;
  title: string;
  contentHash: string | null;
  createdAt: string;
}

type UploadState = { state: "idle" } | { state: "uploading"; name: string } | { state: "error"; message: string };

export function StudioAssetPanelSlot({ projectId, onSelectAsset, onOpenLibrary }: StudioAssetPanelSlotProps) {
  const selection = useStudioWorkbenchSelectionOptional();
  const [fetchState, setFetchState] = useState<SlotFetchState<GraphAsset[]>>({ state: "loading" });
  const [upload, setUpload] = useState<UploadState>({ state: "idle" });
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    setFetchState({ state: "loading" });
    void fetchSlotJson(`/api/media/graph?projectId=${encodeURIComponent(projectId)}`)
      .then(({ status, body }) => {
        if (isUnauthorizedStatus(status)) {
          setFetchState({ state: "unauthorized", message: "Asset reads for this project require project membership." });
          return;
        }
        const record = body as { ok?: boolean; data?: { assets?: GraphAsset[] }; error?: unknown } | null;
        if (record?.ok && Array.isArray(record.data?.assets)) {
          const assets = record.data.assets as GraphAsset[];
          setFetchState(assets.length === 0 ? { state: "empty" } : { state: "ready", data: assets });
          return;
        }
        const message =
          typeof record?.error === "string"
            ? record.error
            : (record?.error as { message?: string } | undefined)?.message ?? "Asset read failed for this project.";
        setFetchState({ state: "error", message });
      })
      .catch(() => setFetchState({ state: "error", message: "Network error reading project assets." }));
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- M7A: async loader on scope change; all setState calls settle in fetch continuations.
    load();
  }, [load]);

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      setUpload({ state: "uploading", name: file.name });
      const form = new FormData();
      form.append("projectId", projectId);
      form.append("file", file);
      void fetchSlotJson("/api/media/upload", { method: "POST", body: form })
        .then(({ status, body }) => {
          const record = body as { ok?: boolean; error?: unknown } | null;
          if (record?.ok) {
            setUpload({ state: "idle" });
            load();
            return;
          }
          const message =
            typeof record?.error === "string"
              ? record.error
              : `Upload failed (${status === 0 ? "network" : `HTTP ${status}`}).`;
          setUpload({ state: "error", message });
        })
        .catch(() => setUpload({ state: "error", message: "Network error during upload." }));
    },
    [projectId, load],
  );

  const selectAsset = useCallback(
    (asset: GraphAsset) => {
      selection?.setSubject({
        kind: "asset",
        id: asset.id,
        title: asset.title,
        detail: {
          Kind: asset.kind,
          "Content hash": asset.contentHash ? `sha256:${asset.contentHash.slice(0, 16)}…` : "—",
          Created: asset.createdAt,
        },
      });
      onSelectAsset?.(asset.id);
    },
    [selection, onSelectAsset],
  );

  return (
    <SlotPanel
      label="Project assets"
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            aria-label="Upload asset to this project"
            onChange={(event) => {
              handleFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={upload.state === "uploading"}
            onClick={() => fileRef.current?.click()}
            className="rounded-[9px] bg-[var(--bg-elevated)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] disabled:opacity-60"
          >
            {upload.state === "uploading" ? `Uploading ${upload.name}…` : "Upload"}
          </button>
          {onOpenLibrary ? (
            <button
              type="button"
              onClick={onOpenLibrary}
              className="rounded-[9px] bg-[var(--bg-surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)]"
            >
              Library
            </button>
          ) : null}
        </>
      }
    >
      {upload.state === "uploading" ? (
        <div role="status" aria-live="polite" className="mb-2 flex items-center gap-2.5 rounded-[12px] bg-[var(--bg-surface)] px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--text-secondary)]" />
          Uploading {upload.name}…
        </div>
      ) : null}
      {upload.state === "error" ? (
        <div role="alert" className="mb-2 rounded-[12px] bg-[var(--bg-surface)] px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">
          {upload.message}
        </div>
      ) : null}
      {fetchState.state === "loading" ? <SlotLoading label="Reading project assets…" /> : null}
      {fetchState.state === "unauthorized" ? <SlotUnauthorized message={fetchState.message} /> : null}
      {fetchState.state === "error" ? <SlotError message={fetchState.message} onRetry={load} /> : null}
      {fetchState.state === "empty" ? <SlotEmpty title="No assets yet" hint="Uploads and generated outputs land here, project-scoped." /> : null}
      {fetchState.state === "ready" ? (
        <ul className="space-y-1.5" aria-label={`${fetchState.data.length} assets`}>
          {fetchState.data.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => selectAsset(asset)}
                className="flex w-full items-baseline justify-between gap-3 rounded-[9px] bg-[var(--bg-surface)] px-3 py-2 text-left hover:bg-[var(--bg-elevated)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] text-[var(--text-primary)]">{asset.title}</span>
                  <span className="block text-[11px] text-[var(--text-tertiary)]">
                    {asset.kind}
                    {asset.contentHash ? ` · sha256:${asset.contentHash.slice(0, 12)}…` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--text-tertiary)]">{asset.id.slice(0, 8)}…</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </SlotPanel>
  );
}
