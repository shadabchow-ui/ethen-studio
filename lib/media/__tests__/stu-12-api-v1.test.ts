import { strict as assert } from "node:assert";
import { STUDIO_API_MAX_PAGE_SIZE, StudioApiContractError, assertStudioApiScope, parseStudioPagination, redactStudioApiValue, requireStudioIdempotency } from "../api-v1";

async function main() {
  assert.equal(parseStudioPagination(new URL("https://test/?limit=10&sort=updated_at&direction=asc")).limit, 10);
  assert.throws(() => parseStudioPagination(new URL(`https://test/?limit=${STUDIO_API_MAX_PAGE_SIZE + 1}`)), StudioApiContractError);
  assert.equal(requireStudioIdempotency(new Request("https://test", { headers: { "idempotency-key": "request-key-123" } })), "request-key-123");
  assert.throws(() => requireStudioIdempotency(new Request("https://test")), StudioApiContractError);
  assert.throws(() => assertStudioApiScope({ organizationId: "org", projectId: "project", actorId: "actor", enrollmentId: "", readinessVersion: "v1" }), StudioApiContractError);
  const safe = redactStudioApiValue({ token: "secret", url: "https://provider.example/output?token=secret" }) as Record<string, unknown>;
  assert.equal(safe.token, "[redacted]"); assert.equal(safe.url, "[redacted-url]");
  console.log("STU-12 API V1 contract tests passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
