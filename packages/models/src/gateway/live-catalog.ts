import catalog from "../data/provider-catalog/vercel.json";
export interface CatalogExecutionEvidence { modelId:string; passed:boolean; measuredAt:string; providerRequestId:string }
export function listLiveCatalog(evidence: CatalogExecutionEvidence[] = [], now=Date.now()) {
  const catalogAge=now-Date.parse(catalog.fetchedAt);
  const stale=!Number.isFinite(catalogAge)||catalogAge<0||catalogAge>7*86400000;
  return catalog.models.map(model=>{
    const cert=evidence.find(e=>e.modelId===model.id && e.passed && e.providerRequestId && now-Date.parse(e.measuredAt)>=0 && now-Date.parse(e.measuredAt)<86400000);
    return {...model,source:catalog.source,fetchedAt:catalog.fetchedAt,listed:true,stale,
      deprecated:model.deprecated as boolean|null,runnable:!stale&&Boolean(cert),healthy:cert ? true : null,
      status:stale ? "stale" as const : cert ? "healthy" as const : "listed" as const};
  });
}
