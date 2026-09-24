/**
 * lib/model-intelligence/loadNormalizedModelProfile.ts
 * Load normalized profile/page/chart data for a given slug.
 */
import "server-only";

import fs from "node:fs";
import path from "node:path";
import { getModelIntelligenceDataPaths } from "./data-paths";

const NORM_DIR = getModelIntelligenceDataPaths().root;

/** Raw normalized chart spec as stored on disk */
export interface RawChartSpec {
  id: string;
  model_slug: string;
  title: string;
  description: string;
  chart_type: "bar" | "stacked_bar" | "scatter" | "unknown";
  source: {
    canonical_url: string;
    source_type: string;
  };
  dataset: {
    name: string;
    description: string;
    measurementTechnique?: string;
    citation?: string;
    data: Record<string, unknown>[];
  };
}

export interface RawModelProfile {
  slug: string;
  name: string;
  provider: string;
  model_type: string;
  release_date: string;
  summary_cards: Array<{
    id: string;
    label: string;
    value: string;
    unit: string;
    rank: string | Record<string, unknown> | null;
    hint: string;
    source: string;
  }>;
  comparison_summary: string;
  technical_specs: Array<{
    key: string;
    label: string;
    value: string;
    source: string;
  }>;
  charts: string[];
  chart_tab_labels: Record<string, string> | null;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  useful_links: Array<{
    label: string;
    url: string;
  }>;
  seo: {
    title: string;
    description: string;
    canonical_url: string;
    og_image: string;
  };
  source: {
    source_file: string;
    canonical_url: string;
    source_name: string;
    normalized_by: string;
    normalized_at: string;
  };
  quality_flags: string[];
}

export interface RawPageSpec {
  template: string;
  slug: string;
  seo: {
    title: string;
    description: string;
    canonical_url: string;
    og_image: string;
  };
  hero: {
    title: string;
    model_name: string;
    eyebrow: string;
    metadata: string[];
    actions: Array<{ label: string; action: string }>;
  };
  summary_cards: RawModelProfile["summary_cards"];
  comparison_summary: string;
  technical_specs: RawModelProfile["technical_specs"];
}

export interface NormalizedModelBundle {
  profile: RawModelProfile;
  page: RawPageSpec;
  charts: RawChartSpec[];
}

function readJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * One-release rollback seam for the pre-SOL-31 file loader. It deliberately
 * reads only the committed SOL-02 normalized directory; it never revives the
 * retired scrape tree.
 */
export function loadNormalizedModelProfileLegacy(
  slug: string,
): NormalizedModelBundle | null {
  const profilePath = path.join(NORM_DIR, "profiles", `${slug}.profile.json`);
  const pagePath = path.join(NORM_DIR, "pages", `${slug}.page.json`);
  const chartsDir = path.join(NORM_DIR, "charts", slug);

  const profile = readJson<RawModelProfile>(profilePath);
  const page = readJson<RawPageSpec>(pagePath);

  if (!profile || !page) return null;

  // Load chart specs from charts/{slug}/ directory
  const charts: RawChartSpec[] = [];
  if (fs.existsSync(chartsDir)) {
    const chartFiles = fs.readdirSync(chartsDir).filter((f) => f.endsWith(".chart.json"));
    for (const file of chartFiles) {
      const chart = readJson<RawChartSpec>(path.join(chartsDir, file));
      if (chart) charts.push(chart);
    }
  }

  return { profile, page, charts };
}

export function loadNormalizedModelProfile(
  slug: string,
): NormalizedModelBundle | null {
  const bundle = loadNormalizedModelProfileLegacy(slug);
  if (process.env.ETHEN_MODEL_INTELLIGENCE_LEGACY_LOADER === "1") {
    return bundle;
  }
  if (!bundle) return null;
  return {
    ...bundle,
    charts: bundle.charts.filter((chart) =>
      Boolean(
        chart.source?.canonical_url &&
        bundle.profile.source?.normalized_at &&
        !Number.isNaN(Date.parse(bundle.profile.source.normalized_at)) &&
        (chart.dataset?.measurementTechnique || chart.dataset?.description),
      ),
    ),
  };
}
