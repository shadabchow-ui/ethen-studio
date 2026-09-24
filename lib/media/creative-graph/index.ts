/**
 * Studio V2 Job 01 — canonical durable creative graph.
 * Single import surface for contracts, service, and legacy import.
 */
export {
  CREATIVE_DOCUMENT_TABLES,
  STUDIO_IDEMPOTENCY_CONFLICT,
  STUDIO_NOT_FOUND,
  STUDIO_REVISION_CONFLICT,
  STUDIO_SCOPE_REQUIRED,
  assertExpectedRevision,
  assertIdempotencyKey,
  formatRevisionRef,
  isNotFound,
  isRevisionConflict,
  parseRevisionRef,
  type CreativeDocumentKind,
  type CreativeDocumentTable,
  type LockableEntityKind,
  type RevisionRef,
  type StudioActionEnvelope,
  type StudioCommandEnvelope,
  type StudioEventEnvelope,
} from "./envelopes";
export {
  createDocument,
  ensureStudioProject,
  lockDecision,
  readProjectGraph,
  updateDocument,
  type DecisionLockInput,
  type DecisionLockResult,
  type DocumentInput,
  type DocumentResult,
  type ProjectGraphSummary,
} from "./service";
export {
  adaptSnapshotAssets,
  adaptSnapshotProjects,
  applyLegacyImport,
  legacyContentHash,
  planLegacyImport,
  stableImportKey,
  type ImportReport,
  type LegacyManifest,
  type LegacyRecord,
  type LegacySource,
  type OwnershipAttestation,
} from "./legacy-import";
export {
  presentAsset,
  presentDocument,
  presentEvent,
  presentLock,
  type PresentedAsset,
  type PresentedDocument,
  type PresentedEvent,
  type PresentedLock,
} from "./presenters";
