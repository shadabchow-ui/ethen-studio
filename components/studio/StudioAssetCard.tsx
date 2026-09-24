"use client";

import { useCallback } from "react";
import type { MediaAsset } from "@/lib/media";

interface StudioAssetCardProps {
  asset: MediaAsset;
  selected?: boolean;
  onSelect: (asset: MediaAsset) => void;
  onAction: (action: string, asset: MediaAsset) => void;
  onToggleFavorite: (asset: MediaAsset) => void;
}

const TYPE_LABELS: Record<string, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  game_asset: "Game Asset",
};

const KIND_BADGE: Record<string, string> = {
  character_profile: "Character",
  product_asset: "Product",
  campaign_asset: "Campaign",
  moodboard: "Moodboard",
  reference: "Reference",
  voice_profile: "Voice",
  game_asset: "Game",
};

const MOCK_ACTIONS = [
  "Reuse as reference",
  "Send to Create Image",
  "Send to Image to Video",
  "Send to Canvas",
  "Add to project",
];

export function StudioAssetCard({
  asset,
  selected,
  onSelect,
  onAction,
  onToggleFavorite,
}: StudioAssetCardProps) {
  const handleSelect = useCallback(() => onSelect(asset), [asset, onSelect]);
  const handleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFavorite(asset);
    },
    [asset, onToggleFavorite],
  );

  const typeLabel = TYPE_LABELS[asset.type] ?? asset.type;
  const kindBadge = asset.kind ? KIND_BADGE[asset.kind] : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      className={
        selected
          ? "flex flex-col rounded-[14px] bg-[var(--bg-surface)] p-2.5 ring-1 ring-[var(--border-strong)] transition"
          : "flex flex-col rounded-[14px] bg-[var(--bg-surface)] p-2.5 transition hover:bg-[var(--bg-surface)]"
      }
    >
      <div className="relative flex aspect-square items-center justify-center rounded-[10px] bg-[var(--bg-inset)]">
        <span className="text-[11px] text-[var(--text-tertiary)]">Mock Asset</span>

        <span className="absolute left-2 top-2 rounded-[5px] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
          {typeLabel}
        </span>

        <button
          type="button"
          onClick={handleFavorite}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-[5px] bg-[var(--bg-surface)] transition hover:bg-[var(--bg-elevated)] active:scale-[0.93]"
          aria-label={asset.favorite ? "Unfavorite" : "Favorite"}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill={asset.favorite ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            className={asset.favorite ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </button>
      </div>

      <div className="mt-2 flex items-start justify-between gap-2 px-0.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-[var(--text-primary)]">
            {asset.title ?? "Untitled"}
          </p>
          <p className="text-[10.5px] text-[var(--text-secondary)]">
            {kindBadge ? `${kindBadge} · ` : ""}Sample preview
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1 px-0.5">
        {MOCK_ACTIONS.slice(0, 3).map((action) => (
          <button
            key={action}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction(action, asset);
            }}
            className="rounded-[6px] bg-[var(--bg-surface)] px-2 py-1 text-[10px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] active:scale-[0.96]"
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}
