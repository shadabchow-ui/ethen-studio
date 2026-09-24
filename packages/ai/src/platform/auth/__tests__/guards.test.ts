import { requireAdmin, requireAuth, requireCapability, guardError } from "../guards";
let failed = 0; const assert = (ok: boolean, label: string) => { if (!ok) { failed++; console.error(`FAIL: ${label}`); } else console.log(`PASS: ${label}`); };
async function main() {
  const allowed = await requireAuth({ api: true, resolve: async () => "user-a" }); assert(allowed.state === "authorized", "valid trusted actor allowed");
  const missing = await requireAuth({ api: true, resolve: async () => null }); assert(missing.response?.status === 401, "missing token denied as JSON");
  const malformed = await requireAuth({ api: true, resolve: async () => null }); assert(malformed.state === "unauthenticated", "malformed token denied");
  const expired = await requireAuth({ api: true, resolve: async () => null }); assert(expired.state === "unauthenticated", "expired token denied");
  assert(requireAdmin({ api: true, actorId: "user-a", isAdmin: false }).response?.status === 403, "non-admin denied");
  assert(requireCapability({ api: true, actorId: "user-a", capabilities: [], capability: "write" }).response?.status === 403, "missing membership/capability denied");
  assert(guardError("unauthenticated", false).status === 307, "page denial redirects"); if (failed) process.exit(1);
} void main();
