import type { ToolId } from "@ethen/contracts/tools/types";
import {
  signSignedApprovalToken,
  validateSignedApprovalToken,
} from "@ethen/security/policies/signed-approval-token";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL: ${label}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    passed += 1;
    console.log(`  PASS: ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const TEST_SECRET = "signed-approval-token-test-secret";
const TOOL_ID = "artifact.create" as ToolId;
const EXPIRES_AT = "2099-01-01T00:00:00.000Z";

function signToken(overrides?: Partial<Parameters<typeof signSignedApprovalToken>[0]>) {
  return signSignedApprovalToken({
    proposalId: "approval-1",
    toolId: TOOL_ID,
    payloadHash: "hash-123",
    sessionId: "sess-1",
    userId: "user-1",
    expiresAt: EXPIRES_AT,
    issuedAt: "2026-06-30T00:00:00.000Z",
    secret: TEST_SECRET,
    ...overrides,
  });
}

function expected(overrides?: Partial<Parameters<typeof validateSignedApprovalToken>[0]["expected"]>) {
  return {
    proposalId: "approval-1",
    toolId: TOOL_ID,
    payloadHash: "hash-123",
    sessionId: "sess-1",
    userId: "user-1",
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function testRoundTrip(): void {
  console.log("\n[Signed Approval Token Round Trip]");
  const signed = signToken();
  assert(signed.ok, "token signs successfully");
  if (!signed.ok) return;

  const validated = validateSignedApprovalToken({
    token: signed.token,
    expected: expected(),
    secret: TEST_SECRET,
    now: new Date("2026-06-30T01:00:00.000Z"),
  });

  assert(validated.ok, "token validates successfully");
  if (!validated.ok) return;

  assertEqual(validated.claims.proposalId, "approval-1", "proposal id preserved");
  assertEqual(validated.claims.toolId, TOOL_ID, "tool id preserved");
}

function testMalformedAndUnsignedTokens(): void {
  console.log("\n[Malformed And Unsigned Tokens]");

  const malformed = validateSignedApprovalToken({
    token: "not-a-token",
    expected: expected(),
    secret: TEST_SECRET,
  });
  assert(!malformed.ok, "malformed token is rejected");
  if (!malformed.ok) {
    assertEqual(malformed.failure.code, "malformed_token", "malformed token reason is structured");
  }

  const unsigned = validateSignedApprovalToken({
    token: "payload.",
    expected: expected(),
    secret: TEST_SECRET,
  });
  assert(!unsigned.ok, "unsigned token is rejected");
  if (!unsigned.ok) {
    assertEqual(unsigned.failure.code, "unsigned_token", "unsigned token reason is structured");
  }
}

function testMismatchReasons(): void {
  console.log("\n[Claim Mismatch Reasons]");
  const signed = signToken();
  assert(signed.ok, "token signs for mismatch tests");
  if (!signed.ok) return;

  const toolMismatch = validateSignedApprovalToken({
    token: signed.token,
    expected: expected({ toolId: "travel.save_option" as ToolId }),
    secret: TEST_SECRET,
  });
  assert(!toolMismatch.ok, "tool mismatch is rejected");
  if (!toolMismatch.ok) {
    assertEqual(toolMismatch.failure.code, "tool_id_mismatch", "tool mismatch reason");
  }

  const payloadMismatch = validateSignedApprovalToken({
    token: signed.token,
    expected: expected({ payloadHash: "other-hash" }),
    secret: TEST_SECRET,
  });
  assert(!payloadMismatch.ok, "payload hash mismatch is rejected");
  if (!payloadMismatch.ok) {
    assertEqual(payloadMismatch.failure.code, "payload_hash_mismatch", "payload mismatch reason");
  }

  const sessionMismatch = validateSignedApprovalToken({
    token: signed.token,
    expected: expected({ sessionId: "sess-2" }),
    secret: TEST_SECRET,
  });
  assert(!sessionMismatch.ok, "session mismatch is rejected");
  if (!sessionMismatch.ok) {
    assertEqual(sessionMismatch.failure.code, "session_id_mismatch", "session mismatch reason");
  }

  const userMismatch = validateSignedApprovalToken({
    token: signed.token,
    expected: expected({ userId: "user-2" }),
    secret: TEST_SECRET,
  });
  assert(!userMismatch.ok, "user mismatch is rejected");
  if (!userMismatch.ok) {
    assertEqual(userMismatch.failure.code, "user_id_mismatch", "user mismatch reason");
  }
}

function testExpiryAndSignature(): void {
  console.log("\n[Expiry And Signature]");
  const expired = signToken({ expiresAt: "2026-06-30T00:00:00.000Z" });
  assert(expired.ok, "expired token still signs");
  if (expired.ok) {
    const validated = validateSignedApprovalToken({
      token: expired.token,
      expected: expected({ expiresAt: "2026-06-30T00:00:00.000Z" }),
      secret: TEST_SECRET,
      now: new Date("2026-06-30T00:00:00.001Z"),
    });
    assert(!validated.ok, "expired token is rejected");
    if (!validated.ok) {
      assertEqual(validated.failure.code, "expired_token", "expired token reason");
    }
  }

  const signed = signToken();
  assert(signed.ok, "token signs for signature test");
  if (!signed.ok) return;

  const tampered = `${signed.token}tampered`;
  const invalid = validateSignedApprovalToken({
    token: tampered,
    expected: expected(),
    secret: TEST_SECRET,
  });
  assert(!invalid.ok, "tampered signature is rejected");
  if (!invalid.ok) {
    assertEqual(invalid.failure.code, "invalid_signature", "invalid signature reason");
  }
}

console.log("\nSigned Approval Token Validation");
console.log("================================");

testRoundTrip();
testMalformedAndUnsignedTokens();
testMismatchReasons();
testExpiryAndSignature();

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
if (failed > 0) {
  process.exit(1);
}
