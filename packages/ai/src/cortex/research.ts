import type { CortexRouteProfile, ToolClass } from "./types";
import { getCortexRouteProfile } from "./routes";
import { mockAnswer } from "../research/mock-provider";
import type {
  AnswerFormState,
  ResearchResult,
  ResearchSource,
  EvidenceRow,
} from "../research/types";

export interface CortexResearchSource {
  index: number;
  title: string;
  url: string;
  domain: string;
  publishedDate?: string;
  snippet?: string;
}

export interface CortexResearchEvidence {
  id: string;
  finding: string;
  sourceIndex?: number;
  sourceTitle?: string;
  sourceUrl?: string;
  status?: string;
  confidence?: string;
}

export interface CortexResearchInput {
  mode: "search" | "answer" | "contents" | "agent";
  query: string;
  provider: "exa" | "mock";
  sources: CortexResearchSource[];
  evidence: CortexResearchEvidence[];
  answerText?: string;
  outputFormat?: string;
}

export interface CortexResearchReceipt {
  route: string;
  mode: string;
  provider: string;
  query: string;
  sourceCount: number;
  evidenceCount: number;
  sourceGrounded: boolean;
  citationsAvailable: boolean;
  freshnessCheckable: boolean;
  verifierRecommended: boolean;
  confidence: "low" | "medium" | "high" | "unknown";
  generatedAt: string;
}

export function getResearchRouteProfile(): CortexRouteProfile | null {
  return getCortexRouteProfile("research");
}

const RESEARCH_MODE_TO_TOOL_CLASS: Record<CortexResearchInput["mode"], ToolClass> = {
  search: "search",
  answer: "search",
  contents: "retrieval",
  agent: "search",
};

export function getResearchToolClass(mode: CortexResearchInput["mode"]): ToolClass {
  return RESEARCH_MODE_TO_TOOL_CLASS[mode];
}

function mapSources(sources: ResearchSource[]): CortexResearchSource[] {
  return sources.map((s, idx) => ({
    index: idx + 1,
    title: s.title,
    url: s.url,
    domain: s.domain,
    publishedDate: s.publishedDate,
    snippet: s.snippet,
  }));
}

function mapEvidence(
  evidence: EvidenceRow[],
  sources: CortexResearchSource[]
): CortexResearchEvidence[] {
  const indexBySourceUrl = new Map(sources.map((s) => [s.url, s.index]));
  return evidence.map((e) => ({
    id: e.id,
    finding: e.finding,
    sourceIndex: e.sourceUrl ? indexBySourceUrl.get(e.sourceUrl) : undefined,
    sourceTitle: e.sourceTitle,
    sourceUrl: e.sourceUrl,
    status: e.status,
    confidence: e.confidence,
  }));
}

/**
 * Derive the Cortex research input shape from an actually-executed research
 * result. Only the sources/evidence the provider (Exa or mock fixtures)
 * returned are reflected — this never infers grounding from query text or
 * policy intent.
 */
export function buildResearchInputFromResult(params: {
  query: string;
  provider: "exa" | "mock";
  result: ResearchResult;
}): CortexResearchInput {
  const { query, provider, result } = params;

  if (result.mode === "search") {
    const sources = mapSources(
      result.results.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        domain: r.domain,
        publishedDate: r.publishedDate,
        snippet: r.snippet,
      }))
    );
    return { mode: "search", query, provider, sources, evidence: [] };
  }

  if (result.mode === "answer") {
    const sources = mapSources(result.result.sources);
    return {
      mode: "answer",
      query,
      provider,
      sources,
      evidence: mapEvidence(result.result.evidence, sources),
      answerText: result.result.answer || undefined,
    };
  }

  if (result.mode === "contents") {
    const sources = mapSources(result.result.sources);
    return {
      mode: "contents",
      query: query || result.result.url,
      provider,
      sources,
      evidence: mapEvidence(result.result.evidence, sources),
    };
  }

  const sources = mapSources(result.result.sources);
  return {
    mode: "agent",
    query: query || result.result.objective,
    provider,
    sources,
    evidence: mapEvidence(result.result.evidence, sources),
    answerText: result.result.report || undefined,
    outputFormat: result.result.outputFormat,
  };
}

export interface CortexResearchToolOutcome {
  provider: "exa" | "mock";
  result: ResearchResult;
  /** True only when the call threw and we fell back to reporting no tool use. */
  failed: boolean;
  errorMessage?: string;
}

/**
 * Execute a single research lookup ("answer" mode) for Cortex chat's
 * research path, reusing the same Exa/mock provider code the standalone
 * research route uses. Returns the real provider result so callers can
 * derive truthful tool/source metadata — this never fabricates sources.
 */
export async function executeCortexResearchTool(
  query: string
): Promise<CortexResearchToolOutcome> {
  const form: AnswerFormState = {
    query,
    text: true,
    stream: false,
    systemPrompt: "",
    outputSchema: "",
  };

  // Loaded dynamically (rather than as static imports) because both modules
  // are marked "server-only" — a static import would make this whole file
  // unimportable from non-server-conditioned contexts (e.g. plain tsx tests
  // that only exercise the receipt-building helpers below, never this call).
  const { getExaApiKey, isResearchMockMode } = await import("../research/env");
  const { exaAnswer, ExaProviderError } = await import("../research/exa-provider");

  if (isResearchMockMode()) {
    return { provider: "mock", result: { mode: "answer", result: mockAnswer(form) }, failed: false };
  }

  const emptyAnswer = { answer: "", sources: [], evidence: [] };

  const apiKey = getExaApiKey();
  if (!apiKey) {
    return {
      provider: "exa",
      result: { mode: "answer", result: emptyAnswer },
      failed: true,
      errorMessage: "Research provider is not configured. Set EXA_API_KEY.",
    };
  }

  try {
    const result = await exaAnswer(apiKey, form);
    return { provider: "exa", result: { mode: "answer", result }, failed: false };
  } catch (err) {
    const message =
      err instanceof ExaProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Research tool execution failed.";
    return {
      provider: "exa",
      result: { mode: "answer", result: emptyAnswer },
      failed: true,
      errorMessage: message,
    };
  }
}

export function buildResearchCortexReceipt(
  input: CortexResearchInput
): CortexResearchReceipt {
  const hasSources = input.sources.length > 0;
  const hasEvidence = input.evidence.length > 0;
  const hasCitations = input.evidence.some(
    (e) => e.sourceIndex !== undefined || e.sourceUrl
  );

  return {
    route: "research",
    mode: input.mode,
    provider: input.provider,
    query: input.query || "not provided",
    sourceCount: input.sources.length,
    evidenceCount: input.evidence.length,
    sourceGrounded: hasSources,
    citationsAvailable: hasCitations,
    freshnessCheckable: input.sources.some((s) => !!s.publishedDate),
    verifierRecommended: hasSources || hasCitations,
    confidence:
      hasSources && hasCitations
        ? "high"
        : hasSources
          ? "medium"
          : "unknown",
    generatedAt: new Date().toISOString(),
  };
}
