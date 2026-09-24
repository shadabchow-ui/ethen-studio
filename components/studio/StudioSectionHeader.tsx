import type { ReactNode } from "react";

interface StudioSectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  centered?: boolean;
}

export function StudioSectionHeader({
  title,
  description,
  action,
  centered = false,
}: StudioSectionHeaderProps) {
  return (
    <div className={centered ? "text-center" : "flex items-end justify-between gap-6"}>
      <div className={centered ? "" : "min-w-0"}>
        <h2 className="text-[21px] tracking-[-0.015em] text-[var(--text-primary)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 text-[13px] leading-5 text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {!centered && action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
