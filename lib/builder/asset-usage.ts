import type { MediaAsset } from "@/lib/media";

export type AssetInsertionStatus =
  | "inserted"
  | "planned"
  | "setup_required"
  | "not_supported";

export interface AssetUsageRecord {
  assetId: string;
  title: string;
  status: AssetInsertionStatus;
  detail: string;
  filePath: string | null;
  linkedFiles: string[];
  canCopyPath: boolean;
  safeLabel: string;
}

export interface AssetUsageSummary {
  totalAssets: number;
  mockAssets: number;
  realAssets: number;
  insertedAssets: number;
  plannedAssets: number;
  setupRequiredAssets: number;
}

function readLinkedFiles(metadata: Record<string, unknown> | null | undefined): string[] {
  const linked = metadata?.linkedFiles;
  if (!Array.isArray(linked)) return [];
  return linked.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function readFilePath(metadata: Record<string, unknown> | null | undefined): string | null {
  const candidates = [metadata?.filePath, metadata?.assetPath, metadata?.projectAssetPath];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

export function buildAssetUsageRecord(
  asset: MediaAsset,
  input: { repoConnected: boolean },
): AssetUsageRecord {
  const metadata = asset.metadata && typeof asset.metadata === "object"
    ? asset.metadata as Record<string, unknown>
    : null;
  const linkedFiles = readLinkedFiles(metadata);
  const filePath = readFilePath(metadata);

  if (linkedFiles.length > 0 && filePath) {
    return {
      assetId: asset.id,
      title: asset.title ?? asset.id,
      status: "inserted",
      detail: "Repo metadata records a project file path and linked files for this asset.",
      filePath,
      linkedFiles,
      canCopyPath: true,
      safeLabel: "Inserted into tracked project files",
    };
  }

  if (asset.isMock) {
    return {
      assetId: asset.id,
      title: asset.title ?? asset.id,
      status: "planned",
      detail: "This is a mock asset entry. No project file write or insertion record exists.",
      filePath: null,
      linkedFiles: [],
      canCopyPath: false,
      safeLabel: "Planned insertion only",
    };
  }

  if (!input.repoConnected) {
    return {
      assetId: asset.id,
      title: asset.title ?? asset.id,
      status: "setup_required",
      detail: "A connected repo is required before project file insertion can be attempted or tracked.",
      filePath: null,
      linkedFiles: [],
      canCopyPath: false,
      safeLabel: "Setup required",
    };
  }

  return {
    assetId: asset.id,
    title: asset.title ?? asset.id,
    status: "planned",
    detail: "The asset is tracked, but repo-backed file insertion is not implemented yet in this build. Offer copy path or planned insertion only.",
    filePath: null,
    linkedFiles: [],
    canCopyPath: Boolean(asset.url),
    safeLabel: "Copy path / planned insertion",
  };
}

export function summarizeAssetUsage(assets: MediaAsset[], input: { repoConnected: boolean }): AssetUsageSummary {
  const records = assets.map((asset) => buildAssetUsageRecord(asset, input));
  return {
    totalAssets: assets.length,
    mockAssets: assets.filter((asset) => Boolean(asset.isMock)).length,
    realAssets: assets.filter((asset) => !asset.isMock).length,
    insertedAssets: records.filter((record) => record.status === "inserted").length,
    plannedAssets: records.filter((record) => record.status === "planned").length,
    setupRequiredAssets: records.filter((record) => record.status === "setup_required").length,
  };
}
