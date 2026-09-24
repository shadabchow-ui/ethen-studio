import "server-only";

import { getDefaultOllamaAdapter } from "./ollama-adapter";
import type { OllamaLocalModelAdapter } from "@ethen/contracts/local-models/local-model-types";

/**
 * Stable Product 04 contract for products that consume a user-selected local
 * model. It deliberately exposes only evidence observed through the trusted
 * local adapter. Unknown capabilities remain false or null.
 */
export interface LocalRuntimeCapabilityProbe {
  reachable: boolean;
  modelInstalled: boolean;
  streaming: boolean;
  contextWindow: number | null;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  cancellationSupported: boolean;
  trustScope: "verified-loopback";
  warnings: string[];
  receipt: LocalRuntimeOperationReceipt;
}

export interface LocalRuntimeOperationReceipt {
  operation: "capability-probe" | "chat";
  model: string;
  trustScope: "verified-loopback";
  providerReportedUsage: null;
}

export async function streamLocalRuntimeText(
  adapter: OllamaLocalModelAdapter,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  signal?: AbortSignal,
): Promise<{ text: string; receipt: LocalRuntimeOperationReceipt }> {
  let text = "";
  for await (const chunk of adapter.chat({ model, messages }, signal)) {
    if (chunk.type === "error") throw new Error(chunk.error ?? "Local runtime chat stream failed.");
    if (chunk.type === "delta") text += chunk.content;
  }
  return {
    text,
    receipt: { operation: "chat", model, trustScope: "verified-loopback", providerReportedUsage: null },
  };
}

/**
 * Probes only plain streamed text. Tool calling and structured output are not
 * inferred from model metadata, so consumers must continue to block them.
 */
export async function probeLocalRuntimeCapabilities(
  model: string,
  adapter: OllamaLocalModelAdapter = getDefaultOllamaAdapter(),
): Promise<LocalRuntimeCapabilityProbe> {
  const warnings: string[] = [];
  let reachable = false;
  let modelInstalled = false;
  let streaming = false;

  try {
    const status = await adapter.status();
    reachable = status.detected;
    if (!reachable) warnings.push(status.detail);

    if (reachable) {
      const installed = await adapter.listInstalled();
      modelInstalled = installed.some((entry) => entry.model === model || entry.name === model);
      if (!modelInstalled) warnings.push("The selected local model is not installed.");
    }

    if (modelInstalled) {
      await adapter.show(model);
      const result = await streamLocalRuntimeText(adapter, model, [{ role: "user", content: "Reply with exactly: ETHEN_LOCAL_PROBE_OK" }]);
      streaming = result.text.length > 0;
      if (!streaming) warnings.push("The local model returned no streamed text.");
    }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Local runtime probe failed.");
  }

  return {
    reachable,
    modelInstalled,
    streaming,
    contextWindow: null,
    supportsTools: false,
    supportsStructuredOutput: false,
    cancellationSupported: true,
    trustScope: "verified-loopback",
    warnings,
    receipt: { operation: "capability-probe", model, trustScope: "verified-loopback", providerReportedUsage: null },
  };
}
