import Link from "next/link";
import { StudioSectionHeader } from "./StudioSectionHeader";
import { StudioMediaTile } from "./StudioMediaTile";
import { FEATURED_TILES } from "./studio-home-data";

export function StudioHeroRail() {
  return (
    <section className="space-y-4">
      <StudioSectionHeader
        title="Featured Studio Picks"
        description="Hand-selected generations across the Ethen creative stack."
        action={
          <Link
            href="/studio/apps"
            className="ethen-liquid-white-button"
          >
            Browse all
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </Link>
        }
      />
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {FEATURED_TILES.map((tile) => (
          <StudioMediaTile key={tile.id} tile={tile} />
        ))}
      </div>
    </section>
  );
}
