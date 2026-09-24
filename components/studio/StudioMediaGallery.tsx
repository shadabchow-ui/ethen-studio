import Link from "next/link";
import { cn } from "@/lib/utils";
import { StudioSectionHeader } from "./StudioSectionHeader";
import { StudioMediaTile } from "./StudioMediaTile";
import type { StudioPreviewTile } from "./studio-home-data";

interface StudioMediaGalleryProps {
  title: string;
  description: string;
  tiles: StudioPreviewTile[];
  ctaLabel?: string;
  ctaHref?: string;
  mode?: "grid" | "masonry";
}

export function StudioMediaGallery({
  title,
  description,
  tiles,
  ctaLabel,
  ctaHref,
  mode = "grid",
}: StudioMediaGalleryProps) {
  const isMotion = title === "Cinematic Motion" || title === "Video Worlds";

  return (
    <section className="space-y-4">
      <StudioSectionHeader
        title={title}
        description={description}
        action={
          ctaLabel ? (
            <Link
              href={ctaHref ?? "/studio/apps"}
              className="ethen-liquid-white-button"
            >
              {ctaLabel}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </Link>
          ) : undefined
        }
      />

      {mode === "masonry" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tiles.map((tile) => (
            <StudioMediaTile key={tile.id} tile={tile} />
          ))}
        </div>
      ) : (
        <div className="relative">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((tile, index) => (
              <StudioMediaTile
                key={tile.id}
                tile={tile}
                showPlayIcon={isMotion}
                className={cn(index === 0 && "lg:col-span-2")}
              />
            ))}
          </div>
          {isMotion ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 to-transparent" />
              {ctaLabel ? (
                <div className="absolute inset-x-0 bottom-5 flex justify-center">
                  <Link
                    href={ctaHref ?? "/studio/apps"}
                    className="ethen-liquid-white-button"
                  >
                    {ctaLabel}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                      <path d="M7 17 17 7M9 7h8v8" />
                    </svg>
                  </Link>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
