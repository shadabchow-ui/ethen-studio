import type { MICostPressureSpec, MIModelFitRowSpec, MISpecTableSpec, MISummaryCardSpec, MIVerdictSpec } from "../modelIntelligenceTypes";

export const modelSummaryCards: MISummaryCardSpec[] = [
  {
    label: "Intelligence",
    rank: "#9 / 169",
    value: "50",
    unit: "index score",
    hint: "Top-tier reasoning profile; not the absolute frontier leader in this sample.",
    classAverage: "37",
    tone: "green",
  },
  {
    label: "Speed",
    rank: "#73 / 169",
    value: "72.7",
    unit: "output tokens/sec",
    hint: "Fast enough for agent work, but not a low-latency chat specialist.",
    classAverage: "81.4 tok/sec",
    tone: "amber",
  },
  {
    label: "Input Price",
    rank: "#147 / 169",
    value: "$5.00",
    unit: "/ 1M tokens",
    hint: "High input cost; use routing gates for large-context workloads.",
    classAverage: "$1.38 / 1M",
    tone: "red",
  },
  {
    label: "Output Price",
    rank: "#147 / 169",
    value: "$30.00",
    unit: "/ 1M tokens",
    hint: "Output tokens are the pressure point. Avoid verbose batch jobs.",
    classAverage: "$7.90 / 1M",
    tone: "red",
  },
  {
    label: "Verbosity",
    rank: "#9 / 169",
    value: "21M",
    unit: "output tokens",
    hint: "Detailed answers help reasoning tasks but amplify cost risk.",
    classAverage: "14M tokens",
    tone: "green",
  },
];

export const modelVerdict: MIVerdictSpec = {
  recommendedRole: "Premium reasoning model",
  bestFor: ["complex reasoning", "research", "coding-agent workflows"],
  avoidFor: ["cheap batch generation", "high-volume summarization"],
  routingRole: "Primary model for high-value tasks where correctness, chain planning, and tool-use quality matter more than per-token price.",
  suggestedFallbacks: ["Gemini 3 Pro", "Claude Sonnet", "DeepSeek V4 Pro"],
  costWarning: "Expensive output pricing makes this a poor default for verbose, high-volume workloads unless Ethen Gateway caps, fallbacks, or budget routing are enabled.",
};

export const modelFitMatrix: MIModelFitRowSpec[] = [
  {
    useCase: "Coding agent",
    fit: "Excellent",
    reason: "Strong reasoning profile, good instruction following, and enough speed for multi-step tool workflows.",
    routingNote: "Use as primary for risky edits, debugging, architecture planning, and final validation.",
  },
  {
    useCase: "Research",
    fit: "Excellent",
    reason: "High intelligence and verbosity are useful for synthesis, comparison, and source-grounded analysis.",
    routingNote: "Use for high-value synthesis; route extraction and cleanup to cheaper models.",
  },
  {
    useCase: "Enterprise assistant",
    fit: "Strong",
    reason: "Good premium assistant behavior, but output price makes every verbose answer expensive.",
    routingNote: "Gate by sensitivity, task complexity, and user tier.",
  },
  {
    useCase: "Batch summarization",
    fit: "Weak",
    reason: "The model is overpowered and too expensive for repetitive summarization at scale.",
    routingNote: "Prefer Gemini Flash, DeepSeek Flash, or efficient open-weight models.",
  },
  {
    useCase: "Low-latency chat",
    fit: "Moderate",
    reason: "Output speed is usable, but first-answer latency is not ideal for short conversational turns.",
    routingNote: "Use only when intent classifier predicts difficult reasoning.",
  },
  {
    useCase: "Local/private deployment",
    fit: "Not suitable",
    reason: "Proprietary hosted model; cannot satisfy local-only or air-gapped requirements.",
    routingNote: "Route to local open-weight models through Ethen Local Chat / Gateway when privacy requires it.",
  },
];

export const costPressure: MICostPressureSpec = {
  level: "High",
  summary: "Output pricing is materially above the class average, so Ethen should treat GPT-5.5 (medium) as a premium route rather than a default route.",
  cheaperSubstitutes: ["Claude Sonnet for balanced coding and reasoning", "Gemini 3 Pro for long-context premium work", "DeepSeek V4 Pro for lower-cost reasoning", "Open-weight local models for private/offline work"],
  routeAwayWhen: ["The task is simple extraction, labeling, or summarization", "The prompt has very large context and low risk", "The user is generating many drafts or variants", "The session crosses budget or rate-limit thresholds"],
};

export const modelSpecs: MISpecTableSpec = {
  comparisonTitle: "Comparison Summary",
  comparisonBody: [
    "GPT-5.5 (medium) belongs in the premium reasoning lane: strong enough for coding-agent planning, research synthesis, and enterprise assistant decisions, but too costly to be the automatic default for every request.",
    "The useful Ethen insight is not just where the bar ranks. It is when the model should be routed in, when cheaper substitutes should take over, and when a fallback chain protects reliability and budget.",
    "This page uses static preview data. The structure is designed so future Ethen Gateway telemetry, scrape outputs, and internal evals can plug into the same compact research surface.",
  ],
  specsTitle: "Technical Specifications",
  specs: [
    { label: "Reasoning", value: "Yes", icon: "⌁" },
    { label: "Input modality", value: "Text / Image / Audio / Video", icon: "↧" },
    { label: "Output modality", value: "Text", icon: "↥" },
    { label: "Context window", value: "922k", icon: "▦" },
    { label: "Class count", value: "169 models in this class", icon: "#" },
  ],
};
