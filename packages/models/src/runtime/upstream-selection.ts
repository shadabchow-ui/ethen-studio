import type {
  UpstreamAdapter,
  UpstreamRequest,
  UpstreamResponse,
} from "./upstream-adapter";
import { UpstreamAdapterError } from "./upstream-adapter";

export interface UpstreamSelectionPolicy {
  vercelAIGatewayEnabled: boolean;
  directOrder: readonly string[];
}

export interface UpstreamAttemptReceipt {
  upstreamId: string;
  outcome: "selected" | "unavailable";
  errorCode: string | null;
}

export interface UpstreamSelectionReceipt {
  policy: {
    vercelAIGatewayEnabled: boolean;
    directOrder: readonly string[];
  };
  selectedUpstreamId: string;
  fallbackUsed: boolean;
  attempts: readonly UpstreamAttemptReceipt[];
}

export async function executeWithUpstreamPolicy(input: {
  request: UpstreamRequest;
  policy: UpstreamSelectionPolicy;
  adapters: Readonly<Record<string, UpstreamAdapter>>;
  apiKeys?: Readonly<Record<string, string | undefined>>;
}): Promise<{ response: UpstreamResponse; receipt: UpstreamSelectionReceipt }> {
  const candidates = [
    ...(input.policy.vercelAIGatewayEnabled ? ["vercel-ai-gateway"] : []),
    ...input.policy.directOrder,
  ];
  const attempts: UpstreamAttemptReceipt[] = [];
  for (const upstreamId of candidates) {
    const adapter = input.adapters[upstreamId];
    if (!adapter) continue;
    try {
      const response = await adapter.execute(input.request, input.apiKeys?.[upstreamId]);
      attempts.push({ upstreamId, outcome: "selected", errorCode: null });
      return {
        response,
        receipt: {
          policy: {
            vercelAIGatewayEnabled: input.policy.vercelAIGatewayEnabled,
            directOrder: [...input.policy.directOrder],
          },
          selectedUpstreamId: upstreamId,
          fallbackUsed: attempts.length > 1,
          attempts,
        },
      };
    } catch (error) {
      if (!(error instanceof UpstreamAdapterError) || !error.detail.retryable) throw error;
      attempts.push({
        upstreamId,
        outcome: "unavailable",
        errorCode: error.detail.code,
      });
    }
  }
  throw new UpstreamAdapterError({
    code: "unavailable",
    retryable: true,
    status: 503,
    messageRedacted: attempts.length
      ? "All policy-approved upstreams are unavailable."
      : "No policy-approved upstream is configured.",
  });
}
