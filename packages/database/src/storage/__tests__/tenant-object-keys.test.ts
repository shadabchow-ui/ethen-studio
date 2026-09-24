import { parseTenantObjectKey, tenantObjectKey } from "../tenant-object-keys";
const a = "11111111-1111-4111-8111-111111111111"; const b = "22222222-2222-4222-8222-222222222222";
const key = tenantObjectKey(a, b, "proof.json");
if (parseTenantObjectKey(key)?.projectId !== a || parseTenantObjectKey(key)?.projectId === b) throw new Error("cross-project key isolation failed");
if (parseTenantObjectKey(`projects/${b}/objects/${b}/../proof.json`) !== null) throw new Error("path traversal accepted");
console.log("SOL-09 tenant object key tests passed.");
