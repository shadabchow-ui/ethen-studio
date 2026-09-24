/**
 * Studio V5 providers — OpenAI images adapter (STUDIO_06). Server-only.
 *
 * Behavior extracted from apps/studio/lib/media/providers/openai.ts plus the
 * canonical openai-create-image-contract: gpt-image-1 only (dall-e-3 is
 * retired), sizes 1024x1024/1536x1024/1024x1536, quality low/medium/high,
 * single variant. The OpenAI images call is synchronous, so submit performs
 * the POST and records the completed output; query/reconcile read the
 * recorded truth. Submit is idempotent on operationKey (replay returns the
 * recorded operation without a second call).
 */
import "server-only";
import { createHash } from "node:crypto";
import type { TaskName } from "../../../contracts/tasks";
import type {
  ProviderAdapterPort,
  ProviderOperationState,
  ProviderOutputDescriptor,
  ProviderUsageReport,
  UsageEstimate,
} from "../../ports/provider-adapter";
import { ProviderError, redactProviderText, type FetchImpl } from "../types";

export const OPENAI_ADAPTER_NAME = "openai-images" as const;
export const OPENAI_ADAPTER_VERSION = "studio-openai-image-v1" as const;
export const OPENAI_MODEL_ID = "gpt-image-1" as const;
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const ALLOWED_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
const ALLOWED_QUALITIES = ["low", "medium", "high"] as const;

export interface OpenAiOperationRecord {
  operationKey: string;
  imageUrl: string | null;
  imageBytes: number | null;
  sha256: string | null;
  revisedPrompt: string | null;
  lastError: string | null;
}

export interface OpenAiOperationStore {
  getByOperationId(operationId: string): OpenAiOperationRecord | null;
  getByOperationKey(operationKey: string): { operationId: string; record: OpenAiOperationRecord } | null;
  put(operationId: string, record: OpenAiOperationRecord): void;
}

export function createMemoryOpenAiOperationStore(): OpenAiOperationStore {
  const byId = new Map<string, OpenAiOperationRecord>();
  const byKey = new Map<string, string>();
  return {
    getByOperationId: (operationId: string) => byId.get(operationId) ?? null,
    getByOperationKey: (operationKey: string) => {
      const id = byKey.get(operationKey);
      if (!id) return null;
      const record = byId.get(id);
      return record ? { operationId: id, record } : null;
    },
    put: (operationId: string, record: OpenAiOperationRecord) => {
      byId.set(operationId, record);
      byKey.set(record.operationKey, operationId);
    },
  };
}

export interface OpenAiAdapterConfig {
  fetchImpl?: FetchImpl;
  getApiKey?: () => string | undefined;
  store?: OpenAiOperationStore;
  timeoutMs?: number;
}

function sizeFromAspectRatio(ratio: unknown): string {
  switch (ratio) {
    case "16:9":
      return ALLOWED_SIZES[1];
    case "9:16":
      return ALLOWED_SIZES[2];
    default:
      return ALLOWED_SIZES[0];
  }
}

function qualityFromPreference(pref: unknown): string {
  if (pref === "premium" || pref === "high") return "high";
  if (pref === "starter" || pref === "low") return "low";
  return "medium";
}

