export interface ModelDetailProviderMetric {
  providerSlug: string;
  providerLabel: string;
  statusKind: string;
  runnable: boolean;
}

export interface ModelDetailSeo {
  seoTitle: string;
  seoDescription: string;
  canonicalPath: string;
}

export interface ModelDetailPlayground {
  templateMessages: Array<{ role: string; content: string }>;
  suggestedParameters: Record<string, unknown>;
}

export interface ModelDetailFaqEntry {
  question: string;
  answer: string;
}

export interface ModelDetailEnrichment {
  displayName: string;
  seoTitle: string;
  seoDescription: string;
  heroDescription: string;
  aboutMarkdown: string;
  bestFor: string[];
  notBestFor: string[];
  promptSuggestions: string[];
  faq: ModelDetailFaqEntry[];
  contentConfidence: "high" | "medium" | "low";
  enrichmentNotes: string;
  enrichedAt: string | null;
  enrichmentVersion: string | null;
}

export interface ModelDetailSourceEntry {
  sourceKind: "vercel-catalog" | "ollama-scrape" | "gateway-catalog" | "deepseek-enrichment";
  filePath: string | null;
  rowIndex: number | null;
  extractionNotes: string;
}

export interface ModelDetailSourceMap {
  entries: ModelDetailSourceEntry[];
  primarySource: string;
}

export interface ModelDetailPage {
  providerSlug: string;
  modelSlug: string;
  canonicalPath: string;

  modelId: string;
  provider: string;

  displayName: string;
  description: string;

  capabilityFamily: string | null;
  capabilityTags: string[];

  contextWindow: string | null;
  maxOutputTokens: string | null;
  latency: string | null;
  throughput: string | null;

  inputPrice: string | null;
  outputPrice: string | null;
  cacheReadPrice: string | null;
  cacheWritePrice: string | null;

  extractionConfidence: string | null;

  providerMetrics: ModelDetailProviderMetric[];
  seo: ModelDetailSeo;
  enrichment: ModelDetailEnrichment | null;
  sourceMap: ModelDetailSourceMap;

  relatedModelSlugs: string[];
}
