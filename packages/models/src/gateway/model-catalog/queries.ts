import { loadGatewayModelCatalog } from "./loader";
import {
  buildGatewayCatalogProviderRecords,
  buildGatewayCatalogRecords,
} from "./status";
import type {
  GatewayCatalogModelRecord,
  GatewayCatalogProviderRecord,
  GatewayModelCatalogSnapshot,
} from "./types";

export async function getGatewayModelCatalogSnapshot(): Promise<GatewayModelCatalogSnapshot> {
  return loadGatewayModelCatalog();
}

export async function listGatewayCatalogModels(): Promise<GatewayCatalogModelRecord[]> {
  const snapshot = await loadGatewayModelCatalog();
  return buildGatewayCatalogRecords(snapshot.models);
}

export async function listGatewayCatalogProviders(): Promise<GatewayCatalogProviderRecord[]> {
  const models = await listGatewayCatalogModels();
  return buildGatewayCatalogProviderRecords(models);
}

export async function getGatewayCatalogProvider(
  providerSlug: string,
): Promise<GatewayCatalogProviderRecord | null> {
  const providers = await listGatewayCatalogProviders();
  return providers.find((provider) => provider.providerSlug === providerSlug) ?? null;
}

export async function listGatewayCatalogModelsByProvider(
  providerSlug: string,
): Promise<GatewayCatalogModelRecord[]> {
  const models = await listGatewayCatalogModels();
  return models.filter((model) => model.providerSlug === providerSlug);
}

export async function getGatewayCatalogModel(
  providerSlug: string,
  modelId: string,
): Promise<GatewayCatalogModelRecord | null> {
  const models = await listGatewayCatalogModels();
  return models.find(
    (model) =>
      model.providerSlug === providerSlug &&
      (model.model_id === modelId || model.modelDetailSlug === modelId),
  ) ?? null;
}
