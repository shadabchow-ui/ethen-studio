import "server-only";
export const LOCAL_RUNTIME_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "::1"] as const;
export const LOCAL_RUNTIME_ALLOWED_HOSTS_SET = new Set<string>(LOCAL_RUNTIME_ALLOWED_HOSTS);

export const LOCAL_RUNTIME_ALLOWED_PORTS = new Set([
  11434, // Ollama
  1234,  // LM Studio
  8080,  // llama.cpp (future placeholder)
  8000,  // vLLM (future placeholder)
  1337,  // Jan (future placeholder)
]);

export interface LocalRuntimeEndpointConfig {
  runtimeId: string;
  displayName: string;
  defaultPort: number;
  defaultBaseUrl: string;
}

export const LM_STUDIO_CONFIG: LocalRuntimeEndpointConfig = {
  runtimeId: "lm-studio",
  displayName: "LM Studio",
  defaultPort: 1234,
  defaultBaseUrl: "http://localhost:1234/v1",
};

// Future placeholders — metadata only, no execution support
export const LLAMA_CPP_CONFIG: LocalRuntimeEndpointConfig = {
  runtimeId: "llama-cpp",
  displayName: "llama.cpp",
  defaultPort: 8080,
  defaultBaseUrl: "http://localhost:8080/v1",
};

export const VLLM_CONFIG: LocalRuntimeEndpointConfig = {
  runtimeId: "vllm",
  displayName: "vLLM",
  defaultPort: 8000,
  defaultBaseUrl: "http://localhost:8000/v1",
};

export const JAN_CONFIG: LocalRuntimeEndpointConfig = {
  runtimeId: "jan",
  displayName: "Jan",
  defaultPort: 1337,
  defaultBaseUrl: "http://127.0.0.1:1337/v1",
};

export class LocalRuntimePolicyError extends Error {
  code: "invalid_base_url" | "blocked_by_policy";
  constructor(message: string, code: "invalid_base_url" | "blocked_by_policy") {
    super(message);
    this.name = "LocalRuntimePolicyError";
    this.code = code;
  }
}

export function assertLocalhostOnlyUrl(rawUrl: string, runtimeId: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new LocalRuntimePolicyError(
      `${runtimeId}: invalid base URL`,
      "invalid_base_url",
    );
  }

  const host = parsed.hostname.replace(/^\[(.*)\]$/, "$1");

  if (parsed.protocol !== "http:") {
    throw new LocalRuntimePolicyError(
      `${runtimeId}: base URL must use plain http`,
      "invalid_base_url",
    );
  }
  if (parsed.username || parsed.password) {
    throw new LocalRuntimePolicyError(
      `${runtimeId}: credentials in URL are blocked by the localhost-only policy`,
      "blocked_by_policy",
    );
  }
  if (!LOCAL_RUNTIME_ALLOWED_HOSTS_SET.has(host)) {
    throw new LocalRuntimePolicyError(
      `${runtimeId}: non-localhost hosts are blocked by the localhost-only policy`,
      "blocked_by_policy",
    );
  }
  if (parsed.search || parsed.hash) {
    throw new LocalRuntimePolicyError(
      `${runtimeId}: query strings and fragments are blocked by the localhost-only policy`,
      "blocked_by_policy",
    );
  }

  return parsed;
}
