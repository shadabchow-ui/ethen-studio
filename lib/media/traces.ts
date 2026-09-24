// ── Creative Memory Traces & Records ─────────────────────────────────────────
// Typed foundations for consent, generation tracing, export records, and
// moderation results. These connect profiles, assets, projects, and jobs
// without depending on external moderation providers or legal workflows.
//
// All record types are conservative, extensible, and do not overpromise
// enforcement unless the current codebase already enforces it.

import { STORAGE_STATUS_LOCAL_FS } from "./usage";

// ── ConsentRecord ────────────────────────────────────────────────────────────

export type ConsentRecordType =
  | "identity_likeness"
  | "voice_usage"
  | "product_claims"
  | "external_publishing"
  | "data_processing"
  | "custom";

export const CONSENT_RECORD_TYPE_LABELS: Record<ConsentRecordType, string> = {
  identity_likeness: "Identity / Likeness",
  voice_usage: "Voice Usage",
  product_claims: "Product Claims",
  external_publishing: "External Publishing",
  data_processing: "Data Processing",
  custom: "Custom Consent",
};

export type ConsentRecordStatus =
  | "pending"
  | "granted"
  | "denied"
  | "expired"
  | "revoked";

export const CONSENT_RECORD_STATUS_LABELS: Record<ConsentRecordStatus, string> = {
  pending: "Pending",
  granted: "Granted",
  denied: "Denied",
  expired: "Expired",
  revoked: "Revoked",
};

export interface ConsentRecord {
  id: string;
  userId?: string;
  profileId?: string;
  projectId?: string;
  jobId?: string;
  assetIds?: string[];
  type: ConsentRecordType;
  description: string;
  statement: string;
  status: ConsentRecordStatus;
  grantedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  scope: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ── GenerationTrace ──────────────────────────────────────────────────────────

export type GenerationTraceStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "setup_required"
  | "blocked_by_safety";

export const GENERATION_TRACE_STATUS_LABELS: Record<GenerationTraceStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  canceled: "Canceled",
  setup_required: "Setup Required",
  blocked_by_safety: "Blocked by Safety",
};

export interface GenerationTrace {
  id: string;
  jobId: string;
  providerJobId?: string;
  appId?: string;
  toolId?: string;
  providerId?: string;
  modelId?: string;
  inputAssetIds: string[];
  outputAssetIds: string[];
  promptHash?: string;
  promptReference?: string;
  parameters?: Record<string, unknown>;
  status: GenerationTraceStatus;
  progress?: number;
  estimatedCredits?: number;
  chargedCredits?: number;
  error?: string;
  safetyGateResult?: {
    outcome: string;
    categories: string[];
    blocked?: boolean;
    consentAccepted?: boolean;
  };
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── ExportRecord ─────────────────────────────────────────────────────────────

export type ExportFormat =
  | "png"
  | "jpeg"
  | "webp"
  | "mp4"
  | "webm"
  | "mp3"
  | "wav"
  | "json";

export type ExportTarget =
  | "download"
  | "r2_storage"
  | "social_platform"
  | "cdn"
  | "custom";

export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP",
  mp4: "MP4",
  webm: "WebM",
  mp3: "MP3",
  wav: "WAV",
  json: "JSON",
};

export const EXPORT_TARGET_LABELS: Record<ExportTarget, string> = {
  download: "Download",
  r2_storage: "R2 Storage",
  social_platform: "Social Platform",
  cdn: "CDN",
  custom: "Custom",
};

