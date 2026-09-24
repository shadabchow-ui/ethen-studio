import { cn } from "@/lib/utils";
import type { StudioPreviewTile } from "./studio-home-data";

const ASPECT_CLASS: Record<StudioPreviewTile["aspect"], string> = {
  wide: "aspect-[16/10]",
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  ultrawide: "aspect-[21/9]",
};

interface StudioMediaTileProps {
  tile: StudioPreviewTile;
  className?: string;
  showPlayIcon?: boolean;
}

export function StudioMediaTile({
  tile,
  className,
  showPlayIcon = false,
}: StudioMediaTileProps) {
  const isVideo = tile.mediaType === "video" && Boolean(tile.videoUrl);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[16px] bg-[var(--bg-elevated)]",
        ASPECT_CLASS[tile.aspect],
        className,
      )}
    >
      <div className={cn("absolute inset-0", tile.tone)} />
      {tile.imageUrl ? (
        <img
          src={tile.imageUrl}
          alt={tile.imageAlt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {isVideo ? (
        <video
          src={tile.videoUrl}
          poster={tile.posterUrl}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={tile.imageAlt}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
      {tile.accent ? (
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", tile.accent)} />
          {tile.subtitle ? <span className="text-[10px] uppercase tracking-[0.14em] text-white/52">{tile.subtitle}</span> : null}
        </div>
      ) : tile.subtitle ? (
        <div className="absolute left-3 top-3 text-[10px] uppercase tracking-[0.14em] text-white/52">
          {tile.subtitle}
        </div>
      ) : null}
      {tile.badge ? (
        <div className="absolute right-3 top-3 rounded-[7px] bg-black/45 px-2 py-1 text-[10px] font-medium text-white/72">
          {tile.badge}
        </div>
      ) : null}
      {showPlayIcon && !isVideo ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white/90" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="text-[13px] font-medium text-white">{tile.title}</p>
      </div>
    </div>
  );
}
