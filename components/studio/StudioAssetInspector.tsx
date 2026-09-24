"use client";

import { useCallback } from "react";
import type { MediaAsset } from "@/lib/media";
import { AssetUsagePanel } from "@/components/builder/AssetUsagePanel";

interface StudioAssetInspectorProps {
  asset: MediaAsset | null;
  onAction: (action: string, asset: MediaAsset) => void;
  onClose: () => void;
}

const DETAIL_ACTIONS = [
  "Download asset",
  "Reuse as reference",
  "Send to Create Image",
  "Send to Image to Video",
  "Send to Canvas",
  "Add to project",
];

function truncate(str: string | null | undefined, len: number): string {
  if (!str) return "—";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

export function StudioAssetInspector({
  asset,
  onAction,
  onClose,
}: StudioAssetInspectorProps) {
  const handleAction = useCallback(
    (action: string) => {
      if (asset) onAction(action, asset);
    },
    [asset, onAction],
  );

  if (!asset) {
    return (
      <section className="space-y-3 rounded-[18px] bg-[var(--bg-surface)] px-5 py-5">
        <h2 className="text-[13px] text-[var(--text-primary)]">Asset Detail</h2>
        <p className="text-[11.5px] text-[var(--text-secondary)]">
          Select an asset to inspect its details and available actions.
        </p>
        <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] bg-[var(--bg-elevated)] px-4 py-10">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            className="text-[var(--text-tertiary)]"
            aria-hidden
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <p className="text-[12px] text-[var(--text-secondary)]">No asset selected</p>
        </div>
      </section>
    );
  }

  const rows: Array<[string, string]> = [
    ["Title", asset.title ?? "—"],
    ["Type", asset.type],
    ["Kind", asset.kind ?? "—"],
    ["Source", asset.source ?? "generation"],
    ["Dimensions", asset.width && asset.height ? `${asset.width}×${asset.height}` : "—"],
    ["Duration", asset.durationSeconds ? `${asset.durationSeconds}s` : "—"],
    ["Model", asset.modelName ?? "—"],
    ["Provider", asset.providerName ?? "—"],
    ["Prompt", truncate(asset.prompt, 80)],
    ["Aspect ratio", asset.aspectRatio ?? "—"],
    ["Created", asset.createdAt ? new Date(asset.createdAt).toLocaleDateString() : "—"],
  ];

  return (
    <section className="space-y-3 rounded-[18px] bg-[var(--bg-surface)] px-5 py-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] text-[var(--text-primary)]">Asset Detail</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[6px] p-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-secondary)]"
          aria-label="Close inspector"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[12px] bg-[var(--bg-inset)]">
        {asset.url && !asset.isMock && asset.type === "video" ? (
          <video src={asset.url} controls playsInline className="h-full w-full object-cover" />
        ) : asset.url && !asset.isMock ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt={asset.title ?? "Asset preview"} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[12px] text-[var(--text-tertiary)]">Mock Asset Preview</span>
        )}
      </div>

      <div className="space-y-1.5">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-3 rounded-[8px] bg-[var(--bg-elevated)] px-3 py-2"
          >
            <span className="shrink-0 text-[11px] text-[var(--text-secondary)]">{label}</span>
            <span className="text-right text-[11px] text-[var(--text-secondary)] font-medium">{value}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-[10.5px] font-medium text-[var(--text-tertiary)] uppercase tracking-[0.08em]">Mock Actions</p>
        <div className="flex flex-wrap gap-1.5">
          {DETAIL_ACTIONS.filter((action) => action !== "Download asset" || Boolean(asset.url && !asset.isMock)).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => handleAction(action)}
              className="rounded-[7px] bg-[var(--bg-surface)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] active:scale-[0.96]"
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {asset.isMock ? (
        <div className="rounded-[10px] bg-[var(--bg-elevated)] px-3 py-2.5">
          <p className="text-[10.5px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.08em]">Mock Asset</p>
          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
            This is a mock asset entry. No real file exists behind this preview.
          </p>
        </div>
      ) : null}

      <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5">
        <p className="text-[10.5px] font-medium text-[var(--text-secondary)] uppercase tracking-[0.08em]">Storage Receipt</p>
        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
          Local/private-beta storage only. Uploaded references are stored on this machine and served through tracked media asset IDs.
          This is not production-durable cloud storage.
        </p>
        {asset.providerName && (
          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
            Provider: {asset.providerName}{asset.modelName ? ` · ${asset.modelName}` : ""}
          </p>
        )}
        {asset.createdAt && (
          <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
            Generated: {new Date(asset.createdAt).toLocaleString()}
          </p>
        )}
      </div>

      <AssetUsagePanel repoConnected asset={asset} compact />
    </section>
  );
}
