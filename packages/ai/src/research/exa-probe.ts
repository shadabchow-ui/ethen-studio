import "server-only";

import { exaAnswerWithReceipt, exaContentsWithReceipt, exaSearchWithReceipt, type ExaTransportOptions } from "./exa-provider";

export type ExaCapability = "search" | "contents" | "answer";
export interface ExaCapabilityProbe {
  capability: ExaCapability;
  certified: boolean;
  checkedAt: string;
  evidence: "passed" | "failed";
  status: number | null;
  latencyMs: number;
  requestId: string | null;
}

/**
 * Executes deliberately low-impact endpoint probes. Call only from an explicit,
 * authorized operational check; health reads never invoke it and never certify
 * configuration as availability.
 */
export async function probeExaCapability(apiKey: string, capability: ExaCapability, options?: ExaTransportOptions): Promise<ExaCapabilityProbe> {
  const checkedAt = new Date().toISOString();
  try {
    const call = capability === "search"
      ? await exaSearchWithReceipt(apiKey, { query: "Exa capability probe", searchType: "instant", numResults: 1, category: "general", highlights: false, fullText: false, structuredOutputs: false }, options)
      : capability === "contents"
        ? await exaContentsWithReceipt(apiKey, { url: "https://example.com", maxCharacters: 200, mainContentOnly: true, fullWebpageText: false, highlights: false }, options)
        : await exaAnswerWithReceipt(apiKey, { query: "Exa capability probe", text: false, stream: false, systemPrompt: "", outputSchema: "" }, options);
    return { capability, certified: true, checkedAt, evidence: "passed", status: call.receipt.status, latencyMs: call.receipt.latencyMs, requestId: call.receipt.requestId };
  } catch (error) {
    const receipt = error instanceof Error && "receipt" in error ? (error as { receipt: { status: number | null; latencyMs: number; requestId: string | null } }).receipt : { status: null, latencyMs: 0, requestId: null };
    return { capability, certified: false, checkedAt, evidence: "failed", ...receipt };
  }
}