export interface ExportRecord {
  id: string;
  userId?: string;
  projectId?: string;
  assetIds: string[];
  profileId?: string;
  format: ExportFormat;
  target: ExportTarget;
  targetConfig?: {
    platform?: string;
    aspectRatio?: string;
    quality?: "draft" | "standard" | "high";
    maxSizeBytes?: number;
    additionalPresets?: string[];
  };
  status: "pending" | "in_progress" | "completed" | "failed";
  outputUrl?: string;
  storageKey?: string;
  sizeBytes?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// ── ModerationResult ─────────────────────────────────────────────────────────

export type ModerationRiskLevel = "none" | "low" | "medium" | "high" | "critical";

export const MODERATION_RISK_LEVEL_LABELS: Record<ModerationRiskLevel, string> = {
  none: "No Risk",
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
  critical: "Critical Risk",
};

export type ModerationDecision =
  | "allow"
  | "flag_for_review"
  | "require_consent"
  | "block"
  | "needs_human_review";

export const MODERATION_DECISION_LABELS: Record<ModerationDecision, string> = {
  allow: "Allow",
  flag_for_review: "Flag for Review",
  require_consent: "Require Consent",
  block: "Block",
  needs_human_review: "Needs Human Review",
};

export type ModerationTrigger =
  | "face_detected"
  | "voice_sample"
  | "public_figure"
  | "minor_likeness"
  | "impersonation"
  | "deceptive_content"
  | "product_claim"
  | "copyrighted_content"
  | "nsfw_content"
  | "custom_rule";

export const MODERATION_TRIGGER_LABELS: Record<ModerationTrigger, string> = {
  face_detected: "Face Detected",
  voice_sample: "Voice Sample",
  public_figure: "Public Figure",
  minor_likeness: "Minor Likeness",
  impersonation: "Impersonation Risk",
  deceptive_content: "Deceptive Content",
  product_claim: "Product Claim",
  copyrighted_content: "Copyrighted Content",
  nsfw_content: "NSFW Content",
  custom_rule: "Custom Rule",
};

export interface ModerationResult {
  id: string;
  userId?: string;
  profileId?: string;
  projectId?: string;
  jobId?: string;
  assetIds?: string[];
  provider: "local_preflight" | "openai" | "custom" | string;
  modelId?: string;
  status: "pending" | "completed" | "failed" | "setup_required";
  decision: ModerationDecision;
  riskLevel: ModerationRiskLevel;
  triggers: ModerationTrigger[];
  scores?: Record<string, number>;
  notes?: string[];
  requiresConsent: boolean;
  requiresApproval: boolean;
  createdAt: string;
  resolvedAt?: string;
}

// ── In-memory store ──────────────────────────────────────────────────────────

let traces: GenerationTrace[] = [];
let consentRecords: ConsentRecord[] = [];
let exportRecords: ExportRecord[] = [];
let moderationResults: ModerationResult[] = [];

let nextTraceId = 1;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${nextTraceId++}`;
}

function nIso(): string {
  return new Date().toISOString();
}

// ── Generation traces ────────────────────────────────────────────────────────

export function seedMockGenerationTraces(): GenerationTrace[] {
  const seeded: GenerationTrace[] = [
    {
      id: generateId("trace"),
      jobId: "mock-job-1",
      providerJobId: "mock-provider-job-1",
      appId: "create-image",
      toolId: "media.generate_image",
      providerId: "openai",
      modelId: "dall-e-3",
      inputAssetIds: [],
      outputAssetIds: [],
      promptHash: undefined,
      promptReference: "mock-prompt-ref",
      parameters: { quality: "standard", style: "photoreal", aspectRatio: "1:1" },
      status: "setup_required",
      estimatedCredits: 4,
      createdAt: nIso(),
      updatedAt: nIso(),
    },
  ];
  traces = seeded;
  return seeded;
}

export function getGenerationTraces(): GenerationTrace[] {
  return [...traces];
}

export function getGenerationTraceById(id: string): GenerationTrace | undefined {
  return traces.find((t) => t.id === id);
}

export function getTracesByJob(jobId: string): GenerationTrace[] {
  return traces.filter((t) => t.jobId === jobId);
}

export function addGenerationTrace(trace: Omit<GenerationTrace, "id" | "createdAt" | "updatedAt">): GenerationTrace {
  const now = nIso();
  const created: GenerationTrace = { ...trace, id: generateId("trace"), createdAt: now, updatedAt: now };
  traces.unshift(created);
  return created;
}

export function updateGenerationTrace(id: string, patch: Partial<GenerationTrace>): GenerationTrace | null {
  const idx = traces.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  traces[idx] = { ...traces[idx], ...patch, updatedAt: nIso() };
  return { ...traces[idx] };
}

export function clearTraces(): void {
  traces = [];
}

// ── Consent records ──────────────────────────────────────────────────────────

export function seedMockConsentRecords(): ConsentRecord[] {
  const seeded: ConsentRecord[] = [
    {
      id: generateId("consent"),
      profileId: undefined,
      type: "identity_likeness",
      description: "Consent for using synthetic creator likeness in internal ideation.",
      statement: "I confirm I have permission to use this person's likeness for this generation.",
      status: "pending",
      scope: ["internal_ideation"],
      createdAt: nIso(),
      updatedAt: nIso(),
    },
  ];
  consentRecords = seeded;
  return seeded;
}

export function getConsentRecords(): ConsentRecord[] {
  return [...consentRecords];
}

export function getConsentRecordById(id: string): ConsentRecord | undefined {
  return consentRecords.find((c) => c.id === id);
}

export function getConsentRecordsForProfile(profileId: string): ConsentRecord[] {
  return consentRecords.filter((c) => c.profileId === profileId);
}

export function addConsentRecord(record: Omit<ConsentRecord, "id" | "createdAt" | "updatedAt">): ConsentRecord {
  const now = nIso();
  const created: ConsentRecord = { ...record, id: generateId("consent"), createdAt: now, updatedAt: now };
  consentRecords.unshift(created);
  return created;
}

export function updateConsentRecord(id: string, patch: Partial<ConsentRecord>): ConsentRecord | null {
  const idx = consentRecords.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  consentRecords[idx] = { ...consentRecords[idx], ...patch, updatedAt: nIso() };
  return { ...consentRecords[idx] };
}

export function clearConsentRecords(): void {
  consentRecords = [];
}

// ── Export records ───────────────────────────────────────────────────────────

export function getExportRecords(): ExportRecord[] {
  return [...exportRecords];
}

export function getExportRecordById(id: string): ExportRecord | undefined {
  return exportRecords.find((e) => e.id === id);
}

export function addExportRecord(record: Omit<ExportRecord, "id" | "createdAt">): ExportRecord {
  const created: ExportRecord = { ...record, id: generateId("export"), createdAt: nIso() };
  exportRecords.unshift(created);
  return created;
}

export function clearExportRecords(): void {
  exportRecords = [];
}

// ── Moderation results ───────────────────────────────────────────────────────

export function seedMockModerationResults(): ModerationResult[] {
  const seeded: ModerationResult[] = [
    {
      id: generateId("mod"),
      provider: "local_preflight",
      status: "setup_required",
      decision: "flag_for_review",
      riskLevel: "medium",
      triggers: ["face_detected"],
      requiresConsent: true,
      requiresApproval: false,
      notes: ["Face detection triggered — consent required before generation. Mock moderation only."],
      createdAt: nIso(),
    },
  ];
  moderationResults = seeded;
  return seeded;
}

export function getModerationResults(): ModerationResult[] {
  return [...moderationResults];
}

export function getModerationResultById(id: string): ModerationResult | undefined {
  return moderationResults.find((m) => m.id === id);
}

export function getModerationResultsForJob(jobId: string): ModerationResult[] {
  return moderationResults.filter((m) => m.jobId === jobId);
}

export function addModerationResult(result: Omit<ModerationResult, "id" | "createdAt">): ModerationResult {
  const created: ModerationResult = { ...result, id: generateId("mod"), createdAt: nIso() };
  moderationResults.unshift(created);
  return created;
}

export function clearModerationResults(): void {
  moderationResults = [];
}

// ── Durability ───────────────────────────────────────────────────────────────

export const TRACE_STORE_DURABILITY = STORAGE_STATUS_LOCAL_FS;
export const CONSENT_STORE_DURABILITY = STORAGE_STATUS_LOCAL_FS;
export const EXPORT_STORE_DURABILITY = STORAGE_STATUS_LOCAL_FS;
export const MODERATION_STORE_DURABILITY = STORAGE_STATUS_LOCAL_FS;

// ─── Durable storage hooks (called by server-side sync layer) ────────────

export function hydrateTraceStore(newTraces: GenerationTrace[], newNextId: number): void {
  traces = newTraces;
  nextTraceId = newNextId;
}

export function snapshotTraceStore(): GenerationTrace[] {
  return [...traces];
}

export function hydrateConsentStore(newRecords: ConsentRecord[]): void {
  consentRecords = newRecords;
}

export function snapshotConsentStore(): ConsentRecord[] {
  return [...consentRecords];
}

export function hydrateExportStore(newRecords: ExportRecord[]): void {
  exportRecords = newRecords;
}

export function snapshotExportStore(): ExportRecord[] {
  return [...exportRecords];
}

export function hydrateModerationStore(newResults: ModerationResult[]): void {
  moderationResults = newResults;
}

export function snapshotModerationStore(): ModerationResult[] {
  return [...moderationResults];
}

export function snapshotTraceNextId(): number {
  return nextTraceId;
}
