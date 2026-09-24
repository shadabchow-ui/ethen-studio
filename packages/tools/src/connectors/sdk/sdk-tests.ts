import {
  defineConnector,
  defineAction,
  validateConnectorId,
  validateActionId,
  validateRiskTier,
  validateActionApprovalForRiskTier,
  validateManifest,
  validateManifests,
} from "./index";

interface TestCase {
  name: string;
  pass: boolean;
  error?: string;
}

function test(name: string, fn: () => void): TestCase {
  try {
    fn();
    return { name, pass: true };
  } catch (e) {
    return { name, pass: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export const CONNECTOR_ID_TESTS: TestCase[] = [
  test("valid connector id passes", () => {
    assert(validateConnectorId("valid-connector") === null, "Expected valid ID to pass.");
  }),
  test("short connector id fails", () => {
    assert(validateConnectorId("a") !== null, "Expected short ID to fail.");
  }),
  test("numeric start connector id fails", () => {
    assert(validateConnectorId("123abc") !== null, "Expected number-starting ID to fail.");
  }),
  test("uppercase connector id fails", () => {
    assert(validateConnectorId("ValidConnector") !== null, "Expected uppercase ID to fail.");
  }),
  test("empty connector id fails", () => {
    assert(validateConnectorId("") !== null, "Expected empty ID to fail.");
  }),
];

export const ACTION_ID_TESTS: TestCase[] = [
  test("valid action id passes", () => {
    assert(validateActionId("provider.action_name") === null, "Expected valid action ID to pass.");
  }),
  test("no dot namespace fails", () => {
    assert(validateActionId("actionname") !== null, "Expected non-namespaced action ID to fail.");
  }),
  test("empty provider part fails", () => {
    assert(validateActionId(".action") !== null, "Expected empty provider part to fail.");
  }),
  test("empty action part fails", () => {
    assert(validateActionId("provider.") !== null, "Expected empty action part to fail.");
  }),
  test("multiple dots fails", () => {
    assert(validateActionId("a.b.c") !== null, "Expected multiple-dot action ID to fail.");
  }),
];

export const RISK_TIER_TESTS: TestCase[] = [
  test("read_only risk tier passes", () => {
    assert(validateRiskTier("read_only") === null, "Expected read_only to pass.");
  }),
  test("destructive risk tier passes", () => {
    assert(validateRiskTier("destructive") === null, "Expected destructive to pass.");
  }),
  test("invalid risk tier fails", () => {
    assert(validateRiskTier("admin_full_access") !== null, "Expected invalid risk tier to fail.");
  }),
];

export const APPROVAL_ENFORCEMENT_TESTS: TestCase[] = [
  test("destructive with no_approval fails", () => {
    const err = validateActionApprovalForRiskTier("destructive", "no_approval");
    assert(err !== null, "Expected destructive with no_approval to fail.");
  }),
  test("writes_user_content with no_approval fails", () => {
    const err = validateActionApprovalForRiskTier("writes_user_content", "no_approval");
    assert(err !== null, "Expected writes_user_content with no_approval to fail.");
  }),
  test("read_only with no_approval passes", () => {
    const err = validateActionApprovalForRiskTier("read_only", "no_approval");
    assert(err === null, `Expected null but got: ${err}`);
  }),
  test("privileged with no_approval fails", () => {
    const err = validateActionApprovalForRiskTier("privileged", "no_approval");
    assert(err !== null, "Expected privileged with no_approval to fail.");
  }),
];

export const MANIFEST_VALIDATION_TESTS: TestCase[] = [
  test("valid manifest passes", () => {
    const m = defineConnector(
      {
        id: "test-provider",
        providerId: "test-provider",
        name: "Test Provider",
        category: "automation",
        description: "A test connector.",
        authType: "none",
      },
      [
        defineAction({
          id: "test-provider.read_data",
          name: "Read Data",
          description: "Read data action.",
          inputSchema: [],
          outputSummary: "Data response.",
          riskTier: "read_only",
        }),
      ],
    );
    const result = validateManifest(m);
    assert(result.valid, `Expected valid manifest: ${result.errors.join("; ")}`);
  }),
  test("duplicate action ids fail", () => {
    const m = defineConnector(
      {
        id: "dup-provider",
        providerId: "dup-provider",
        name: "Duplicate Provider",
        category: "automation",
        description: "A connector with duplicate actions.",
        authType: "none",
      },
      [
        defineAction({
          id: "dup-provider.same_action",
          name: "Action One",
          description: "First.",
          inputSchema: [],
          outputSummary: "Result.",
          riskTier: "read_only",
        }),
        defineAction({
          id: "dup-provider.same_action",
          name: "Action Two",
          description: "Second.",
          inputSchema: [],
          outputSummary: "Result.",
          riskTier: "read_only",
        }),
      ],
    );
    const result = validateManifest(m);
    assert(!result.valid, "Expected duplicate action IDs to fail.");
  }),
  test("no actions fails", () => {
    const m = defineConnector(
      {
        id: "empty-provider",
        providerId: "empty-provider",
        name: "Empty",
        category: "automation",
        description: "No actions.",
        authType: "none",
      },
      [],
    );
    const result = validateManifest(m);
    assert(!result.valid, "Expected empty actions to fail.");
  }),
  test("destructive action without approval fails", () => {
    const m = defineConnector(
      {
        id: "dangerous-provider",
        providerId: "dangerous-provider",
        name: "Dangerous",
        category: "automation",
        description: "Unsafe connector.",
        authType: "none",
      },
      [
        defineAction({
          id: "dangerous-provider.delete_all",
          name: "Delete All",
          description: "Destroys everything.",
          inputSchema: [],
          outputSummary: "Destruction complete.",
          riskTier: "destructive",
          approvalRequirement: "no_approval",
        }),
      ],
    );
    const result = validateManifest(m);
    assert(!result.valid, "Expected destructive action with no_approval to fail.");
  }),
  test("duplicate provider ids fail", () => {
    const m1 = defineConnector(
      {
        id: "same-id",
        providerId: "same-id",
        name: "First",
        category: "automation",
        description: "First connector.",
        authType: "none",
      },
      [
        defineAction({
          id: "same-id.read",
          name: "Read",
          description: "Read.",
          inputSchema: [],
          outputSummary: "Data.",
          riskTier: "read_only",
        }),
      ],
    );
    const m2 = defineConnector(
      {
        id: "same-id",
        providerId: "same-id",
        name: "Second",
        category: "automation",
        description: "Second connector.",
        authType: "none",
      },
      [
        defineAction({
          id: "same-id.read2",
          name: "Read2",
          description: "Read2.",
          inputSchema: [],
          outputSummary: "Data2.",
          riskTier: "read_only",
        }),
      ],
    );
    const result = validateManifests([m1, m2]);
    assert(!result.valid, "Expected duplicate provider IDs to fail.");
  }),
];

export function runAllSdkTests(): TestCase[] {
  return [
    ...CONNECTOR_ID_TESTS,
    ...ACTION_ID_TESTS,
    ...RISK_TIER_TESTS,
    ...APPROVAL_ENFORCEMENT_TESTS,
    ...MANIFEST_VALIDATION_TESTS,
  ];
}

export function getTestSummary(): { total: number; passed: number; failed: number; failures: string[] } {
  const all = runAllSdkTests();
  const passed = all.filter((t) => t.pass).length;
  const failed = all.filter((t) => !t.pass);
  return {
    total: all.length,
    passed,
    failed: failed.length,
    failures: failed.map((f) => `${f.name}: ${f.error ?? "unexpected pass"}`),
  };
}
