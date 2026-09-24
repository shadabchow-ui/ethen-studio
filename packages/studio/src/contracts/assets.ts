/** Studio V5 kernel — assets: logical item + immutable version + lineage edges. */
import type { ProjectScope } from "./scope";

export type AssetKind = "image" | "video" | "audio" | "transcript" | "document" | "package";
export type AssetProcessingState =
  | "QUARANTINED"
  | "SCANNING"
  | "NORMALIZING"
  | "CUSTODY"
  | "AVAILABLE"
  | "TOMBSTONED";

export interface AssetVersion {
  assetId: string;
  version: number;
  scope: ProjectScope;
  kind: AssetKind;
  storageKey: string;
  sha256: string;
  byteSize: number;
  mediaMetadata: Readonly<Record<string, unknown>>;
  origin: string;
  rightsSnapshotId: string | null;
  processingState: AssetProcessingState;
  createdAt: string;
}

export interface LineageEdge {
  parentAssetId: string;
  parentVersion: number;
  childAssetId: string;
  childVersion: number;
  transform: string;
  jobId: string | null;
}
