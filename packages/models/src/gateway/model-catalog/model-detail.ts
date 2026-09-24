import type {
  GatewayCatalogModelRecord,
  GatewayModelCatalogModel,
} from "./types";
import {
  getModelDetailPage as getLoadedModelDetailPage,
  listModelDetailPages as listLoadedModelDetailPages,
  providerSlug as normalizeProviderSlug,
} from "./model-detail-loader";
import type { ModelDetailPage } from "./model-detail-types";

type CatalogModelLike = Pick<
  GatewayModelCatalogModel | GatewayCatalogModelRecord,
  "model_id" | "provider" | "providerSlug"
>;

function toSafeSingleSegmentSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getPlainModelId(modelId: string, providerSlugValue: string): string {
  const trimmed = modelId.trim();
  const lowered = trimmed.toLowerCase();
  const prefix = `${providerSlugValue.toLowerCase()}/`;

  if (lowered.startsWith(prefix)) {
    return trimmed.slice(prefix.length);
  }

  const parts = trimmed.split("/");
  return parts.at(-1) ?? trimmed;
}

function getProviderSlugValue(model: CatalogModelLike): string {
  return model.providerSlug || normalizeProviderSlug(model.provider);
}

function scoreDetailCandidate(input: {
  page: ModelDetailPage;
  rawModelId: string;
  plainModelId: string;
  plainSlug: string;
  fallbackSlug: string;
}): number | null {
  const { page, rawModelId, plainModelId, plainSlug, fallbackSlug } = input;

  if (page.modelSlug === plainSlug && plainSlug.length > 0) return 0;
  if (page.modelId === plainModelId) return 1;
  if (page.modelId === rawModelId) return 2;
  if (page.modelSlug === fallbackSlug) return 3;

  return null;
}

async function resolveCanonicalDetailPageForCatalogModel(
  model: CatalogModelLike,
): Promise<ModelDetailPage | null> {
  const pages = await listLoadedModelDetailPages();
  const providerSlugValue = getProviderSlugValue(model);
  const rawModelId = model.model_id.trim();
  const plainModelId = getPlainModelId(rawModelId, providerSlugValue);
  const plainSlug = toSafeSingleSegmentSlug(plainModelId);
  const fallbackSlug = toSafeSingleSegmentSlug(rawModelId);

  const candidates = pages
    .filter((page) => page.providerSlug === providerSlugValue)
    .map((page) => ({
      page,
      score: scoreDetailCandidate({
        page,
        rawModelId,
        plainModelId,
        plainSlug,
        fallbackSlug,
      }),
    }))
    .filter(
      (entry): entry is { page: ModelDetailPage; score: number } =>
        entry.score !== null,
    )
    .sort((left, right) => left.score - right.score);

  return candidates[0]?.page ?? null;
}

export async function listModelDetailPages(): Promise<ModelDetailPage[]> {
  return listLoadedModelDetailPages();
}

export async function getModelDetailPage(
  providerSlugValue: string,
  modelSlugValue: string,
): Promise<ModelDetailPage | null> {
  return getLoadedModelDetailPage(providerSlugValue, modelSlugValue);
}

export async function listModelDetailStaticParams(): Promise<
  Array<{ provider: string; model: string }>
> {
  const pages = await listLoadedModelDetailPages();
  return pages
    .filter(
      (page) =>
        !page.providerSlug.includes("/") &&
        !page.modelSlug.includes("/") &&
        page.providerSlug.length > 0 &&
        page.modelSlug.length > 0,
    )
    .map((page) => ({
      provider: page.providerSlug,
      model: page.modelSlug,
    }));
}

export async function getModelDetailSlugForCatalogModel(
  model: CatalogModelLike,
): Promise<string> {
  const canonicalPage = await resolveCanonicalDetailPageForCatalogModel(model);
  if (canonicalPage) {
    return canonicalPage.modelSlug;
  }

  return toSafeSingleSegmentSlug(model.model_id);
}

export async function getModelDetailHrefForCatalogModel(
  model: CatalogModelLike,
): Promise<string> {
  const canonicalPage = await resolveCanonicalDetailPageForCatalogModel(model);
  if (canonicalPage) {
    return canonicalPage.canonicalPath;
  }

  const providerSlugValue = getProviderSlugValue(model);
  const modelSlugValue = await getModelDetailSlugForCatalogModel(model);
  return `/model-library/${providerSlugValue}/${modelSlugValue}`;
}
