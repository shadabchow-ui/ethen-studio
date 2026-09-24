import { cn } from "@ethen/ui/lib/utils";

interface ArtifactPanelProps {
  className?: string;
  onClose?: () => void;
}

export function ArtifactPanel({ className, onClose }: ArtifactPanelProps) {
  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col h-full w-[var(--artifact-panel-width)] shrink-0",
        "glass-panel border-l border-[var(--glass-panel-border)]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-[var(--topbar-height)] shrink-0 border-b border-[var(--border-subtle)]">
        <span className="text-sm font-medium text-[var(--text-secondary)]">Artifacts</span>
        <button
          type="button"
          onClick={onClose}
          className="ethen-touch-target w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors text-sm"
          aria-label="Close artifact panel"
        >
          ✕
        </button>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center">
          <span className="text-sm opacity-60">◻</span>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-[var(--text-secondary)]">No artifacts yet</p>
          <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
            Documents, code, reports, and other outputs will appear here.
          </p>
        </div>
      </div>

      {/* Artifact types hint */}
      <div className="px-4 pb-4 shrink-0">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-3 space-y-2">
          <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            Supports
          </p>
          <div className="flex flex-wrap gap-1.5">
            {["Document", "Code", "Table", "Chart", "Image", "JSON"].map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-[var(--radius-full)] bg-[var(--bg-elevated)] text-[11px] text-[var(--text-secondary)]"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
