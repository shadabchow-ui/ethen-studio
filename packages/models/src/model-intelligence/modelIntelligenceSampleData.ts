import type { ModelIntelligencePageSpec, MIRailItem } from "./modelIntelligenceTypes";
import {
  bars,
  contextValues,
  costValues,
  intelligenceValues,
  latencyValues,
  miniCharts,
  scatterData,
  speedValues,
  stackedTokenData,
  tokenValues,
} from "./sample/modelChartData";
import { costPressure, modelFitMatrix, modelSpecs, modelSummaryCards, modelVerdict } from "./sample/modelIdentity";

const rail: MIRailItem[] = [
  { id: "intelligence", label: "Intelligence" },
  { id: "intelligence-breakdown", label: "Intelligence Breakdown" },
  { id: "aa-briefcase", label: "AA-Briefcase" },
  { id: "aa-omniscience", label: "AA-Omniscience" },
  { id: "intelligence-index-comparisons", label: "Intelligence Index Comparisons" },
  { id: "token-use", label: "Token Use" },
  { id: "price-and-cost", label: "Price and Cost" },
  { id: "context-window", label: "Context Window" },
  { id: "speed", label: "Speed" },
  { id: "latency", label: "Latency" },
  { id: "end-to-end-response-time", label: "End-to-End Response Time" },
  { id: "model-size", label: "Model Size" },
];

const normalizedFooter = "Source benchmark snapshot normalized by Ethen. Static preview data only; values are for interface validation.";

