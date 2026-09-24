import { StudioSectionHeader } from "./StudioSectionHeader";
import { VIRAL_PRESETS } from "./studio-home-data";

export function StudioChipCloud() {
  return (
    <section className="space-y-4">
      <StudioSectionHeader
        title="Viral Presets"
        description="Big-budget looks, from explosions to surreal transformations."
      />
      <div className="flex flex-wrap gap-2">
        {VIRAL_PRESETS.map((preset, index) => (
          <span
            key={preset}
            className={
              index === 0
                ? "rounded-[7px] bg-[var(--accent)] px-3 py-2 text-[11.5px] font-medium text-[var(--accent-fg)]"
                : "rounded-[7px] bg-[var(--bg-elevated)] px-3 py-2 text-[11.5px] text-[var(--text-secondary)]"
            }
          >
            {preset}
          </span>
        ))}
      </div>
    </section>
  );
}
