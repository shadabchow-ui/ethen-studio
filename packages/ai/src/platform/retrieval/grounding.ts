import type {
  GroundingCheckResult,
  GroundingStatus,
  RetrievalCitation,
  RankedChunkResult,
} from "./types";

/**
 * Deterministic first-pass grounding check.
 *
 * Strategy: split the answer into claims (sentences), then check each
 * claim against cited chunk content using simple text overlap.
 *
 * This is a deterministic heuristic suitable for validators.
 * Production grounding should use a dedicated LLM evaluator.
 */
export function runGroundingCheck(
  answerText: string,
  citedChunks: RankedChunkResult[],
  _citations: RetrievalCitation[] = [],
): GroundingCheckResult {
  void _citations;
  if (!answerText.trim()) {
    return {
      status: "not_enough_evidence",
      supportedClaimCount: 0,
      unsupportedClaimCount: 0,
      totalClaimCount: 0,
      citedChunkIds: [],
      notes: ["Answer text is empty."],
    };
  }

  if (citedChunks.length === 0) {
    const claimCount = extractClaims(answerText).length;
    return {
      status: "retrieval_failed",
      supportedClaimCount: 0,
      unsupportedClaimCount: claimCount,
      totalClaimCount: claimCount,
      citedChunkIds: [],
      notes: ["No citations or chunk evidence provided — retrieval_failed."],
    };
  }

  const claims = extractClaims(answerText);
  if (claims.length === 0) {
    return {
      status: "not_checked",
      supportedClaimCount: 0,
      unsupportedClaimCount: 0,
      totalClaimCount: 0,
      citedChunkIds: citedChunks.map((c) => c.chunk.id),
      notes: ["No extractable claims found in answer."],
    };
  }

  const citedContent = citedChunks.map((c) => c.chunk.content.toLowerCase()).join(" ");
  const citedChunkIds = citedChunks.map((c) => c.chunk.id);
  const notes: string[] = [];

  let supported = 0;
  let unsupported = 0;

  for (const claim of claims) {
    const isSupported = checkClaimSupport(claim, citedContent);
    if (isSupported) {
      supported++;
    } else {
      unsupported++;
    }
  }

  const status = deriveGroundingStatus(supported, unsupported, claims.length);
  if (unsupported > 0) {
    notes.push(`${unsupported} of ${claims.length} claims could not be substantiated by cited evidence.`);
  }
  if (citedChunks.length < 3) {
    notes.push("Low evidence count — consider retrieving more chunks.");
  }

  return {
    status,
    supportedClaimCount: supported,
    unsupportedClaimCount: unsupported,
    totalClaimCount: claims.length,
    citedChunkIds,
    notes,
  };
}

function extractClaims(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const claims: string[] = [];
  for (const sentence of sentences) {
    const subclaims = sentence.split(/[;,]\s*/).filter((s) => s.length > 10);
    claims.push(...subclaims);
  }
  return claims;
}

function checkClaimSupport(claim: string, citedContent: string): boolean {
  const words = claim.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return false;

  let matched = 0;
  for (const word of words) {
    if (citedContent.includes(word)) {
      matched++;
    }
  }

  const ratio = matched / words.length;
  return ratio >= 0.4;
}

function deriveGroundingStatus(
  supported: number,
  unsupported: number,
  total: number,
): GroundingStatus {
  if (total === 0) return "not_checked";
  const ratio = supported / total;
  if (ratio >= 0.9) return "grounded";
  if (ratio >= 0.5) return "partially_grounded";
  if (supported === 0 && unsupported > 0) return "unsupported";
  return "not_enough_evidence";
}

/**
 * Verify that a grounding check result is honest about unsupported claims.
 */
export function isGroundingHonest(result: GroundingCheckResult): boolean {
  if (result.status === "unsupported" && result.unsupportedClaimCount === 0) return false;
  if (result.status === "grounded" && result.supportedClaimCount === 0) return false;
  return true;
}