export const modelIntelligenceTestPageSpec = {
  kind: "model_profile",
  topNav: {
    brandLabel: "Ethen Intelligence",
    brandHref: "/dev/model-intelligence-test",
    links: [
      { label: "Models", href: "#intelligence", active: true },
      { label: "Coding Agents", href: "#intelligence-breakdown" },
      { label: "Routing", href: "#price-and-cost" },
      { label: "Benchmarks", href: "#token-use" },
      { label: "Gateway", href: "#speed" },
      { label: "Research", href: "#latency" },
    ],
    actions: [
      { label: "Compare", href: "#", variant: "secondary", icon: "⇄" },
      { label: "API Benchmarks", href: "#", variant: "secondary", icon: "↗" },
      { label: "Use Gateway", href: "#", variant: "primary", icon: "→" },
    ],
  },
  rail,
  hero: {
    eyebrowItems: [
      { label: "OpenAI", icon: "◌" },
      { label: "Proprietary model" },
      { label: "Released April 2026" },
    ],
    title: "GPT-5.5 (medium) Intelligence, Performance & Price Analysis",
    trustChips: [
      { label: "Data snapshot", value: "preview" },
      { label: "Benchmark coverage", value: "16 / 20 evaluations" },
      { label: "Pricing freshness", value: "sample data", tone: "warning" },
      { label: "Source", value: "normalized benchmark dataset" },
      { label: "Confidence", value: "preview only", tone: "neutral" },
    ],
    actions: [
      { label: "Compare", href: "#", variant: "secondary", icon: "⇄" },
      { label: "API Benchmarks", href: "#", variant: "secondary", icon: "↗" },
      { label: "Use through Ethen Gateway", href: "#", variant: "primary", icon: "→" },
    ],
  },
  summaryCards: modelSummaryCards,
  verdict: modelVerdict,
  fitMatrix: modelFitMatrix,
  costPressure,
  specs: modelSpecs,
  sections: [
    {
      id: "intelligence",
      title: "Intelligence",
      description: "A compact model-rank view anchored around the current model and nearby competitors.",
      chartCards: [
        {
          title: "Ethen Intelligence Index",
          subtitle: "Composite benchmark score. Higher is better. Current model is highlighted in black and marked with a subtle vertical band.",
          tabs: [
            { id: "index", label: "Ethen Intelligence Index" },
            { id: "coding", label: "Coding Index" },
            { id: "agentic", label: "Agentic Index" },
          ],
          defaultTab: "index",
          modelCountLabel: "27 of 548 models",
          footer: normalizedFooter,
          accordionRows: [
            { label: "Ethen Intelligence Index", detail: "Composite preview score used as a model-profile anchor for routing and comparison decisions." },
            { label: "Model performance representation", detail: "Bars intentionally show many models at once so the page feels like a benchmark report rather than a dashboard." },
          ],
          chart: { type: "dense_bar", data: bars(intelligenceValues), metricKind: "score", visibleCount: 27 },
        },
      ],
    },
    {
      id: "intelligence-breakdown",
      title: "Intelligence Breakdown",
      description: "A two-column mini-chart grid for agentic work, finance, coding, science, instruction following, and multimodal reasoning.",
      chartCards: [
        {
          title: "Intelligence Breakdown",
          subtitle: "Compact evaluation slices help users see why a model ranks where it does and where it should be routed.",
          modelCountLabel: "16 of 20 evaluations",
          footer: normalizedFooter,
          accordionRows: [
            { label: "Evaluation coverage", detail: "Future production data can expose benchmark versions, prompt settings, task counts, and confidence intervals here." },
          ],
          chart: { type: "mini_grid", charts: miniCharts },
        },
      ],
    },
    {
      id: "price-and-cost",
      title: "Price and Cost",
      description: "Cost is not a secondary metric for Ethen; it is a routing signal that changes which model should answer.",
      chartCards: [
        {
          title: "Cost per Ethen Intelligence Task",
          subtitle: "Weighted average cost per task. Lower is better; expensive output-heavy tasks should route through budget-aware policies.",
          tabs: [
            { id: "cost", label: "Cost per Task" },
            { id: "intel", label: "Intelligence vs. Cost per Task" },
            { id: "eval", label: "Evaluation Breakdown" },
          ],
          defaultTab: "cost",
          modelCountLabel: "27 of 548 models",
          footer: normalizedFooter,
          accordionRows: [
            { label: "Cost pressure", detail: "Ethen Gateway should route away from this model when the task is simple, repetitive, or likely to generate many output tokens." },
          ],
          chart: { type: "dense_bar", data: bars(costValues), metricKind: "currency", visibleCount: 27 },
        },
        {
          title: "Intelligence vs. Cost per Task",
          subtitle: "Compact scatter view for quality-to-cost tradeoff. Use this to identify substitutes and fallback candidates.",
          modelCountLabel: "27 of 548 models",
          footer: normalizedFooter,
          accordionRows: [
            { label: "Routing interpretation", detail: "The best model is not always the highest score; it is the model whose capability matches the task value and budget." },
          ],
          chart: { type: "scatter", data: scatterData, xLabel: "Cost per task", yLabel: "Intelligence Index", xMetricKind: "currency", yMetricKind: "score", quadrantLabel: "Value candidates" },
        },
      ],
    },
    {
      id: "token-use",
      title: "Token Use",
      description: "Token behavior turns model quality into operating cost. This is where gateway policy becomes product value.",
      chartCards: [
        {
          title: "Output Tokens per Ethen Intelligence Task",
          subtitle: "Stacked token estimate by answer, reasoning, and input. Compact scale uses k/M ticks only.",
          tabs: [
            { id: "output", label: "Output Tokens" },
            { id: "input", label: "Input Tokens" },
            { id: "cache", label: "Cache Hit, Input, and Output" },
          ],
          defaultTab: "output",
          modelCountLabel: "27 of 548 models",
          footer: normalizedFooter,
          accordionRows: [
            { label: "Output token risk", detail: "Verbose models can be valuable for reasoning, but output-heavy behavior must be paired with budget caps and fallback routing." },
          ],
          chart: { type: "stacked_bar", data: stackedTokenData, metricKind: "tokens", visibleCount: 27 },
        },
        {
          title: "Total Output Tokens by Model",
          subtitle: "Large-number axis test. It should render compact ticks such as 0, 250k, 500k, 750k, 1M — never dozens of tick labels.",
          modelCountLabel: "27 of 548 models",
          footer: normalizedFooter,
          chart: { type: "dense_bar", data: bars(tokenValues), metricKind: "tokens", visibleCount: 27 },
        },
      ],
    },
    {
      id: "context-window",
      title: "Context Window",
      chartCards: [
        {
          title: "Context Window by Model",
          subtitle: "Large-number axis test. This should render compact ticks such as 0, 500k, 1M, 1.5M, 2M — never dozens of tick labels.",
          modelCountLabel: "27 of 548 models",
          footer: normalizedFooter,
          chart: { type: "dense_bar", data: bars(contextValues), metricKind: "context", visibleCount: 27 },
        },
      ],
    },
    {
      id: "speed",
      title: "Speed",
      chartCards: [
        {
          title: "Output Speed",
          subtitle: "Measured output tokens per second. Higher is better, but speed should be read with latency, verbosity, and task difficulty.",
          tabs: [
            { id: "speed", label: "Output Speed" },
            { id: "time", label: "Time per Task" },
            { id: "variance", label: "Speed Variance" },
          ],
          defaultTab: "speed",
          modelCountLabel: "27 of 548 models",
          footer: normalizedFooter,
          accordionRows: [
            { label: "Output speed", detail: "Speed should be read together with latency and cost; fast output does not always mean better user-perceived performance." },
            { label: "Gateway routing", detail: "For low-latency chat, Ethen can route simple turns to faster substitutes and reserve GPT-5.5 for harder turns." },
          ],
          chart: { type: "dense_bar", data: bars(speedValues), metricKind: "speed", visibleCount: 27 },
        },
      ],
    },
    {
      id: "latency",
      title: "Latency",
      chartCards: [
        {
          title: "Latency: Time to First Answer Token",
          subtitle: "Seconds to first answer token. Lower is better; reasoning time is included when applicable.",
          tabs: [
            { id: "first-answer", label: "Time to First Answer Token" },
            { id: "first-token", label: "Time to First Token" },
            { id: "variance", label: "Latency Variance" },
          ],
          defaultTab: "first-answer",
          modelCountLabel: "27 of 548 models",
          footer: normalizedFooter,
          accordionRows: [
            { label: "Thinking / reasoning time", detail: "Future version can split thinking time from input processing time when the data source supports it." },
            { label: "End-to-end response time", detail: "End-to-end response time combines first-token latency, output speed, and verbosity." },
          ],
          chart: { type: "dense_bar", data: bars(latencyValues), metricKind: "latency", visibleCount: 27 },
        },
      ],
    },
  ],
  footer: [
    "Ethen Model Intelligence test page — static preview data only.",
    "No scrape pipeline, production model routes, provider pages, or calculators are touched by this test bundle.",
  ],
} satisfies ModelIntelligencePageSpec;
