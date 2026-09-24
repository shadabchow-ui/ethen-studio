import { HaltUnsafeError, JobHandler, PostDispatchUncertainError, WorkerContext } from "./types";

/**
 * JOB 04 — example typed handlers. Production handlers register by
 * `payload.kind`; unsupported kinds fail closed in the worker host.
 */

/** Echo handler: completes with the payload value; supports failure modes for tests. */
export const echoHandler: JobHandler = {
  kind: "echo",
  async execute({ job, ctx }: { job: { payload: Record<string, unknown> }; ctx: WorkerContext }) {
    await ctx.heartbeat({ round: 1 });
    const value = job.payload.value;
    if (value === "fail") {
      return { ok: false, retryable: true, code: "E_ECHO_FAIL", message: "echo handler failed by request" };
    }
    if (value === "fail-hard") {
      return { ok: false, retryable: false, code: "E_ECHO_HARD_FAIL", message: "echo handler hard-failed by request" };
    }
    if (value === "halt") {
      throw new HaltUnsafeError("echo handler requested halt");
    }
    if (value === "indeterminate") {
      throw new PostDispatchUncertainError("echo handler cannot confirm provider outcome");
    }
    return { ok: true, result: { echoed: value ?? null, kind: String(job.payload.kind) } };
  },
};

/** Dispatch-then-echo handler: records the dispatch boundary before "work". */
export const dispatchEchoHandler: JobHandler = {
  kind: "dispatch-echo",
  async execute({ job, ctx }: { job: { payload: Record<string, unknown> }; ctx: WorkerContext }) {
    const key = job.payload.key ?? job.payload.value ?? "default";
    const operationKey = `echo-op-${String(key)}`;
    await ctx.markProviderDispatched(operationKey);
    await ctx.heartbeat({ afterDispatch: true });
    return { ok: true, result: { operationKey } };
  },
};

export const EXAMPLE_HANDLERS: readonly JobHandler[] = [echoHandler, dispatchEchoHandler];
