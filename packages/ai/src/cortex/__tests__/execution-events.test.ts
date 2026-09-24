import assert from "node:assert/strict";
import { CORTEX_EVENT_PROTOCOL_VERSION, createCortexCompletionEvents, serializeCortexExecutionEvent } from "../execution-events";
import type { EthenRouteReceipt } from "../types";

const receipt = {
  runId: "run-1", mode: "cortex", intent: "general.chat", routeProfile: "cortex", source: "production",
  verifier: { status: "passed" }, fallback: { used: false },
} as unknown as EthenRouteReceipt;

const events = createCortexCompletionEvents(receipt, true);
assert.equal(events[0].protocol, CORTEX_EVENT_PROTOCOL_VERSION);
assert.equal(events[0].type, "receipt");
assert.equal(events[1].type, "completion");
assert.doesNotThrow(() => JSON.parse(serializeCortexExecutionEvent(events[0])));
assert.equal(createCortexCompletionEvents(receipt, false)[1].type, "error");
console.log("execution event protocol tests passed");
