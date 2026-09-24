"use client";

import { useEffect, useMemo, useState } from "react";
import type { MediaAsset } from "@/lib/media";
import {
  buildAssetUsageRecord,
  summarizeAssetUsage,
} from "@/lib/builder/asset-usage";

interface AssetUsagePanelProps {
  repoConnected: boolean;
  asset?: MediaAsset | null;
  compact?: boolean;
}

interface AssetResponse {
  ok: boolean;
  assets?: MediaAsset[];
}

export function AssetUsagePanel({
  repoConnected,
  asset,
  compact = false,
}: AssetUsagePanelProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);

  useEffect(() => {
    if (asset) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/media/assets");
        const body = await response.json() as AssetResponse;
        if (cancelled) return;
        setAssets(Array.isArray(body.assets) ? body.assets : []);
      } catch {
        if (!cancelled) setAssets([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  const singleRecord = useMemo(
    () => (asset ? buildAssetUsageRecord(asset, { repoConnected }) : null),
    [asset, repoConnected],
  );
  const summary = useMemo(
    () => summarizeAssetUsage(asset ? [asset] : assets, { repoConnected }),
    [asset, assets, repoConnected],
  );

  return (
    <section className="rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)]/38">
            Studio Asset Bridge
          </p>
          <h3 className="mt-1 text-[13px] font-medium text-[var(--text-primary)]/82">
            {asset ? "Selected asset usage" : "Project asset usage"}
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-primary)]/42">
            Assets are tracked as project artifacts. Repo file insertion is only claimed when a real file path and linked files exist.
          </p>
        </div>
        <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-2 py-1 text-[10px] font-medium text-amber-300/80">
          {asset ? singleRecord?.safeLabel ?? "usage pending" : `${summary.totalAssets} tracked`}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Real assets" value={`${summary.realAssets}`} />
        <Metric label="Mock assets" value={`${summary.mockAssets}`} />
        <Metric label="Inserted" value={`${summary.insertedAssets}`} />
        <Metric label="Planned / setup" value={`${summary.plannedAssets + summary.setupRequiredAssets}`} />
      </div>

      {singleRecord ? (
        <div className="mt-3 space-y-2">
          <UsageRow label="Status" value={singleRecord.safeLabel} />
          <UsageRow label="Project file path" value={singleRecord.filePath ?? "No project file path recorded"} />
          <UsageRow
            label="Linked files"
            value={singleRecord.linkedFiles.length > 0 ? singleRecord.linkedFiles.join(", ") : "No linked files recorded"}
          />
          <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]/30">
              Truth label
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-primary)]/46">
              {singleRecord.detail}
            </p>
            {singleRecord.canCopyPath && (
              <p className="mt-1 text-[10px] text-[var(--text-primary)]/28">
                Copy the tracked asset URL/path manually until repo-backed insertion exists.
              </p>
            )}
          </div>
        </div>
      ) : !compact ? (
        <div className="mt-3 space-y-2">
          <UsageRow label="Insertion truth" value="Planned insertion only unless linked files are recorded" />
          <UsageRow label="Storage truth" value="Local/private-beta asset storage, not production-durable hosting" />
          <UsageRow label="Repo handoff" value={repoConnected ? "Copy path or plan insertion" : "Setup required: connect repo bridge"} />
          <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]/30">
              Claims intentionally avoided
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-primary)]/46">
              This panel never claims assets were inserted into project files, deployed, or synced to design tools unless the repo exposes those facts directly. Repo-backed file insertion is not implemented yet.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-[0.10em] text-[var(--text-primary)]/24">{label}</p>
      <p className="mt-1 text-[11px] font-medium text-[var(--text-primary)]/72">{value}</p>
    </div>
  );
}

function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
      <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-primary)]/28">{label}</span>
      <span className="text-right text-[11px] leading-relaxed text-[var(--text-primary)]/52">{value}</span>
    </div>
  );
}
