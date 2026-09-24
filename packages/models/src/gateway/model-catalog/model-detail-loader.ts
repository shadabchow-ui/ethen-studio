import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ModelDetailPage } from "./model-detail-types";

const GENERATED_PATH = "data/model-library/model-detail-pages.generated.json";

export function modelSlug(modelId: string): string {
  return modelId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function providerSlug(provider: string): string {
  return provider
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function canonicalModelPath(providerSlugValue: string, modelSlugValue: string): string {
  return `/model-library/${providerSlugValue}/${modelSlugValue}`;
}

let cachedPages: ModelDetailPage[] | null = null;

export async function loadModelDetailPages(): Promise<ModelDetailPage[]> {
  if (cachedPages) {
    return cachedPages;
  }

  const absolutePath = path.join(process.cwd(), GENERATED_PATH);
  let source: string;
  try {
    source = await readFile(absolutePath, "utf8");
  } catch {
    cachedPages = [];
    return cachedPages;
  }

  const parsed = JSON.parse(source) as ModelDetailPage[];
  cachedPages = parsed;
  return parsed;
}

export function resetModelDetailPagesCache(): void {
  cachedPages = null;
}

export async function listModelDetailPages(): Promise<ModelDetailPage[]> {
  return loadModelDetailPages();
}

export async function getModelDetailPage(
  providerSlugValue: string,
  modelSlugValue: string,
): Promise<ModelDetailPage | null> {
  const pages = await loadModelDetailPages();
  return pages.find(
    (page) => page.providerSlug === providerSlugValue && page.modelSlug === modelSlugValue,
  ) ?? null;
}

export async function listModelDetailStaticParams(): Promise<
  Array<{ provider: string; model: string }>
> {
  const pages = await loadModelDetailPages();
  return pages.map((page) => ({
    provider: page.providerSlug,
    model: page.modelSlug,
  }));
}

export async function listRelatedModelDetailPages(
  providerSlugValue: string,
  currentModelId: string,
  limit = 6,
): Promise<ModelDetailPage[]> {
  const pages = await loadModelDetailPages();

  const others = pages.filter(
    (page) =>
      page.providerSlug === providerSlugValue && page.modelId !== currentModelId,
  );

  return others.slice(0, limit);
}

export async function resolveModelDetailForCatalogRecord(
  modelId: string,
  providerName: string,
): Promise<ModelDetailPage | null> {
  const pages = await loadModelDetailPages();
  const sluggedProvider = providerSlug(providerName);
  const sluggedModel = modelSlug(modelId);

  return pages.find(
    (page) =>
      (page.modelId === modelId || page.modelSlug === sluggedModel) &&
      (page.provider === providerName || page.providerSlug === sluggedProvider),
  ) ?? null;
}
