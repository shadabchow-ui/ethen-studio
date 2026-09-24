import type { CortexSpan } from "./types";
import type { RunCortexChatResult } from "./run-cortex-chat";

function generateSpanId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build a minimal, redacted-safe set of trace spans for one Cortex run:
 * classification, routing, gateway execution, fallback (if used), and
 * verification. No prompt text, hidden reasoning, or provider keys are
 * included in span metadata.
 */
export function buildCortexTraceSpans(result: RunCortexChatResult): CortexSpan[] {
  const { classification, receipt, cortexProfile, result: gatewayResult, research } = result;
  const now = new Date().toISOString();
  const spans: CortexSpan[] = [];

  if (research) {
    spans.push({
      spanId: generateSpanId("span-tool"),
      type: "tool_call",
      label: "Research tool execution",
      startedAt: now,
      endedAt: now,
      status: research.failed ? "failed" : "success",
      metadata: {
        toolClass: research.toolClass,
        provider: research.provider,
        sourceCount: research.sourceCount,
        evidenceCount: research.evidenceCount,
        sourceGrounded: research.sourceGrounded,
        citationsAvailable: research.citationsAvailable,
        ...(research.failed ? { errorReason: research.errorMessage ?? "unknown" } : {}),
      },
    });
  }

  spans.push({
    spanId: generateSpanId("span-classify"),
    type: "classification",
    label: "Intent classification",
    startedAt: now,
    endedAt: now,
    status: "success",
    metadata: {
      intent: classification.primaryIntent,
      confidence: classification.confidence,
      riskLevel: classification.riskLevel,
    },
  });

  spans.push({
    spanId: generateSpanId("span-route"),
    type: "routing",
    label: "Route selection",
    startedAt: now,
    endedAt: now,
    status: "success",
    metadata: {
      routeProfile: cortexProfile?.id ?? receipt.routeProfile,
      routeClass: receipt.routeClass,
      candidateCount: receipt.selection.candidateCount,
      selectedRank: receipt.selection.selectedCandidateRank,
    },
  });

  spans.push({
    spanId: generateSpanId("span-provider"),
    type: "provider_call",
    label: "Gateway execution",
    startedAt: now,
    endedAt: now,
    status: gatewayResult.route.fallbackUsed ? "warning" : "success",
    metadata: {
      provider: receipt.provider.providerVisible ? receipt.provider.selectedProvider : "redacted",
      source: gatewayResult.route.source,
    },
  });

  if (receipt.fallback.attempted) {
    spans.push({
      spanId: generateSpanId("span-fallback"),
      type: "provider_call",
      label: "Fallback attempt",
      startedAt: now,
      endedAt: now,
      status: receipt.fallback.finalStatus === "failed" ? "failed" : "warning",
      metadata: {
        used: receipt.fallback.used,
        finalStatus: receipt.fallback.finalStatus,
        attemptCount: receipt.fallback.attempts.length,
      },
    });
  }

  spans.push({
    spanId: generateSpanId("span-verify"),
    type: "verification",
    label: "Verifier pass",
    startedAt: now,
    endedAt: now,
    status: receipt.verifier.used
      ? (receipt.verifier.status === "failed" ? "failed" : receipt.verifier.status === "warned" ? "warning" : "success")
      : "skipped",
    metadata: {
      verifierType: receipt.verifier.verifierType ?? null,
      status: receipt.verifier.status ?? "skipped",
    },
  });

  spans.push({
    spanId: generateSpanId("span-receipt"),
    type: "synthesis",
    label: "Receipt build",
    startedAt: now,
    endedAt: now,
    status: "success",
    metadata: {
      receiptVersion: receipt.receiptVersion,
      requestId: receipt.requestId,
    },
  });

  return spans;
}
