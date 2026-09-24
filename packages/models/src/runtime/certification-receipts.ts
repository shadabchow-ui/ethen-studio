import type { AdapterCertificationReceipt } from "./certification";
import { isCertificationCurrent } from "./certification";

const BASELINE_COMMIT = "5cdbcc2e22e44cca720baf86ec85e3c45f0d8d90";

export const ADAPTER_CERTIFICATION_RECEIPTS: readonly AdapterCertificationReceipt[] =
  Object.freeze([
    {
      providerId: "openai",
      model: "gpt-4o-mini",
      certifiedAt: "2026-07-26T18:10:00.000Z",
      expiresAt: "2026-08-25T18:10:00.000Z",
      commit: "58ac7861336abe22322920a2d6de1b2a661538fb",
      mode: "live",
      scope: "gateway",
      requestShape: "POST /v1/chat/completions; bearer; one user message; stream=true",
      responseShape: "SSE data choices[].delta.content; non-empty text",
      result: "pass",
      evidence: "OPENAI_LIVE_CERTIFICATION=PASS output_chars=2",
    },
    {
      providerId: "openai",
      model: "gpt-4o-mini",
      certifiedAt: "2026-07-26T00:00:00.000Z",
      expiresAt: "2026-08-25T00:00:00.000Z",
      commit: BASELINE_COMMIT,
      mode: "recorded_replay",
      scope: "gateway",
      requestShape: "POST /v1/chat/completions; bearer; messages; stream=true",
      responseShape: "SSE data choices[].delta.content and usage",
      result: "pass",
      evidence: "tests/behavioral/sol23-upstream-adapters.test.ts",
    },
    {
      providerId: "anthropic",
      model: "claude-haiku-4-5-20251001",
      certifiedAt: "2026-07-26T00:00:00.000Z",
      expiresAt: "2026-08-25T00:00:00.000Z",
      commit: BASELINE_COMMIT,
      mode: "recorded_replay",
      scope: "gateway",
      requestShape: "POST /v1/messages; x-api-key; anthropic-version=2023-06-01",
      responseShape: "SSE message_start and content_block_delta",
      result: "pass",
      evidence: "tests/behavioral/sol23-upstream-adapters.test.ts",
    },
    {
      providerId: "vercel-ai-gateway",
      model: "fixture/certified-model",
      certifiedAt: "2026-07-26T00:00:00.000Z",
      expiresAt: "2026-08-25T00:00:00.000Z",
      commit: "f2e5fb107ea87111101fb86ad9c4b0d01e2c4867",
      mode: "recorded_replay",
      scope: "gateway",
      requestShape: "POST /v1/chat/completions; bearer; provider-prefixed model; stream=true",
      responseShape: "OpenAI-compatible SSE choices[].delta.content",
      result: "pass",
      evidence: "tests/behavioral/sol26-vercel-upstream-adapter.test.ts",
    },
    {
      providerId: "ollama",
      model: "qwen2.5-coder",
      certifiedAt: "2026-07-26T00:00:00.000Z",
      expiresAt: "2026-08-25T00:00:00.000Z",
      commit: BASELINE_COMMIT,
      mode: "recorded_replay",
      scope: "local_read_only",
      requestShape: "localhost:11434 /api/version, /api/tags, /api/show",
      responseShape: "bounded JSON discovery responses",
      result: "pass",
      evidence: "lib/local-models/__tests__/ollama-client.test.ts",
    },
  ]);

export function getCurrentCertification(
  providerId: string,
  now = new Date(),
): AdapterCertificationReceipt | null {
  return ADAPTER_CERTIFICATION_RECEIPTS.find(
    (receipt) =>
      receipt.providerId === providerId &&
      receipt.scope === "gateway" &&
      isCertificationCurrent(receipt, now),
  ) ?? null;
}
