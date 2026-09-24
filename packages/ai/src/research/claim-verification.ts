import "server-only";

export type ClaimStatus = "supported" | "weakly_supported" | "contested" | "unsupported" | "not_assessed";
export interface VerificationSource { id: string; title: string; url: string; text?: string; snippet?: string; retrievedAt?: string; }
export interface PassageEvidence { sourceId: string; sourceUrl: string; sourceTitle: string; location: string; excerpt: string; polarity: "support" | "contradiction"; overlap: number; }
export interface SemanticClaim { id: string; claim: string; sourceUrl: string; sourceTitle: string; verificationStatus: ClaimStatus; confidence: "high" | "medium" | "low" | "unsupported"; supportingExcerpt?: string; evidence: PassageEvidence[]; confidenceFactors: { independentSources: number; supportingPassages: number; contradictoryPassages: number; lexicalOverlap: number; staleSources: number }; limitations: string[]; verifier: { kind: "deterministic_local"; certified: false; receipt: string }; reviewEvents: Array<{ type: "machine_judgment" | "manual_override"; at: string; actorId?: string; note?: string; status: ClaimStatus }> }

const STOP = new Set(["the","a","an","and","or","of","to","in","on","for","with","is","are","was","were","be","as","by","from","that","this","it"]);
const contradiction = /\b(not|no|never|false|incorrect|declin(?:e|ed|ing)|contradict(?:s|ed|ion))\b/i;
function terms(text: string) { return [...new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((word) => !STOP.has(word)))]; }
export function extractAtomicClaims(report: string): Array<{ id: string; claim: string }> { return report.split(/(?<=[.!?])\s+/).map((claim) => claim.trim()).filter((claim) => terms(claim).length >= 2).map((claim, index) => ({ id: `claim-${index + 1}`, claim })); }
export function verifyReportClaims(report: string, sources: VerificationSource[]): SemanticClaim[] {
  return extractAtomicClaims(report).map(({ id, claim }) => {
    const wanted = terms(claim); const evidence: PassageEvidence[] = [];
    for (const source of sources) {
      const text = source.text ?? source.snippet ?? "";
      // Retrieved text is never interpreted as instructions; only delimited sentence data is scored.
      text.split(/(?<=[.!?])\s+/).forEach((sentence, index) => {
        const overlap = wanted.filter((word) => terms(sentence).includes(word)).length;
        if (overlap >= Math.max(2, Math.ceil(wanted.length * 0.35))) evidence.push({ sourceId: source.id, sourceUrl: source.url, sourceTitle: source.title, location: `sentence:${index + 1}`, excerpt: sentence.slice(0, 500), polarity: contradiction.test(sentence) ? "contradiction" : "support", overlap });
      });
    }
    const supporting = evidence.filter((item) => item.polarity === "support"); const opposing = evidence.filter((item) => item.polarity === "contradiction");
    const independent = new Set(supporting.map((item) => item.sourceId)).size;
    const stale = sources.filter((s) => !s.retrievedAt || Number.isNaN(Date.parse(s.retrievedAt))).length;
    const status: ClaimStatus = opposing.length && supporting.length ? "contested" : supporting.length >= 2 && independent >= 2 ? "supported" : supporting.length ? "weakly_supported" : "unsupported";
    const confidence = status === "supported" ? "high" : status === "weakly_supported" ? "low" : "unsupported";
    return { id, claim, sourceUrl: supporting[0]?.sourceUrl ?? "", sourceTitle: supporting[0]?.sourceTitle ?? "No supporting passage", verificationStatus: status, confidence, supportingExcerpt: supporting[0]?.excerpt, evidence, confidenceFactors: { independentSources: independent, supportingPassages: supporting.length, contradictoryPassages: opposing.length, lexicalOverlap: Math.max(0, ...evidence.map((item) => item.overlap)), staleSources: stale }, limitations: ["Deterministic lexical passage matching is not a certified semantic verifier."], verifier: { kind: "deterministic_local", certified: false, receipt: "local-lexical-v1" }, reviewEvents: [{ type: "machine_judgment", at: new Date().toISOString(), status }] };
  });
}
