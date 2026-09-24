import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StudioPreviewTile } from "./studio-home-data";

interface StudioPromoBannerProps {
  eyebrow?: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref?: string;
  variant: "supercomputer" | "marketing" | "canvas";
  previews?: StudioPreviewTile[];
}

function BannerPreview({
  tile,
  className,
}: {
  tile?: StudioPreviewTile;
  className?: string;
}) {
  const isVideo = tile?.mediaType === "video" && Boolean(tile.videoUrl);

  return (
    <div className={cn("relative overflow-hidden rounded-[11px] bg-[var(--bg-surface)]", className)}>
      <div className={cn("absolute inset-0", tile?.tone ?? "bg-[var(--bg-inset)]")} />
      {tile?.imageUrl ? (
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
      <div className="absolute inset-0 bg-[var(--bg-elevated)]/30" />
    </div>
  );
}

function SupercomputerBanner({
  title,
  description,
  ctaLabel,
  ctaHref,
  previews = [],
}: Omit<StudioPromoBannerProps, "variant">) {
  return (
    <section className="relative ethen-panel-smoked rounded-[22px]">
      {previews[0] ? (
        previews[0].mediaType === "video" && previews[0].videoUrl ? (
          <video
            src={previews[0].videoUrl}
            poster={previews[0].posterUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={previews[0].imageAlt}
            className="absolute inset-0 h-full w-full object-cover opacity-28"
          />
        ) : previews[0].imageUrl ? (
          <img
            src={previews[0].imageUrl}
            alt={previews[0].imageAlt}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover opacity-28"
          />
        ) : null
      ) : null}
      <div className="absolute left-[7%] top-[24%] hidden w-[215px] rounded-[14px] bg-[var(--bg-surface)]/90 p-[13px] shadow-[0_12px_40px_rgba(0,0,0,0.5)] lg:block">
        <div className="mb-2.5 flex items-center justify-between text-[11.5px] text-[var(--text-primary)]">
          <span>UGC Creator</span>
          <span className="text-[10px] text-[var(--text-secondary)]">2 / 2</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <BannerPreview tile={previews[1] ?? previews[0]} className="h-[62px]" />
          <BannerPreview tile={previews[2] ?? previews[0]} className="h-[62px]" />
        </div>
        <div className="mt-2.5 rounded-[8px] bg-[var(--bg-elevated)] px-2 py-1.5 text-center text-[11px] text-[var(--text-primary)]">
          UGC
        </div>
      </div>
      <div className="absolute right-[8%] top-[20%] hidden w-[200px] rounded-[14px] bg-[var(--bg-surface)]/90 p-[13px] shadow-[0_12px_40px_rgba(0,0,0,0.5)] lg:block">
        <p className="mb-2 text-[11.5px] text-[var(--text-primary)]">Marketing</p>
        <div className="flex gap-1.5">
          <div className="h-[54px] w-[54px] rounded-[8px] bg-[var(--bg-inset)]" />
          <p className="text-[10.5px] leading-[1.45] text-[var(--text-secondary)]">
            Analyzing hooks across 970 reference videos…
          </p>
        </div>
        <div className="mt-2.5 inline-flex rounded-[7px] bg-[var(--accent)] px-2 py-1 text-[10.5px] font-semibold text-[var(--accent-fg)]">
          Analyzing hooks
        </div>
      </div>
      <div className="absolute bottom-[9%] right-[12%] hidden w-[230px] rounded-[14px] bg-[var(--bg-surface)]/90 p-[13px] shadow-[0_12px_40px_rgba(0,0,0,0.5)] lg:block">
        <div className="mb-2 flex items-center justify-between text-[11.5px] text-[var(--text-primary)]">
          <span>Production</span>
          <span className="text-[10px] text-[var(--text-secondary)]">Scene 04 · 11 shots</span>
        </div>
        <div className="h-[64px] rounded-[8px] bg-[var(--bg-inset)]" />
      </div>
      <div className="relative flex min-h-[440px] items-center justify-center px-6 text-center">
        <div>
          <h2 className="text-[40px] tracking-[-0.02em] text-[var(--text-primary)] drop-shadow-[0_0_40px_var(--border-strong)] sm:text-[48px]">
            {title}
          </h2>
          <p className="mt-2 text-[14px] text-[var(--text-secondary)]">{description}</p>
          <Link
            href={ctaHref ?? "/studio/apps"}
            className="mt-5 ethen-liquid-white-button"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

function SideVisualBanner({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaHref,
  previews,
  titleClassName,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref?: string;
  previews: StudioPreviewTile[];
  titleClassName?: string;
}) {
  return (
    <section className="relative ethen-panel-smoked rounded-[22px]">
      <div className="absolute inset-y-0 right-0 hidden w-[58%] grid-cols-3 gap-2.5 p-[18px] md:grid">
        {previews.map((tile) => (
          <BannerPreview key={tile.id} tile={tile} />
        ))}
      </div>
      <div className="relative flex min-h-[340px] max-w-[500px] flex-col justify-center px-8 py-10 sm:px-12">
        {eyebrow ? (
          <p className="text-[11px] font-semibold tracking-[0.12em] text-[var(--text-secondary)]">{eyebrow}</p>
        ) : null}
        <h2 className={titleClassName ?? "mt-3 text-[32px]  leading-[1.1] tracking-[-0.02em] text-[var(--text-primary)]"}>
          {title}
        </h2>
        <p className="mt-3.5 text-[13.5px] leading-6 text-[var(--text-secondary)]">{description}</p>
        <Link
          href={ctaHref ?? "/studio/apps"}
          className="mt-6 ethen-liquid-white-button"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}

export function StudioPromoBanner({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaHref,
  variant,
  previews,
}: StudioPromoBannerProps) {
  if (variant === "supercomputer") {
    return (
      <SupercomputerBanner
        title={title}
        description={description}
        ctaLabel={ctaLabel}
        ctaHref={ctaHref}
        previews={previews}
      />
    );
  }

  if (variant === "marketing") {
    return (
      <SideVisualBanner
        eyebrow={eyebrow}
        title={title}
        description={description}
        ctaLabel={ctaLabel}
        ctaHref={ctaHref}
        previews={previews ?? []}
      />
    );
  }

  return (
    <SideVisualBanner
      eyebrow={eyebrow}
      title={title}
      description={description}
      ctaLabel={ctaLabel}
      ctaHref={ctaHref}
      previews={previews ?? []}
      titleClassName="mt-3 text-[34px] font-bold leading-[1.08] tracking-[-0.02em] text-[var(--text-primary)]"
    />
  );
}
