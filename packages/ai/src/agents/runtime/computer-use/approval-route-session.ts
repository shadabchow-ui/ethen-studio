import { createMockBrowserSession, type BrowserSession } from "./actions";
import { updateRunSandbox } from "./store";
import type { BrowserSessionMode, ComputerUseRun } from "./types";

export interface ApprovalRouteSessionResult {
  session: BrowserSession;
  mode: BrowserSessionMode;
  error?: string;
}

function runRequestsLiveBrowser(run: ComputerUseRun): boolean {
  return run.sandbox.mode === "local-browser" || run.sandbox.mode === "remote-browser";
}

export async function resolveApprovalRouteSession(
  run: ComputerUseRun,
): Promise<ApprovalRouteSessionResult> {
  if (!runRequestsLiveBrowser(run)) {
    const session = createMockBrowserSession(run.id, run.sandbox.url);
    updateRunSandbox(run.id, { browserSessionMode: "simulation" });
    return { session, mode: "simulation" };
  }

  const { resolveBrowserSession } = await import("./session-manager");
  return resolveBrowserSession(run);
}
