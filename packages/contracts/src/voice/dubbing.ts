/**
 * packages/contracts/voice/dubbing.ts
 * Dubbing-specific contracts extending the base dubbing step union.
 *
 * These types represent the persisted dubbing job model,
 * with full step outputs stored in each job record.
 */

export type DubbingStep = "upload" | "transcribe" | "translate" | "generate" | "export";

// ─── Job Status ─────────────────────────────────────────────────────────────

export type DubbingJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

// ─── Per-Step Outputs ───────────────────────────────────────────────────────

export interface DubbingUploadStepOutput {
  sourceFileName: string;
  sourceFileSize: number;
  sourceFileUrl: string;
  mimeType: string;
  uploadedAt: string;
}

export interface DubbingTranscribeStepOutput {
  transcribedText: string;
  sourceLanguage: string;
  confidence?: number;
  processingTimeMs?: number;
  completedAt: string;
  provider: string;
  model: string;
}

export interface DubbingTranslateStepOutput {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  completedAt: string;
  provider?: string;
  model?: string;
}

export interface DubbingGenerateStepOutput {
  dubbedAudioUrl: string;
  dubbedAudioFormat: "mp3" | "wav" | "opus";
  durationSeconds: number;
  provider: string;
  model: string;
  voiceId: string;
  completedAt: string;
}

export interface DubbingExportStepOutput {
  exportUrl: string;
  exportFormat: string;
  exportedAt: string;
}

// ─── Full Job Model ─────────────────────────────────────────────────────────

export interface DubbingJob {
  id: string;
  projectId: string;
  userId: string;
  status: DubbingJobStatus;
  steps: DubbingStep[];
  currentStep: DubbingStep | null;
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
  model: string;
  voiceId: string;

  // Step outputs — each is present when that step has been completed
  uploadResult?: DubbingUploadStepOutput;
  transcribeResult?: DubbingTranscribeStepOutput;
  translateResult?: DubbingTranslateStepOutput;
  generateResult?: DubbingGenerateStepOutput;
  exportResult?: DubbingExportStepOutput;

  // Progress tracking
  progress: number; // 0–100
  error?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ─── Request / Response Types ───────────────────────────────────────────────

export interface DubbingJobCreateRequest {
  projectId: string;
  sourceLanguage?: string;
  targetLanguage: string;
  provider?: string;
  model?: string;
  voiceId?: string;
}

export interface DubbingJobCreateResponse {
  ok: boolean;
  job?: DubbingJob;
  error?: string;
}

export interface DubbingJobListResponse {
  ok: boolean;
  jobs: DubbingJob[];
  total: number;
  error?: string;
}

export interface DubbingJobResponse {
  ok: boolean;
  job?: DubbingJob;
  error?: string;
}

export interface DubbingStepResponse {
  ok: boolean;
  jobId: string;
  step: DubbingStep;
  status: DubbingJobStatus;
  result?: DubbingUploadStepOutput | DubbingTranscribeStepOutput | DubbingTranslateStepOutput | DubbingGenerateStepOutput | DubbingExportStepOutput;
  error?: string;
}

// ─── Store Interface ────────────────────────────────────────────────────────

export interface DubbingStore {
  createJob(job: DubbingJob): Promise<DubbingJobCreateResponse>;
  getJob(jobId: string): Promise<DubbingJobResponse>;
  updateJob(jobId: string, updates: Partial<DubbingJob>): Promise<DubbingJobResponse>;
  listJobs(projectId: string): Promise<DubbingJobListResponse>;
  deleteJob(jobId: string): Promise<{ ok: boolean; error?: string }>;
}
