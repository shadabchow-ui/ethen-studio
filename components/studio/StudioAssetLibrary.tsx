"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MediaAsset } from "@/lib/media";
import { StudioPageFrame } from "./StudioPageFrame";
import { StudioAssetCard } from "./StudioAssetCard";
import { StudioAssetInspector } from "./StudioAssetInspector";
import { StudioStatusPill } from "./StudioStatusPill";

const ASSET_TYPE_FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "character", label: "Character" },
  { id: "product", label: "Product" },
  { id: "campaign", label: "Campaign" },
  { id: "game", label: "Game Asset" },
  { id: "reference", label: "Reference" },
];

const ACTION_FEEDBACK: Record<string, string> = {
  "Reuse as reference": "Mock reference recorded. No real asset was linked.",
  "Send to Create Image": "Mock handoff to Create Image. Real generation needs provider setup.",
  "Send to Image to Video": "Mock handoff to Image to Video. Real animation needs provider config.",
  "Send to Canvas": "Mock handoff to Canvas. Canvas is setup-required.",
  "Add to project": "Tracked as planned insertion only. Repo-backed file insertion is not implemented yet.",
};

export function StudioAssetLibrary({ routeMarker }: { routeMarker?: string }) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshAssets = useCallback(() => {
    void fetch("/api/media/assets")
      .then((response) => response.json())
      .then((body) => {
        setAssets(Array.isArray(body.assets) ? (body.assets as MediaAsset[]) : []);
      })
      .catch(() => {
        setAssets([]);
      });
  }, []);

  useEffect(() => {
    refreshAssets();
  }, [refreshAssets]);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 2800);
  }, []);

  const handleAction = useCallback(
    (action: string, asset: MediaAsset) => {
      if (action === "Download asset") {
        if (asset.url && !asset.isMock) {
          window.open(asset.url, "_blank", "noopener,noreferrer");
          showFeedback("Opened asset URL for download/export.");
          return;
        }
        showFeedback("Download is unavailable for mock assets.");
        return;
      }
      const message = ACTION_FEEDBACK[action] ?? `Mock action "${action}" applied. No real operation performed.`;
      showFeedback(message);
      setSelectedAsset(asset);
    },
    [showFeedback],
  );

  const handleToggleFavorite = useCallback(
    (asset: MediaAsset) => {
      setAssets((current) => current.map((item) => (item.id === asset.id ? { ...item, favorite: !item.favorite } : item)));
      setSelectedAsset((current) => (current?.id === asset.id ? { ...current, favorite: !current.favorite } : current));
      showFeedback(asset.favorite ? "Removed from favorites in this browser session." : "Added to favorites in this browser session.");
    },
    [showFeedback],
  );

  const handleSelectAsset = useCallback((asset: MediaAsset) => {
    setSelectedAsset((prev) => (prev?.id === asset.id ? null : asset));
  }, []);

  const filteredAssets = assets.filter((asset) => {
    if (favoritesOnly && !asset.favorite) return false;
    if (activeFilter === "all") return true;
    if (activeFilter === "character") return asset.kind === "character_profile" || asset.kind === "character";
    if (activeFilter === "product") return asset.kind === "product_asset";
    if (activeFilter === "campaign") return asset.kind === "campaign_asset";
    if (activeFilter === "game") return asset.type === "game_asset" || asset.kind === "game_asset";
    if (activeFilter === "reference") return asset.kind === "reference";
    return asset.type === activeFilter;
  });

  return (
    <StudioPageFrame
      eyebrow="ASSETS"
      routeMarker={routeMarker}
      title="Assets"
      description="Browse locally stored Studio assets and provider results. Uploads are private-beta local storage only, and provider outputs keep their original asset URLs when available."
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/studio/apps/create-image"
            className="inline-flex rounded-[9px] bg-[#f5f5f5] px-4 py-2.5 text-[12.5px] font-semibold text-[#0a0a0a] transition hover:bg-[#ffffff] active:scale-[0.97]"
          >
            Create an Image
          </Link>
          <Link
            href="/studio/projects"
            className="inline-flex rounded-[9px] bg-[var(--bg-surface)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-elevated)] active:scale-[0.97]"
          >
            Open Projects
          </Link>
        </div>
      }
      statusPills={
        <>
          <StudioStatusPill label="Local/private-beta asset library" tone="neutral" />
          <StudioStatusPill label="Uploads stored on this machine only" tone="setup" />
          <StudioStatusPill label={`${assets.length} assets loaded`} tone="neutral" />
          <StudioStatusPill label="Not production-durable cloud storage" tone="setup" />
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {ASSET_TYPE_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setActiveFilter(filter.id)}
            className={
              activeFilter === filter.id
                ? "rounded-[7px] bg-[var(--bg-surface)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--text-primary)] transition active:scale-[0.96]"
                : "rounded-[7px] bg-[var(--bg-surface)] px-3 py-1.5 text-[11.5px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] active:scale-[0.96]"
            }
          >
            {filter.label}
          </button>
        ))}

        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setFavoritesOnly((prev) => !prev)}
            className={
              favoritesOnly
                ? "inline-flex items-center gap-1.5 rounded-[7px] bg-[var(--bg-surface)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--text-primary)] transition active:scale-[0.96]"
                : "inline-flex items-center gap-1.5 rounded-[7px] bg-[var(--bg-surface)] px-3 py-1.5 text-[11.5px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] active:scale-[0.96]"
            }
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill={favoritesOnly ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            Favorites
          </button>
        </div>
      </div>

      {filteredAssets.length === 0 ? (
        <section className="flex flex-col items-center justify-center gap-3 rounded-[24px] bg-[var(--bg-surface)] px-6 py-20">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            className="text-[var(--text-tertiary)]"
            aria-hidden
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <p className="text-[13px] text-[var(--text-secondary)]">
            {favoritesOnly ? "No favorites yet. Click the heart icon on any asset to save it." : "No assets match this filter."}
          </p>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11.5px] text-[var(--text-secondary)]">
                {filteredAssets.length} asset{filteredAssets.length !== 1 ? "s" : ""}
                {favoritesOnly ? " · Favorites only" : ""}
                {activeFilter !== "all" ? ` · ${ASSET_TYPE_FILTERS.find((f) => f.id === activeFilter)?.label}` : ""}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredAssets.map((asset) => (
                <StudioAssetCard
                  key={asset.id}
                  asset={asset}
                  selected={selectedAsset?.id === asset.id}
                  onSelect={handleSelectAsset}
                  onAction={handleAction}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <StudioAssetInspector
              asset={selectedAsset}
              onAction={handleAction}
              onClose={() => setSelectedAsset(null)}
            />

            {feedback ? (
              <div className="rounded-[12px] bg-[var(--bg-elevated)] px-4 py-3 transition animate-in fade-in slide-in-from-bottom-1">
                <p className="text-[12px] text-[var(--text-secondary)]">{feedback}</p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-5">
        <div className="flex items-start gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden>
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <div>
            <h3 className="text-[13px] text-[var(--text-primary)]">Storage Receipt</h3>
            <p className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
              Uploaded references are stored in <strong className="text-[var(--text-secondary)]">local/private-beta media storage</strong>
              on this machine and served through tracked asset IDs. This is not production-durable cloud storage.
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">
              Mock assets stay labeled with <strong className="text-[var(--text-secondary)]">isMock: true</strong>. Provider results may point to real provider URLs when generation succeeded.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-[18px] tracking-[-0.01em] text-[var(--text-primary)]">
            Quick Links
          </h2>
          <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
            Navigate to related Studio areas from the asset library.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Link
            href="/studio/image"
            className="block rounded-[18px] bg-[var(--bg-elevated)] px-5 py-5 transition-colors hover:bg-[var(--bg-surface)]"
          >
            <h3 className="text-[15px] text-[var(--text-primary)]">Image Studio</h3>
            <p className="mt-2 text-[12.5px] leading-6 text-[var(--text-secondary)]">
              Create new images with prompt-first workflows.
            </p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-primary)]">
              Open
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </span>
          </Link>
          <Link
            href="/studio/apps"
            className="block rounded-[18px] bg-[var(--bg-elevated)] px-5 py-5 transition-colors hover:bg-[var(--bg-surface)]"
          >
            <h3 className="text-[15px] text-[var(--text-primary)]">Studio Apps</h3>
            <p className="mt-2 text-[12.5px] leading-6 text-[var(--text-secondary)]">
              Browse the full app catalog with mock and setup-required labels.
            </p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-primary)]">
              Browse
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </span>
          </Link>
          <Link
            href="/studio/projects"
            className="block rounded-[18px] bg-[var(--bg-elevated)] px-5 py-5 transition-colors hover:bg-[var(--bg-surface)]"
          >
            <h3 className="text-[15px] text-[var(--text-primary)]">Projects</h3>
            <p className="mt-2 text-[12.5px] leading-6 text-[var(--text-secondary)]">
              Organize assets into campaign and project containers.
            </p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-primary)]">
              Open
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </span>
          </Link>
        </div>
      </section>
    </StudioPageFrame>
  );
}
