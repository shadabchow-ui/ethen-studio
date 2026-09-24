/**
 * lib/model-intelligence/navigation/modelIntelligenceNav.ts
 * Navigation taxonomy for Model Intelligence.
 *
 * Defines top-level nav groups and their items for the Model Intelligence
 * section. Category items link to real category routes. Provider dropdown
 * includes actual top providers from the normalized index.
 */
import type { MINavGroup, MINavItem, MINavBadge } from "./navTypes";

// ---------------------------------------------------------------------------
// Per-nav-group item definitions
// ---------------------------------------------------------------------------

const modelsItems: MINavItem[] = [
  {
    label: "All Models",
    href: "/model-intelligence/models",
    description: "Browse all 550+ normalized model profiles with benchmarks, specs, and pricing.",
  },
  {
    label: "Open Weight Models",
    href: "/model-intelligence/categories/open-weight",
    description: "Open-weight models you can self-host, fine-tune, or deploy on your own infrastructure.",
  },
  {
    label: "Proprietary Models",
    href: "/model-intelligence/categories/proprietary",
    description: "Closed-source models available via API — frontier labs and enterprise providers.",
  },
  {
    label: "Reasoning Models",
    href: "/model-intelligence/categories/reasoning",
    description: "Models with chain-of-thought reasoning capabilities for complex problem-solving.",
  },
  {
    label: "Coding Models",
    href: "/model-intelligence/categories/coding",
    description: "Models optimized or fine-tuned for code generation and software engineering tasks.",
  },
  {
    label: "Vision Models",
    href: "/model-intelligence/categories/vision",
    description: "Multimodal models supporting image input — vision understanding and analysis.",
  },
  {
    label: "Long Context Models",
    href: "/model-intelligence/categories/long-context",
    description: "Models with large context windows suitable for long documents and multi-turn conversations.",
  },
  {
    label: "Low-Cost Models",
    href: "/model-intelligence/categories/low-cost",
    description: "Cost-efficient models for high-volume and budget-sensitive production workloads.",
  },
  {
    label: "Fastest Models",
    href: "/model-intelligence/categories/fastest",
    description: "Models with top output speed and low latency for real-time applications.",
  },
];

const benchmarkItems: MINavItem[] = [
  {
    label: "Intelligence",
    href: "/model-intelligence/benchmarks/intelligence",
    description: "Composite intelligence benchmark scores across all models.",
  },
  {
    label: "Speed",
    href: "/model-intelligence/benchmarks/speed",
    description: "Output tokens per second — throughput comparison.",
  },
  {
    label: "Latency",
    href: "/model-intelligence/benchmarks/latency",
    description: "Time to first token and end-to-end response latency.",
  },
  {
    label: "Pricing",
    href: "/model-intelligence/benchmarks/price",
    description: "Input and output token pricing comparison.",
  },
  {
    label: "Cost Efficiency",
    href: "/model-intelligence/benchmarks/cost",
    description: "Combined input and output pricing comparison.",
  },
  {
    label: "Context Window",
    href: "/model-intelligence/benchmarks/context",
    description: "Context window size comparison across models.",
  },
];

const providerItems: MINavItem[] = [
  {
    label: "All Providers",
    href: "/model-intelligence/providers",
    description: "Browse all 50+ model providers ranked by model count and capabilities.",
  },
  // Top providers from normalized index — all resolve to real /model-intelligence/providers/[slug] routes
  { label: "OpenAI", href: "/model-intelligence/providers/openai", description: "GPT, o-series, and frontier reasoning models." },
  { label: "Anthropic", href: "/model-intelligence/providers/anthropic", description: "Claude-series — safety-focused frontier models." },
  { label: "Google", href: "/model-intelligence/providers/google", description: "Gemini models — multimodal from the start." },
  { label: "DeepSeek", href: "/model-intelligence/providers/deepseek", description: "DeepSeek V-series and R-series reasoning models." },
  { label: "Alibaba", href: "/model-intelligence/providers/alibaba", description: "Qwen family — strong open-weight models." },
  { label: "Meta", href: "/model-intelligence/providers/meta", description: "Llama series — leading open-weight ecosystem." },
  { label: "Mistral", href: "/model-intelligence/providers/mistral", description: "Mistral, Mixtral — efficient open models." },
  { label: "Amazon", href: "/model-intelligence/providers/amazon", description: "Nova models via AWS Bedrock." },
  { label: "NVIDIA", href: "/model-intelligence/providers/nvidia", description: "Nemotron models — enterprise-grade LLMs." },
  { label: "xAI", href: "/model-intelligence/providers/xai", description: "Grok series — real-time reasoning models." },
];

const leaderboardItems: MINavItem[] = [
  {
    label: "Intelligence",
    href: "/model-intelligence/leaderboards/intelligence",
    description: "Models ranked by composite intelligence score.",
  },
  {
    label: "Speed",
    href: "/model-intelligence/leaderboards/speed",
    description: "Models ranked by output tokens per second.",
  },
  {
    label: "Latency",
    href: "/model-intelligence/leaderboards/latency",
    description: "Models ranked by time to first token (TTFT).",
  },
  {
    label: "Input Price",
    href: "/model-intelligence/leaderboards/input-price",
    description: "Models ranked by input token pricing (lowest first).",
  },
  {
    label: "Output Price",
    href: "/model-intelligence/leaderboards/output-price",
    description: "Models ranked by output token pricing (lowest first).",
  },
  {
    label: "Context Window",
    href: "/model-intelligence/leaderboards/context-window",
    description: "Models ranked by context window size (largest first).",
  },
];

// ---------------------------------------------------------------------------
// Top-level nav groups
// ---------------------------------------------------------------------------

export const MI_NAV_GROUPS: MINavGroup[] = [
  {
    label: "Models",
    description: "Browse, filter, and compare AI models by category and capability.",
    items: modelsItems,
  },
  {
    label: "Benchmarks",
    description: "Dedicated benchmark pages with detailed methodology and cross-model comparisons.",
    items: benchmarkItems,
  },
  {
    label: "Providers",
    description: "Browse models grouped by their provider — open labs, enterprise, and frontier.",
    items: providerItems,
  },
  {
    label: "Leaderboards",
    description: "Models ranked by intelligence, speed, latency, pricing, and context window.",
    items: leaderboardItems,
  },
];

// ---------------------------------------------------------------------------
// Convenience accessors
// ---------------------------------------------------------------------------

export function getAllNavItems(): MINavItem[] {
  return MI_NAV_GROUPS.flatMap((g) => g.items);
}

export function getNavItemByHref(href: string): MINavItem | undefined {
  return getAllNavItems().find((item) => item.href === href);
}

export function getNavGroupForHref(href: string): MINavGroup | undefined {
  return MI_NAV_GROUPS.find((g) =>
    g.items.some((item) => item.href === href),
  );
}
