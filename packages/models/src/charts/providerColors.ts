import type { MIProviderKey } from "../model-intelligence/modelIntelligenceTypes";

export const MI_PROVIDER_COLORS: Record<MIProviderKey, string> = {
  current: "var(--text-primary)",
  openai: "#34A853",
  anthropic: "#CC785C",
  google: "#1C7FF8",
  meta: "#2243E6",
  mistral: "#FF7018",
  deepseek: "#736CD3",
  qwen: "#B45309",
  alibaba: "#FF6900",
  nvidia: "#86B737",
  xai: "#1F1F1F",
  kimi: "#EB3568",
  unknown: "#807D77",
};

// Returns the provider's own flat color; highlighted state is communicated via outline/band, not fill.
export function getProviderColor(provider: MIProviderKey = "unknown") {
  return MI_PROVIDER_COLORS[provider] ?? MI_PROVIDER_COLORS.unknown;
}

export function getProviderIconLabel(provider: MIProviderKey = "unknown") {
  switch (provider) {
    case "openai":
      return "AI";
    case "anthropic":
      return "A";
    case "google":
      return "G";
    case "meta":
      return "M";
    case "mistral":
      return "Mi";
    case "deepseek":
      return "D";
    case "qwen":
    case "alibaba":
      return "Q";
    case "nvidia":
      return "N";
    case "xai":
      return "x";
    case "kimi":
      return "K";
    default:
      return "?";
  }
}

export function getProviderFromModelLabel(label: string): MIProviderKey {
  const lower = label.toLowerCase();
  if (lower.includes("gpt") || lower.includes("o3") || lower.includes("o4") || lower.includes("openai")) return "openai";
  if (lower.includes("claude") || lower.includes("anthropic")) return "anthropic";
  if (lower.includes("gemini") || lower.includes("google")) return "google";
  if (lower.includes("llama") || lower.includes("meta")) return "meta";
  if (lower.includes("mistral") || lower.includes("mixtral")) return "mistral";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("qwen") || lower.includes("alibaba")) return "qwen";
  if (lower.includes("nvidia") || lower.includes("nemotron")) return "nvidia";
  if (lower.includes("grok") || lower.includes("xai")) return "xai";
  if (lower.includes("kimi")) return "kimi";
  return "unknown";
}
