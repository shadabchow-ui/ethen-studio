// Credential Vault and Connector Readiness — Validation Suite
// Run with: npx tsx lib/connectors/__tests__/credential-vault.test.ts

import { CredentialVault, credentialVault, isVaultConfigured, isCredentialVaultSetupReady, storeTokens, getTokens } from "../vault";
import { assertNoPlaintextSecret, looksLikePlaintextSecret, redactCredentialRecord, redactCredentialMetadata, createMockCredentialRecord, validateCredentialMetadata } from "../credential-redaction";
import { getConnectorLiveReadiness, isConnectorSetupRequired, isExecuteAllowed, computeConnectorReadinessState, isConnectorReadOnlyReady, canConnectorWrite } from "../live-readiness";
import type { CredentialRecord } from "../credential-types";
import type { ConnectorDefinition } from "../connector-registry";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.error(`  FAIL: ${label}`); }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// ── Test: Plaintext secret rejection ──────────────────────────────────────

function testPlaintextSecretRejection(): void {
  console.log("\n[Plaintext Secret Rejection]");

  let threw = false;
  try {
    assertNoPlaintextSecret({ apiKey: "test-value" }, "test-context");
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes("Plaintext secret rejected"), "apiKey field name rejected");
    assert((e as Error).message.includes("test-context"), "error includes context");
  }
  assert(threw, "assertNoPlaintextSecret throws for secret-key field name");

  threw = false;
  try {
    assertNoPlaintextSecret({ token: "anyvalue" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "token field name rejected");

  threw = false;
  try {
    assertNoPlaintextSecret({ password: "anything" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "password field name rejected");

  threw = false;
  try {
    assertNoPlaintextSecret({ credential: "anything" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "credential field name rejected");

  threw = false;
  try {
    assertNoPlaintextSecret({ auth: "anything" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "auth field name rejected");

  threw = false;
  try {
    assertNoPlaintextSecret({ client_secret: "anything" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "client_secret field name rejected");

  threw = false;
  try {
    assertNoPlaintextSecret({ access_token: "anything" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "access_token field name rejected");

  threw = false;
  try {
    assertNoPlaintextSecret({ refresh_token: "anything" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "refresh_token field name rejected");

  threw = false;
  try {
    assertNoPlaintextSecret({ private_key: "anything" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "private_key field name rejected");

  threw = false;
  try {
    assertNoPlaintextSecret({ signing_key: "anything" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "signing_key field name rejected");

  threw = false;
  try {
    assertNoPlaintextSecret({ bearer: "anything" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "bearer field name rejected");

  // Value-looking-like-secret should also be rejected
  threw = false;
  try {
    assertNoPlaintextSecret({ safeField: "sk-live-secret-abc123" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "value looking like Stripe secret key rejected");

  threw = false;
  try {
    assertNoPlaintextSecret({ data: "ghp_1234567890abcdef" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "value looking like GitHub token rejected");

  threw = false;
  try {
    assertNoPlaintextSecret({ data: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc" }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "value looking like JWT rejected");

  // Safe values should pass
  let safeThrew = false;
  try {
    assertNoPlaintextSecret({ name: "John", age: 30, description: "test" }, "test");
  } catch (e) {
    safeThrew = true;
  }
  assert(!safeThrew, "safe object passes check");

  // Nested secrets should be caught
  threw = false;
  try {
    assertNoPlaintextSecret({ outer: { apiKey: "nested" } }, "test");
  } catch (e) {
    threw = true;
  }
  assert(threw, "nested secret key rejected");
}

// ── Test: looksLikePlaintextSecret ───────────────────────────────────────

function testLooksLikePlaintextSecret(): void {
  console.log("\n[Looks Like Plaintext Secret]");

  assert(looksLikePlaintextSecret("sk-live-abc123"), "stripe secret key detected");
  assert(looksLikePlaintextSecret("ghp_1234567890"), "github PAT detected");
  assert(looksLikePlaintextSecret("gho_1234567890"), "github oauth token detected");
  assert(looksLikePlaintextSecret("ghu_1234567890"), "github user-to-server token detected");
  assert(looksLikePlaintextSecret("ghs_1234567890"), "github server-to-server token detected");
  assert(looksLikePlaintextSecret("ghr_1234567890"), "github refresh token detected");
  assert(looksLikePlaintextSecret("xoxb-1234567890-abcdef"), "slack bot token detected");
  assert(looksLikePlaintextSecret("xoxp-1234567890"), "slack user token detected");
  assert(looksLikePlaintextSecret("ya29.abcdef12345"), "google access token detected");
  assert(looksLikePlaintextSecret("eyJ" + "hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNUrNy4NEFx"), "JWT detected");
  assert(looksLikePlaintextSecret("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=="), "base64-like long token detected");
  assert(looksLikePlaintextSecret("abcdef1234567890abcdef1234567890"), "hex-like long token detected");
  assert(!looksLikePlaintextSecret("short"), "short value not detected");
  assert(!looksLikePlaintextSecret("abc"), "too short value not detected");
  assert(!looksLikePlaintextSecret(undefined as unknown as string), "undefined not detected");
  assert(!looksLikePlaintextSecret(null as unknown as string), "null not detected");
  assert(!looksLikePlaintextSecret(12345 as unknown as string), "number not detected");
}

// ── Test: Token vault fail-closed ────────────────────────────────────────

async function testTokenVaultFailClosed(): Promise<void> {
  console.log("\n[Token Vault Fail-Closed]");

  assert(!isVaultConfigured(), "vault is not configured");
  assert(isCredentialVaultSetupReady(), "credential vault abstraction is setup-ready");

  const tokens = await getTokens("conn-1");
  assert(tokens === undefined, "getTokens returns undefined when vault not configured");

  await storeTokens("conn-1", {
    accessToken: "test-token",
    expiresAt: new Date().toISOString(),
    tokenType: "Bearer",
    scopes: [],
  });
  const afterStore = await getTokens("conn-1");
  assert(afterStore === undefined, "getTokens still returns undefined after store attempt");
}

// ── Test: Credential vault registration rejects plaintext ───────────────

function testCredentialVaultRejectsPlaintext(): void {
  console.log("\n[Credential Vault Rejects Plaintext]");

  const vault = new CredentialVault();

  let threw = false;
  try {
    vault.register({
      id: "test-1",
      metadata: {
        id: "test-1",
        providerId: "github",
        accountLabel: "test@github.com",
        status: "configured",
        scopes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastValidatedAt: null,
        lastErrorAt: null,
        lastErrorMessage: null,
        apiKey: "sk-secret-value",
      } as unknown as CredentialRecord["metadata"],
      secretRef: null,
    });
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes("Plaintext secret rejected"), "vault rejects record with apiKey in metadata");
  }
  assert(threw, "registration with plaintext secret in metadata throws");

  assertEqual(vault.size, 0, "vault remains empty after rejected registration");
}

// ── Test: Credential vault basic operations ──────────────────────────────

async function testCredentialVaultOperations(): Promise<void> {
  console.log("\n[Credential Vault Operations]");

  const vault = new CredentialVault();
  const now = new Date().toISOString();

  const record: CredentialRecord = {
    id: "cred-github-1",
    metadata: {
      id: "cred-github-1",
      providerId: "github",
      accountLabel: "test@github.com",
      status: "configured",
      scopes: [{ id: "repo", label: "Repositories", description: "Access repositories" }],
      createdAt: now,
      updatedAt: now,
      lastValidatedAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
    secretRef: { ref: "secret-ref-123", providerId: "github" },
  };

  assert(vault.register(record), "register succeeds");
  assertEqual(vault.size, 1, "vault size is 1");
  assert(vault.has("cred-github-1"), "vault has returns true");
  assert(!vault.has("nonexistent"), "vault has returns false for missing");

  const retrieved = vault.get("cred-github-1");
  assert(retrieved !== null, "get returns record");
  assertEqual(retrieved!.metadata.providerId, "github", "providerId preserved");
  assert(retrieved!.secretRef !== null, "secret ref preserved");

  assert(!vault.register(record), "duplicate registration returns false");

  const originalUpdatedAt = vault.get("cred-github-1")!.metadata.updatedAt;
  // small delay to ensure timestamp changes
  await new Promise((r) => setTimeout(r, 2));
  assert(vault.updateStatus("cred-github-1", "mock"), "updateStatus succeeds");
  const updated = vault.get("cred-github-1");
  assertEqual(updated!.metadata.status, "mock", "status updated");
  assert(typeof updated!.metadata.updatedAt === "string" && updated!.metadata.updatedAt.length > 0, "updatedAt is a valid timestamp");
  assert(updated!.metadata.updatedAt !== originalUpdatedAt, "updatedAt changed after status change");

  // listByProvider
  const byProvider = vault.listByProvider("github");
  assertEqual(byProvider.length, 1, "listByProvider finds 1 record");

  // listByStatus
  const byStatus = vault.listByStatus("mock");
  assertEqual(byStatus.length, 1, "listByStatus finds 1 mock record");

  assert(!vault.get("cred-github-1")!.metadata.lastErrorAt, "lastErrorAt stays null");
  assert(!vault.get("cred-github-1")!.metadata.lastErrorMessage, "lastErrorMessage stays null");

  // removal
  assert(vault.remove("cred-github-1"), "remove succeeds");
  assertEqual(vault.size, 0, "vault size is 0 after removal");
  assert(vault.get("cred-github-1") === null, "get returns null after removal");

  vault.clear();
  assertEqual(vault.size, 0, "clear empties vault");
}

// ── Test: Credential redaction ───────────────────────────────────────────

function testCredentialRedaction(): void {
  console.log("\n[Credential Redaction]");

  const mockRecord = createMockCredentialRecord("stripe", []);
  assertEqual(mockRecord.metadata.status, "mock", "mock record status is mock");
  assertEqual(mockRecord.metadata.accountLabel, "mock-stripe@demo.local", "mock account label");
  assertEqual(mockRecord.secretRef, null, "mock record has no secret ref");

  const redacted = redactCredentialRecord(mockRecord);
  assertEqual(redacted.status, "mock", "redacted status preserved");
  assertEqual(redacted.secretRef, null, "redacted secret ref null for mock");
  assertEqual(redacted.id, mockRecord.id, "redacted id preserved");

  const recordWithSecret: CredentialRecord = {
    id: "cred-test",
    metadata: {
      id: "cred-test",
      providerId: "github",
      accountLabel: "user@github.com",
      status: "configured",
      scopes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastValidatedAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
    secretRef: { ref: "opaque-ref", providerId: "github" },
  };

  const redactedSecret = redactCredentialRecord(recordWithSecret);
  assertEqual(redactedSecret.secretRef, "[REDACTED]", "secret ref redacted");

  const redactedMetaWithSecret = redactCredentialMetadata({
    normal: "visible",
    apiKey: "sk-l" + "ive-secret-abc123",
    nested: { password: "ghp_nested-secret-token", visible: "ok" },
  });

  assertEqual(redactedMetaWithSecret.normal, "visible", "safe field preserved");
  assert(redactedMetaWithSecret.apiKey === undefined, "apiKey key is redacted away");
  assert(redactedMetaWithSecret["[REDACTED_KEY]"] !== undefined, "redacted key exists");
  assert(typeof redactedMetaWithSecret.nested === "object", "nested object preserved");
  const nestedMeta = redactedMetaWithSecret.nested as Record<string, unknown>;
  assertEqual(nestedMeta.visible, "ok", "nested safe field preserved");
  assert(nestedMeta.password === undefined, "nested password key is redacted away");
  assert(nestedMeta["[REDACTED_KEY]"] !== undefined, "nested redacted key exists");
}

// ── Test: Credential metadata validation ─────────────────────────────────

function testCredentialMetadataValidation(): void {
  console.log("\n[Credential Metadata Validation]");

  const validMeta = createMockCredentialRecord("test-provider", []).metadata;
  const validResult = validateCredentialMetadata({ ...validMeta, status: "configured" });
  assert(validResult.valid, "configured credential is valid");
  assertEqual(validResult.status, "configured", "status is configured");

  const emptyResult = validateCredentialMetadata({
    ...validMeta,
    id: "",
    providerId: "",
    status: "configured",
  });
  assert(!emptyResult.valid, "empty id/provider is invalid");
  assertEqual(emptyResult.status, "invalid", "status is invalid");

  const missingStatus = validateCredentialMetadata({
    ...validMeta,
    status: "missing" as "configured",
  });
  assert(!missingStatus.valid, "missing status is invalid");

  const blockedStatus = validateCredentialMetadata({
    ...validMeta,
    status: "blocked" as "configured",
  });
  assert(!blockedStatus.valid, "blocked status is invalid");
}

// ── Test: Connector readiness states ─────────────────────────────────────

function testConnectorReadinessStates(): void {
  console.log("\n[Connector Readiness States]");

  const mockDef: ConnectorDefinition = {
    id: "github",
    displayName: "GitHub",
    description: "Testing",
    category: "developer",
    icon: null,
    authModes: ["oauth2"],
    capabilities: [],
    status: "mock",
    statusDetail: "Test",
    actionModes: ["read"],
    baseUrl: null,
    supportsWebhooks: false,
    rateLimit: null,
    isMock: true,
    requiresSetup: true,
    provenance: "seed",
  };

  // mock connector with no credential → mock
  const mockState = computeConnectorReadinessState(mockDef, null);
  assertEqual(mockState.state, "vault_unavailable", "vault unavailable detected first");
  assert(mockState.reason.includes("encryption vault"), "reason mentions vault");

  // not_connected: setup-required with no credential
  // (this test is covered by getConnectorLiveReadiness)
  const readiness = getConnectorLiveReadiness(mockDef, null);
  assertEqual(readiness.credentialStatus, "missing", "credential status is missing");
  assert(!readiness.ready, "not ready for live");
  assert(!readiness.setupRequired, "mock connector does not require setup (mock-only)");
  assert(!readiness.allowExecute, "execute not allowed");

  // isExecuteAllowed always false
  assert(!isExecuteAllowed(mockDef, null), "execute always blocked");

  // isConnectorSetupRequired — false for mock connectors
  assert(!isConnectorSetupRequired(mockDef, null), "github mock connector does not require setup");

  // canConnectorWrite always false
  const writeCheck = canConnectorWrite(mockDef, null);
  assert(!writeCheck.allowed, "write not allowed");
  assert(writeCheck.reason.includes("vault"), "write blocked by vault");
}

// ── Test: Read-only path gate ────────────────────────────────────────────

function testReadOnlyPathGate(): void {
  console.log("\n[Read-Only Path Gate]");

  const csvDef: ConnectorDefinition = {
    id: "csv-upload",
    displayName: "CSV Upload",
    description: "Testing",
    category: "general",
    icon: null,
    authModes: ["none"],
    capabilities: [],
    status: "mock",
    statusDetail: "Test",
    actionModes: ["read", "propose"],
    baseUrl: null,
    supportsWebhooks: false,
    rateLimit: null,
    isMock: true,
    requiresSetup: false,
    provenance: "seed",
  };

  // vault is not configured, so read-only should be blocked
  const result = isConnectorReadOnlyReady(csvDef, null);
  assert(!result.allowed, "read-only blocked when vault unavailable");
  assertEqual(result.state, "vault_unavailable", "state is vault_unavailable");

  // mock connector should also be vault-unavailable since vault check is first
  const mockResult = isConnectorReadOnlyReady(
    { ...csvDef, status: "mock", isMock: true },
    null,
  );
  assert(!mockResult.allowed, "mock read-only blocked when vault unavailable");
}

// ── Test: Write locked gates ─────────────────────────────────────────────

function testWriteLockedGates(): void {
  console.log("\n[Write Locked Gates]");

  const liveDef: ConnectorDefinition = {
    id: "stripe",
    displayName: "Stripe",
    description: "Testing",
    category: "commerce",
    icon: null,
    authModes: ["api_key"],
    capabilities: [],
    status: "live",
    statusDetail: "Test",
    actionModes: ["read", "propose"],
    baseUrl: null,
    supportsWebhooks: false,
    rateLimit: null,
    isMock: false,
    requiresSetup: true,
    provenance: "seed",
  };

  // No credential → write blocked
  const w1 = canConnectorWrite(liveDef, null);
  assert(!w1.allowed, "write blocked without credential");
  assert(w1.reason.includes("configured"), "reason mentions configured status");

  // with mock credential → write blocked
  const mockCred = createMockCredentialRecord("stripe", []);
  const w2 = canConnectorWrite(liveDef, mockCred);
  assert(!w2.allowed, "write blocked with mock credential");

  // with configured credential but no approval → write blocked
  const configuredCred: CredentialRecord = {
    id: "cred-stripe",
    metadata: {
      id: "cred-stripe",
      providerId: "stripe",
      accountLabel: "stripe@example.com",
      status: "configured",
      scopes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastValidatedAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
    secretRef: { ref: "ref-1", providerId: "stripe" },
  };
  const w3 = canConnectorWrite(liveDef, configuredCred);
  assert(!w3.allowed, "write blocked with configured credential (vault not configured)");

  // with configured credential + approval but vault unavailable → blocked
  const w4 = canConnectorWrite(liveDef, configuredCred, true);
  assert(!w4.allowed, "write blocked even with approval (vault not configured)");
}

// ── Test: isConnectorReadOnlyReady with mock credential ──────────────────

function testReadOnlyReadyWithMockCredential(): void {
  console.log("\n[Read-Only Ready With Mock Credential]");

  const def: ConnectorDefinition = {
    id: "google-drive",
    displayName: "Google Drive",
    description: "Testing",
    category: "productivity",
    icon: null,
    authModes: ["oauth2"],
    capabilities: [],
    status: "setup-required",
    statusDetail: "Test",
    actionModes: ["read", "propose"],
    baseUrl: null,
    supportsWebhooks: false,
    rateLimit: null,
    isMock: true,
    requiresSetup: true,
    provenance: "seed",
  };

  // Vault unavailable — everything blocked
  const result = isConnectorReadOnlyReady(def, null);
  assert(!result.allowed, "read-only blocked for setup-required with vault off");
  assertEqual(result.state, "vault_unavailable", "state is vault_unavailable");
}

// ── Run ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("Credential Vault and Connector Readiness — Validation\n");

  testPlaintextSecretRejection();
  testLooksLikePlaintextSecret();
  await testTokenVaultFailClosed();
  testCredentialVaultRejectsPlaintext();
  await testCredentialVaultOperations();
  testCredentialRedaction();
  testCredentialMetadataValidation();
  testConnectorReadinessStates();
  testReadOnlyPathGate();
  testWriteLockedGates();
  testReadOnlyReadyWithMockCredential();

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
  if (failed > 0) { console.error("Some assertions failed."); process.exitCode = 1; }
  else { console.log("All assertions passed."); }
}

main();
