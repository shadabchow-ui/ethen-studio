import type {
  MIBenchmarkBarDatum,
  MIBenchmarkScatterDatum,
  MIBenchmarkStackedDatum,
  MIMiniBarChartSpec,
  MIProviderKey,
} from "../modelIntelligenceTypes";

type ModelSeed = {
  label: string;
  provider: MIProviderKey;
  icon: string;
  highlighted?: boolean;
};

export const modelSeeds: ModelSeed[] = [
  { label: "Claude Opus 4.8", provider: "anthropic", icon: "A" },
  { label: "Gemini 3 Pro", provider: "google", icon: "G" },
  { label: "Claude Sonnet 5", provider: "anthropic", icon: "A" },
  { label: "GPT-5.5 (high)", provider: "openai", icon: "AI" },
  { label: "GPT-5.5 (medium)", provider: "openai", icon: "AI", highlighted: true },
  { label: "DeepSeek V4 Pro", provider: "deepseek", icon: "D" },
  { label: "Grok 5", provider: "xai", icon: "x" },
  { label: "Gemini 3 Flash", provider: "google", icon: "G" },
  { label: "Qwen3 Max", provider: "qwen", icon: "Q" },
  { label: "Mistral Large 3", provider: "mistral", icon: "Mi" },
  { label: "Claude Sonnet 4.6", provider: "anthropic", icon: "A" },
  { label: "Llama 4 Maverick", provider: "meta", icon: "M" },
  { label: "Kimi K3", provider: "kimi", icon: "K" },
  { label: "NVIDIA Nemotron", provider: "nvidia", icon: "N" },
  { label: "GPT-5 mini", provider: "openai", icon: "AI" },
  { label: "DeepSeek V4", provider: "deepseek", icon: "D" },
  { label: "Gemini 2.5 Pro", provider: "google", icon: "G" },
  { label: "Qwen3 72B", provider: "qwen", icon: "Q" },
  { label: "Mistral Medium", provider: "mistral", icon: "Mi" },
  { label: "Kimi Mini", provider: "kimi", icon: "K" },
  { label: "GPT OSS 120B", provider: "openai", icon: "AI" },
  { label: "Llama 3.3 70B", provider: "meta", icon: "M" },
  { label: "NVIDIA Small", provider: "nvidia", icon: "N" },
  { label: "Grok 4 Mini", provider: "xai", icon: "x" },
  { label: "Alibaba Coder", provider: "alibaba", icon: "Q" },
  { label: "Mistral Small", provider: "mistral", icon: "Mi" },
  { label: "Llama 4 Scout", provider: "meta", icon: "M" },
];

export function bars(values: number[]): MIBenchmarkBarDatum[] {
  return modelSeeds.map((model, index) => ({ ...model, value: values[index] ?? values[values.length - 1] ?? 0 }));
}

export function shifted(values: number[], amount: number, floor = 0) {
  return values.map((value, index) => Math.max(floor, Number((value + ((index % 5) - 2) * amount).toFixed(1))));
}

export function mini(title: string, subtitle: string, values: number[]): MIMiniBarChartSpec {
  return { title, subtitle, data: bars(values), metricKind: "percent", visibleCount: 20 };
}

