// ── Media Studio readiness status ─────────────────────────────────────────

export type ReadinessState =
  | "implemented"
  | "mock-only"
  | "setup-required"
  | "blocked"
  | "contract-only"
  | "planned";

export interface ReadinessEntry {
  surface: string;
  state: ReadinessState;
  description: string;
  nextWork: string;
}

export const MEDIA_STUDIO_READINESS: ReadinessEntry[] = [
  {
    surface: "Media Workspace shell",
    state: "implemented",
    description: "Full workspace with mode chips, prompt composer, model picker, generation controls.",
    nextWork: "Wire real provider calls behind generate button.",
  },
  {
    surface: "Media model registry",
    state: "mock-only",
    description: "Static model definitions with estimated credits. All marked contract-only or setup-required.",
    nextWork: "Map models to provider adapters; add runtime model discovery.",
  },
  {
    surface: "Media job lifecycle",
    state: "implemented",
    description: "Full lifecycle: queued → planning → running → processing → completed/failed/canceled/expired. In-memory store.",
    nextWork: "Add persistent storage; wire real provider execution.",
  },
  {
    surface: "Mock generation",
    state: "implemented",
    description: "Synchronous and async mock generation with progress simulation and placeholder assets.",
    nextWork: "Replace mock with real provider routing.",
  },
  {
    surface: "Provider registry",
    state: "implemented",
    description: "Provider adapter pattern with mock, cortex, and 9 setup-required shims. Cost estimation, availability checks, status snapshots.",
    nextWork: "Implement real adapters for openai, replicate, fal, elevenlabs, runway.",
  },
  {
    surface: "Provider status",
    state: "implemented",
    description: "Per-provider status with trust labels (live, mock, setup_required, not_provided). Get-all-status API.",
    nextWork: "Add provider health check polling.",
  },
  {
    surface: "Safety gate",
    state: "implemented",
    description: "Inference-only safety classifier covering 13 categories. Read → Propose → Execute gating. Consent and block flows.",
    nextWork: "Add real content moderation API integration.",
  },
  {
    surface: "Safety audit trace",
    state: "implemented",
    description: "Full audit trace with prompt metadata, provider metadata, safety gate results, consent tracking.",
    nextWork: "Persist audit traces to database.",
  },
  {
    surface: "Pricing estimates",
    state: "mock-only",
    description: "Honest credit estimates labeled as estimates. No real provider pricing integrated.",
    nextWork: "Integrate real provider pricing when APIs are configured.",
  },
  {
    surface: "Evaluation metadata",
    state: "mock-only",
    description: "Structured eval score types and mock score generators. Clearly labeled as mock/evaluation preview.",
    nextWork: "Wire real eval providers (model-graded, human-in-loop, automated metrics).",
  },
  {
    surface: "Product-grade state views",
    state: "implemented",
    description: "All major states represented: loading, empty, generating, processing, awaiting approval, completed, failed, canceled, expired, setup-required, provider-unavailable.",
    nextWork: "Add state transitions based on real provider responses.",
  },
  {
    surface: "Trust labels",
    state: "implemented",
    description: "Consistent labels: mock preview, setup required, contract only, planned, live.",
    nextWork: "Update labels dynamically based on provider availability checks.",
  },
  {
    surface: "Media composer",
    state: "implemented",
    description: "Full prompt composer with mode chips, starter actions, and generation button states.",
    nextWork: "Wire to real generation pipeline.",
  },
  {
    surface: "Result cards & inspector",
    state: "implemented",
    description: "Image/video/audio result cards with metadata display and safety inspector.",
    nextWork: "Wire to real asset URLs from providers.",
  },
  {
    surface: "Production deployment",
    state: "blocked",
    description: "All generation uses mock provider. Real providers require API key configuration.",
    nextWork: "Configure at least one real image, video, and audio provider.",
  },
];

// ── Summary helpers ──────────────────────────────────────────────────────

export function getReadinessSummary(): {
  implemented: number;
  mockOnly: number;
  setupRequired: number;
  blocked: number;
  contractOnly: number;
  planned: number;
  total: number;
} {
  const counts = { implemented: 0, mockOnly: 0, setupRequired: 0, blocked: 0, contractOnly: 0, planned: 0 };
  for (const entry of MEDIA_STUDIO_READINESS) {
    if (entry.state === "mock-only") counts.mockOnly++;
    else if (entry.state in counts) {
      (counts as Record<string, number>)[entry.state]++;
    }
  }
  return { ...counts, total: MEDIA_STUDIO_READINESS.length };
}

export function getReadinessByState(state: ReadinessState): ReadinessEntry[] {
  return MEDIA_STUDIO_READINESS.filter((e) => e.state === state);
}
