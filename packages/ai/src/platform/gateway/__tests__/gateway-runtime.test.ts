import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { GatewayProviderReadiness } from "..";

const REEXEC_FLAG = "ETHEN_GATEWAY_RUNTIME_TEST_REEXEC";

if (process.env[REEXEC_FLAG] !== "1" && !(process.env.NODE_OPTIONS ?? "").includes("--conditions=react-server")) {
  const require = createRequire(import.meta.url);
  const tsxCliPath = require.resolve("tsx/cli");
  const scriptPath = fileURLToPath(import.meta.url);
  const existingNodeOptions = process.env.NODE_OPTIONS?.trim() ?? "";
  const childNodeOptions = `${existingNodeOptions} --conditions=react-server`.trim();
  const child = spawnSync(process.execPath, [tsxCliPath, scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      [REEXEC_FLAG]: "1",
      NODE_OPTIONS: childNodeOptions,
    },
    stdio: "inherit",
  });

  process.exit(child.status ?? 1);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

async function main(): Promise<void> {
  const gateway = await import("..");

  const setupRequiredReadiness: GatewayProviderReadiness = {
    routeId: "research-run",
    providerId: "exa",
    providerLabel: "Exa",
    provider: {
      id: "exa",
      label: "Exa",
      status: "setup-required",
      configured: false,
      usesMockFallback: false,
      setupRequired: true,
      detail: "Exa API access is not configured for live research requests.",
      missingEnv: ["EXA_API_KEY"],
      adapterImplemented: false,
      codingModeReady: false,
    },
    status: "setup-required",
    providerClass: "setup-required",
    ready: false,
    setupRequired: true,
    usesMockFallback: false,
    adapterImplemented: false,
    codingModeReady: false,
    detail: "Exa API access is not configured for live research requests.",
    missingEnv: ["EXA_API_KEY"],
  };

  {
    const evidence = gateway.buildGatewayEvidence(setupRequiredReadiness, { traceId: "trace-1" });
    assertEqual(evidence.routeId, "research-run", "evidence keeps route id");
    assertEqual(evidence.providerId, "exa", "evidence keeps provider id");
    assertEqual(evidence.providerClass, "setup-required", "evidence keeps provider class");
    assertEqual(evidence.traceId, "trace-1", "evidence keeps trace id");
  }

  {
    const response = gateway.createSetupRequiredResponse(setupRequiredReadiness, "MISSING_API_KEY");
    assertEqual(response.status, 503, "setup-required response uses 503");
  }

  {
    const response = gateway.createUnavailableProviderResponse(
      setupRequiredReadiness,
      "EXA_ERROR",
      "The Exa provider did not complete the request.",
    );
    assertEqual(response.status, 503, "unavailable response uses 503");
  }

  {
    const payload = gateway.buildRuntimeStatusPayload();
    assert(typeof payload.configured === "boolean", "runtime payload exposes configured boolean");
    assert(Array.isArray(payload.providers), "runtime payload exposes provider list");
    assertEqual(payload.gateway.routeId, "runtime-status", "runtime payload exposes gateway route id");
  }

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