export const intelligenceValues = [62, 59, 56, 55, 50, 50, 48, 47, 46, 44, 44, 43, 43, 42, 42, 41, 40, 40, 39, 38, 38, 36, 34, 33, 29, 27, 24];
export const speedValues = [122, 118, 103, 94, 72.7, 84, 81, 79, 76, 72, 69, 65, 61, 58, 54, 51, 49, 46, 44, 41, 39, 35, 32, 29, 24, 21, 18];
export const latencyValues = [1.8, 2.4, 4.8, 7.2, 9.2, 10.3, 12.3, 14.2, 20.4, 21.6, 22.0, 26.9, 27.4, 28.2, 29.5, 40.4, 46.2, 49.1, 60.8, 62.8, 94.4, 109.9, 113.5, 138.9, 149.8, 191.3, 218.0];
export const costValues = [0.04, 0.06, 0.12, 0.18, 0.34, 0.35, 0.37, 0.48, 0.59, 0.61, 0.86, 0.89, 1.06, 1.14, 1.53, 1.8, 1.97, 2.75, 3.36, 3.78, 4.01, 5.0, 6.4, 6.8, 7.2, 8.2, 9.2];
export const contextValues = [2_000_000, 1_500_000, 1_200_000, 1_000_000, 922_000, 512_000, 512_000, 512_000, 256_000, 256_000, 200_000, 200_000, 128_000, 128_000, 128_000, 128_000, 128_000, 96_000, 80_000, 64_000, 64_000, 64_000, 64_000, 32_000, 32_000, 32_000, 16_000];
export const tokenValues = [21_000_000, 18_000_000, 16_500_000, 15_200_000, 14_200_000, 12_100_000, 11_600_000, 11_300_000, 10_900_000, 9_900_000, 9_600_000, 8_900_000, 8_600_000, 8_200_000, 7_800_000, 7_300_000, 6_900_000, 6_400_000, 5_900_000, 5_400_000, 4_800_000, 4_200_000, 3_800_000, 3_500_000, 3_200_000, 2_800_000, 2_500_000];

export const miniCharts = [
  mini("GDPval-AA v2", "Agentic real-world work tasks", shifted([63, 60, 59, 58, 50, 49, 48, 47, 45, 44, 44, 42, 40, 39, 36, 35, 33, 31, 29, 23], 1)),
  mini("τ³-Banking", "Agentic tool use", shifted([31, 30, 30, 29, 28, 28, 27, 26, 26, 25, 25, 23, 22, 19, 16, 15, 14, 13, 12, 11], 0.7)),
  mini("Terminal-Bench v2.1", "Agentic coding and terminal use", shifted([85, 84, 83, 81, 79, 77, 75, 74, 72, 70, 69, 68, 66, 64, 62, 60, 57, 55, 53, 50], 1)),
  mini("SciCode", "Scientific coding", shifted([60, 59, 57, 55, 54, 53, 51, 50, 48, 47, 46, 44, 43, 42, 40, 39, 37, 35, 34, 30], 1)),
  mini("AA-Briefcase", "Agentic knowledge work", shifted([83, 79, 78, 78, 77, 76, 76, 76, 75, 75, 74, 73, 72, 71, 69, 67, 63, 62, 60, 57], 0.8)),
  mini("IFBench", "Instruction following", shifted([82, 80, 79, 78, 77, 76, 76, 75, 74, 73, 72, 70, 69, 67, 65, 64, 62, 60, 58, 55], 0.8)),
  mini("APEX-Agents-AA", "Long-horizon agentic tasks", shifted([47, 38, 34, 33, 32, 28, 28, 26, 24, 17, 12, 10, 9, 8, 6, 5, 4, 3, 3, 2], 0.6)),
  mini("MMMU-Pro", "Visual reasoning", shifted([84, 82, 81, 80, 80, 79, 78, 78, 77, 76, 75, 75, 73, 73, 72, 70, 69, 67, 65, 62], 0.7)),
];

export const stackedTokenData: MIBenchmarkStackedDatum[] = modelSeeds.map((model, index) => ({
  ...model,
  segments: [
    { key: "Answer", value: 2_000 + index * 160, color: "#77ad55" },
    { key: "Reasoning", value: index % 3 === 0 ? 1_500 + index * 120 : 800 + index * 80, color: "#a993e2" },
    { key: "Input", value: 600 + index * 40, color: "#78aaf3" },
  ],
}));

export const scatterData: MIBenchmarkScatterDatum[] = bars(intelligenceValues).map((item, index) => ({
  label: item.label,
  provider: item.provider,
  highlighted: item.highlighted,
  x: costValues[index] ?? 1,
  y: item.value,
}));
