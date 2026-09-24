import { resolveGatewayCanonicalModel } from "../model-intelligence";
import { resolveCanonicalModelReference, type CanonicalRegistryModel } from "../../model-intelligence/registry-api";
import { loadGatewayModelCatalog } from "../model-catalog/loader";

let failed = 0;
function assert(value: unknown, label: string): void { if (!value) { failed += 1; console.error(`FAIL: ${label}`); } }

const known = resolveGatewayCanonicalModel({ modelId: "gpt-4o-mini", providerId: "openai" });
assert(known.status === "mapped" && known.canonicalModel.profile.identity.slug === "gpt-4o-mini", "known Gateway model resolves to MI");

const unmapped = resolveGatewayCanonicalModel({ modelId: "operator-local-model", providerId: "openai-compatible" });
assert(unmapped.status === "unmapped", "unmapped Gateway model remains explicit");

const mismatch = resolveGatewayCanonicalModel({ modelId: "gpt-4o-mini", providerId: "anthropic" });
assert(mismatch.status === "conflict" && mismatch.reason.includes("Provider mismatch"), "provider mismatch is explicit");

const template = known.status === "mapped" ? known.canonicalModel : null;
if (template) {
  const duplicate: CanonicalRegistryModel = { ...template, profile: { ...template.profile, identity: { ...template.profile.identity, id: "mi:duplicate-gpt", slug: "duplicate-gpt", aliases: ["gpt-4o-mini"] } } };
  const ambiguous = resolveCanonicalModelReference("gpt-4o-mini", "openai", [template, duplicate]);
  assert(ambiguous.status === "conflict" && ambiguous.reason.includes("Ambiguous"), "ambiguous mapping never silently resolves");
}

async function main(): Promise<void> {
  const catalog = await loadGatewayModelCatalog();
  const mappedCatalogModel = catalog.models.find((model) => model.canonicalResolution?.status === "mapped");
  assert(mappedCatalogModel?.canonicalResolution?.status === "mapped", "catalog exposes an explicit canonical mapping");
  if (mappedCatalogModel?.canonicalResolution?.status === "mapped") {
    assert(mappedCatalogModel.canonicalResolution.canonicalModel.profile.capabilities.vision !== undefined, "Gateway can read canonical capabilities");
    assert(typeof mappedCatalogModel.latency === "string" || mappedCatalogModel.latency === null, "Gateway inventory/runtime observations remain on the catalog row");
  }
  if (failed) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