export function createOpenAiProviderAdapter(config: OpenAiAdapterConfig = {}): ProviderAdapterPort {
  const fetchImpl = config.fetchImpl ?? fetch;
  const getApiKey = config.getApiKey ?? (() => process.env.OPENAI_API_KEY);
  const store = config.store ?? createMemoryOpenAiOperationStore();
  const timeoutMs = config.timeoutMs ?? 60_000;

  function operationIdFor(operationKey: string, nonce: string): string {
    return `openai:${OPENAI_MODEL_ID}:${createHash("sha256").update(`${operationKey}:${nonce}`).digest("hex").slice(0, 24)}`;
  }

  return {
    adapterName: OPENAI_ADAPTER_NAME,
    adapterVersion: OPENAI_ADAPTER_VERSION,
    supportedTasks: ["image.generate"],

    validate(task: TaskName, parameters: Readonly<Record<string, unknown>>): void {
      if (task !== "image.generate") {
        throw new ProviderError("UNSUPPORTED_TASK", `openai adapter supports image.generate, not ${task}.`);
      }
      const model = parameters.model;
      if (typeof model === "string" && model !== OPENAI_MODEL_ID) {
        throw new ProviderError(
          "INVALID_PARAMETERS",
          `Unsupported model id "${model}" for openai provider. Only ${OPENAI_MODEL_ID} is registered.`,
        );
      }
      const prompt = parameters.prompt;
      if (typeof prompt !== "string" || !prompt.trim()) {
        throw new ProviderError("INVALID_PARAMETERS", "A prompt is required for image generation.");
      }
      if (parameters.size !== undefined && !(ALLOWED_SIZES as readonly unknown[]).includes(parameters.size)) {
        throw new ProviderError(
          "INVALID_PARAMETERS",
          `size must be one of ${ALLOWED_SIZES.join(", ")} for ${OPENAI_MODEL_ID}.`,
        );
      }
      if (parameters.quality !== undefined && !(ALLOWED_QUALITIES as readonly unknown[]).includes(parameters.quality)) {
        throw new ProviderError(
          "INVALID_PARAMETERS",
          `quality must be one of ${ALLOWED_QUALITIES.join(", ")} for ${OPENAI_MODEL_ID}.`,
        );
      }
      if (parameters.variants !== undefined && parameters.variants !== 1) {
        throw new ProviderError("INVALID_PARAMETERS", "Only a single image variant is supported.");
      }
    },

    estimateUsage(task: TaskName, parameters: Readonly<Record<string, unknown>>): UsageEstimate {
      this.validate(task, parameters);
      // M2 (Lock L): no $0 placeholder — without a verified price row the
      // quote is PRICE_UNKNOWN. Metered estimation lands with M4 evidence.
      throw new ProviderError("PRICE_UNKNOWN", "Price not verified for openai endpoint; refusing a $0 estimate.");
    },

    async submit(
      task: TaskName,
      parameters: Readonly<Record<string, unknown>>,
      operationKey: string,
    ): Promise<string> {
      this.validate(task, parameters);
      const replay = store.getByOperationKey(operationKey);
      if (replay) return replay.operationId;
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new ProviderError("SETUP_REQUIRED", "OPENAI_API_KEY is not configured.", false);
      }
      const size =
        typeof parameters.size === "string" ? parameters.size : sizeFromAspectRatio(parameters.aspect_ratio);
      const quality =
        typeof parameters.quality === "string" ? parameters.quality : qualityFromPreference(parameters.quality_preference);
      let response: Response;
      try {
        response = await fetchImpl(OPENAI_IMAGES_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: OPENAI_MODEL_ID, prompt: parameters.prompt, n: 1, size, quality }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new ProviderError(
          "TRANSPORT",
          `OpenAI Images request failed: ${redactProviderText(error instanceof Error ? error.message : String(error))}`,
          true,
        );
      }
      if (!response.ok) {
        let body = "";
        try {
          body = await response.text();
        } catch {
          // ignore read errors
        }
        const redacted = redactProviderText(body);
        if (response.status === 401 || response.status === 403) {
          throw new ProviderError("AUTH", "OpenAI API key is invalid or unauthorized.", false);
        }
        throw new ProviderError(
          "PROVIDER_FAILED",
          `OpenAI Images API returned HTTP ${response.status}: ${redacted}`,
          response.status === 429 || response.status >= 500,
        );
      }
      const data = (await response.json()) as {
        data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
      };
      const first = data.data?.[0];
      const imageUrl =
        first?.url ?? (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : undefined);
      if (!imageUrl) {
        throw new ProviderError("PROVIDER_FAILED", "OpenAI Images API returned no image data.");
      }
      const bytes = first?.b64_json ? Buffer.from(first.b64_json, "base64") : null;
      const operationId = operationIdFor(operationKey, imageUrl.slice(0, 64));
      store.put(operationId, {
        operationKey,
        imageUrl,
        imageBytes: bytes ? bytes.length : null,
        sha256: bytes ? createHash("sha256").update(bytes).digest("hex") : null,
        revisedPrompt: first?.revised_prompt ?? null,
        lastError: null,
      });
      return operationId;
    },

    async query(operationId: string): Promise<ProviderOperationState> {
      const record = store.getByOperationId(operationId);
      if (!record) return "UNKNOWN";
      return record.imageUrl ? "SUCCEEDED" : "FAILED";
    },

    async reconcile(operationId: string, operationKey: string): Promise<ProviderOperationState> {
      const byKey = store.getByOperationKey(operationKey);
      if (byKey && byKey.operationId !== operationId) {
        return this.query(byKey.operationId);
      }
      return this.query(operationId);
    },

    async cancel(): Promise<boolean> {
      // Synchronous API: nothing in flight to cancel after submit returns.
      return false;
    },

    async retrieveOutputs(operationId: string): Promise<readonly ProviderOutputDescriptor[]> {
      const record = store.getByOperationId(operationId);
      if (!record || !record.imageUrl) {
        throw new ProviderError("NOT_FOUND", `Unknown openai operation ${operationId}.`);
      }
      return [
        { providerUrl: record.imageUrl, mediaType: "image/png", byteSize: record.imageBytes, expiresAt: null },
      ];
    },

    async reportUsage(operationId: string): Promise<ProviderUsageReport> {
      const record = store.getByOperationId(operationId);
      if (!record) {
        throw new ProviderError("NOT_FOUND", `Unknown openai operation ${operationId}.`);
      }
      return { meterUnit: "image", meterQuantity: 1, providerMinorAmount: null, redactedError: record.lastError };
    },
  };
}
