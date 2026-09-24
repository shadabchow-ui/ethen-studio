import type { MediaJob, MediaModality, MediaEvalScores, MediaEvalMetadata } from "./types";

/**
 * DEPRECATED for live product surfaces (Studio Job 05): hash-derived mock
 * scores must never inform routing, acceptance, or repair. Use the versioned
 * rubrics in `eval-rubrics.ts` plus `evaluation-service.ts`, which persist
 * inspectable evidence. Kept only for the media contract test that pins the
 * legacy shape — do not call from product code.
 */

// ── Evaluation score definitions ─────────────────────────────────────────

export interface EvalScoreDefinition {
  key: keyof MediaEvalScores;
  label: string;
  description: string;
  applicableModalities: MediaModality[];
  scoreRange: [number, number];
}

export const EVAL_SCORE_DEFINITIONS: EvalScoreDefinition[] = [
  {
    key: "imageQuality",
    label: "Image Quality",
    description: "Overall visual quality including sharpness, color accuracy, and composition.",
    applicableModalities: ["image"],
    scoreRange: [0, 100],
  },
  {
    key: "promptAdherence",
    label: "Prompt Adherence",
    description: "How closely the generated media matches the prompt description.",
    applicableModalities: ["image", "video", "audio"],
    scoreRange: [0, 100],
  },
  {
    key: "videoCoherence",
    label: "Video Coherence",
    description: "Temporal consistency across frames, absence of flicker or artifacts.",
    applicableModalities: ["video"],
    scoreRange: [0, 100],
  },
  {
    key: "motionQuality",
    label: "Motion Quality",
    description: "Naturalness and smoothness of motion in generated video.",
    applicableModalities: ["video"],
    scoreRange: [0, 100],
  },
  {
    key: "identityConsistency",
    label: "Identity Consistency",
    description: "Consistency of character identity across multiple generations.",
    applicableModalities: ["image", "video"],
    scoreRange: [0, 100],
  },
  {
    key: "audioQuality",
    label: "Audio Quality",
    description: "Clarity, naturalness, and absence of artifacts in generated audio.",
    applicableModalities: ["audio"],
    scoreRange: [0, 100],
  },
  {
    key: "latency",
    label: "Latency",
    description: "Time from request to completion in milliseconds.",
    applicableModalities: ["image", "video", "audio"],
    scoreRange: [0, 60000],
  },
  {
    key: "estimatedCost",
    label: "Estimated Cost",
    description: "Estimated credit cost for the generation.",
    applicableModalities: ["image", "video", "audio"],
    scoreRange: [0, 100],
  },
  {
    key: "userSatisfaction",
    label: "User Satisfaction",
    description: "Placeholder for user feedback rating.",
    applicableModalities: ["image", "video", "audio"],
    scoreRange: [0, 5],
  },
];

// ── Mock evaluation generation ───────────────────────────────────────────

export function getApplicableScores(modality: MediaModality): EvalScoreDefinition[] {
  return EVAL_SCORE_DEFINITIONS.filter((d) => d.applicableModalities.includes(modality));
}

export function generateMockScores(job: MediaJob): MediaEvalScores {
  const applicable = getApplicableScores(job.modality);
  const baseHash = hashString(job.id);

  const scores: MediaEvalScores = {
    overall: 50 + (baseHash % 50),
    relevance: 40 + (hashString(job.id + "rel") % 60),
    coherence: 45 + (hashString(job.id + "coh") % 55),
    safety: 70 + (hashString(job.id + "safe") % 30),
  };

  for (const def of applicable) {
    const [min, max] = def.scoreRange;
    const hash = hashString(job.id + def.key);
    (scores as unknown as Record<string, number | null | undefined>)[def.key] = Math.round(min + (hash % (max - min)));
  }

  return scores;
}

export function generateMockEvalMetadata(job: MediaJob): MediaEvalMetadata {
  return {
    jobId: job.id,
    modality: job.modality,
    scores: generateMockScores(job),
    notes: ["Mock evaluation — not from real eval provider."],
    label: "Mock evaluation — not from real eval",
    generatedAt: new Date().toISOString(),
    isMock: true,
  };
}

export function formatScore(score: number | null | undefined, max: number): string {
  if (score == null) return "N/A";
  return `${score}/${max}`;
}

export function scoreToPercent(score: number | null | undefined, max: number): number {
  if (score == null || max === 0) return 0;
  return Math.round((score / max) * 100);
}

export function scoreTone(percent: number): "success" | "warning" | "danger" | "muted" {
  if (percent >= 75) return "success";
  if (percent >= 50) return "warning";
  if (percent >= 25) return "danger";
  return "muted";
}

// ── Simple hash for deterministic mock scores ────────────────────────────

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
