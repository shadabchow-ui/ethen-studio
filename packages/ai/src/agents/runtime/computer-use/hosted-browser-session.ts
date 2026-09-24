// Server-only module. Do NOT import from any 'use client' component.
// Hosted browser adapter — Cloudflare Browser Rendering is the configured provider.
// Credentials are server-only; attestation derives from live provider session evidence,
// not from ETHEN_BROWSER_SANDBOX_ATTESTED alone.

import "server-only";
import type { BrowserSession } from "./actions";
import type { BrowserSessionMode } from "./types";
import { CloudflareBrowserProvider, globalCloudflareSessions } from "./cloudflare-browser-provider";
import { browserUrlBlockReason, browserUrlBlockReasonAsync, getBrowserSandboxReadiness } from "./browser-sandbox";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { hostedCanaryEvidenceDir, redactReceiptForPersistence } from "./canary-evidence";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const UNAVAILABLE_REASON = "hosted browser provider not configured";

// In-memory registries for attestation, ownership, and durable receipt (server-only).
type HostedReceipt = {
  ethenRunId: string;
  projectId: string;
  actorId: string;
  provider: string;
  providerSessionId: string;
  endpoint: string;
  attestation: Record<string, string>;
  artifactId: string | null;
  status: "completed" | "cancelled" | "failed";
  createdAt: string;
  completedAt: string;
};

const hostedSessions = new Map<string, { providerSessionId: string; projectId: string; actorId: string; endpoint: string; createdAt: string; webSocketDebuggerUrl: string }>();
const hostedReceipts = new Map<string, HostedReceipt>();
const hostedArtifacts = new Map<string, { runId: string; projectId: string; providerSessionId: string; data: Buffer; contentType: string }>();

function requireExternalAttested(): boolean {
  return process.env.ETHEN_BROWSER_SANDBOX_PROVIDER === "external" && process.env.ETHEN_BROWSER_SANDBOX_ATTESTED === "true";
}

export function getHostedReceipt(runId: string): HostedReceipt | undefined {
  return hostedReceipts.get(runId);
}

export function getHostedArtifact(artifactId: string): { runId: string; projectId: string; providerSessionId: string; data: Buffer; contentType: string } | undefined {
  return hostedArtifacts.get(artifactId);
}

export function createHostedBrowserSession(
  runId: string,
  _initialUrl?: string,
  opts?: { projectId?: string; actorId?: string },
): BrowserSession & {
  __providerSessionId: () => string | null;
  __attestation: () => Record<string, string> | null;
  __canAccess: (projectId: string, actorId: string) => boolean;
  __cancel: () => Promise<{ status: string; providerSessionId: string }>;
} {
  const projectId = opts?.projectId ?? "default-project";
  const actorId = opts?.actorId ?? "default-actor";
  const viewport = { width: 1280, height: 720 };
  let providerSessionId: string | null = null;
  let attestation: Record<string, string> | null = null;
  let endpoint: string | null = null;
  let createdAt: string | null = null;
  let hasSuccessfulNav = false;
  let isCancelled = false;
  let artifactId: string | null = null;

  const provider = new CloudflareBrowserProvider();

  const ensureSession = async (): Promise<string> => {
    if (providerSessionId) return providerSessionId;
    if (!requireExternalAttested()) throw new Error(UNAVAILABLE_REASON);
    const readiness = getBrowserSandboxReadiness();
    if (readiness.status !== "secure_production" || readiness.provider !== "external") throw new Error(UNAVAILABLE_REASON);
    let res: { sessionId: string; endpoint: string } | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await provider.createSession({
          identity: {
            provider: "cloudflare",
            providerSessionId: "pending",
            endpoint: "pending",
            createdAt: new Date().toISOString(),
            ethenRunId: runId,
            projectId,
            actorId,
          },
        });
        break;
      } catch (e) {
        lastErr = e;
        const msg = (e as Error).message ?? "";
        if (msg.includes("EADDRNOTAVAIL") || (e as { code?: string }).code === "EADDRNOTAVAIL") {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    if (!res) throw lastErr as Error;
    providerSessionId = res.sessionId;
    endpoint = res.endpoint;
    createdAt = new Date().toISOString();
    hostedSessions.set(runId, { providerSessionId, projectId, actorId, endpoint, createdAt, webSocketDebuggerUrl: endpoint });
    attestation = {
      provider: "cloudflare",
      sessionId: providerSessionId,
      endpoint,
      webSocketDebuggerUrl: endpoint,
      ethenRunId: runId,
      projectId,
      actorId,
      createdAt,
      api: "browser-rendering-devtools",
    };
    return providerSessionId;
  };

  const session: BrowserSession & {
    __providerSessionId: () => string | null;
    __attestation: () => Record<string, string> | null;
    __canAccess: (projectId: string, actorId: string) => boolean;
    __cancel: () => Promise<{ status: string; providerSessionId: string }>;
  } = {
    runId,
    currentUrl: "",
    viewport,
    mode: "unavailable" as BrowserSessionMode,

    async navigate(url: string) {
      if (isCancelled) return { success: false, url: "", error: "Session cancelled" };
      const syncBlock = browserUrlBlockReason(url);
      if (syncBlock) return { success: false, url: "", error: syncBlock };
      const asyncBlock = await browserUrlBlockReasonAsync(url);
      if (asyncBlock) return { success: false, url: "", error: asyncBlock };
      try {
        const sid = await ensureSession();
        (session as unknown as { currentUrl: string }).currentUrl = url;
        hasSuccessfulNav = true;
        if (!hostedReceipts.has(runId)) {
          const rec: HostedReceipt = {
            ethenRunId: runId,
            projectId,
            actorId,
            provider: "cloudflare",
            providerSessionId: sid,
            endpoint: endpoint!,
            attestation: attestation!,
            artifactId: null,
            status: "completed",
            createdAt: createdAt!,
            completedAt: new Date().toISOString(),
          };
          hostedReceipts.set(runId, rec);
          try {
            const dir = hostedCanaryEvidenceDir();
            await mkdir(dir, { recursive: true });
            await writeFile(join(dir, `cu-p0-09-receipt-${runId}.json`), JSON.stringify(redactReceiptForPersistence(rec), null, 2), "utf8");
          } catch {}
        }
        return { success: true, url };
      } catch (e) {
        return { success: false, url: "", error: (e as Error).message };
      }
    },

    async screenshot() {
      if (isCancelled) throw new Error("Session cancelled");
      if (!hasSuccessfulNav || !providerSessionId) throw new Error("No navigation yet");
      const url = (session as unknown as { currentUrl: string }).currentUrl;
      if (!url) throw new Error("No navigation yet");
      const result = await provider.screenshotViaCDP(providerSessionId, url);
      const base64 = result.data.toString("base64");
      const dataUri = `data:${result.contentType};base64,${base64}`;
      artifactId = randomUUID();
      hostedArtifacts.set(artifactId, { runId, projectId, providerSessionId, data: result.data, contentType: result.contentType });
      const rec = hostedReceipts.get(runId);
      if (rec) {
        rec.artifactId = artifactId;
        rec.status = "completed";
        rec.completedAt = new Date().toISOString();
        try {
          const dir = hostedCanaryEvidenceDir();
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, `cu-p0-09-receipt-${runId}.json`), JSON.stringify(redactReceiptForPersistence(rec), null, 2), "utf8");
          await writeFile(join(dir, `cu-p0-09-screenshot-artifact-${artifactId}.png`), result.data);
        } catch {}
      } else {
        const newRec: HostedReceipt = {
          ethenRunId: runId,
          projectId,
          actorId,
          provider: "cloudflare",
          providerSessionId,
          endpoint: endpoint!,
          attestation: attestation!,
          artifactId,
          status: "completed",
          createdAt: createdAt!,
          completedAt: new Date().toISOString(),
        };
        hostedReceipts.set(runId, newRec);
        try {
          const dir = hostedCanaryEvidenceDir();
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, `cu-p0-09-receipt-${runId}.json`), JSON.stringify(redactReceiptForPersistence(newRec), null, 2), "utf8");
          await writeFile(join(dir, `cu-p0-09-screenshot-artifact-${artifactId}.png`), result.data);
        } catch {}
      }
      return { imageUri: dataUri, width: viewport.width, height: viewport.height };
    },

    async click(_x: number, _y: number) {
      return { success: false, error: UNAVAILABLE_REASON };
    },

    async type(_text: string) {
      return { success: false, error: UNAVAILABLE_REASON };
    },

    async scroll(_direction: string, _amount: number) {
      return { success: false, error: UNAVAILABLE_REASON };
    },

    async wait(_ms: number) {
      return { success: false, error: UNAVAILABLE_REASON };
    },

    async pressKey(_keys: string[]) {
      return { success: false, error: UNAVAILABLE_REASON };
    },

    async inspectDom() {
      return { success: false, error: UNAVAILABLE_REASON };
    },

    async extractText(_selector?: string) {
      return { success: false, error: UNAVAILABLE_REASON };
    },

    async extractLinks() {
      return { success: false, error: UNAVAILABLE_REASON };
    },

    async extractHeadings() {
      return { success: false, error: UNAVAILABLE_REASON };
    },

    async extractTable(_selector?: string) {
      return { success: false, error: UNAVAILABLE_REASON };
    },

    getState() {
      return { url: (session as unknown as { currentUrl: string }).currentUrl ?? "", title: "" };
    },

    __providerSessionId: () => providerSessionId,
    __attestation: () => attestation,
    __canAccess: (p: string, a: string) => p === projectId && a === actorId,
    __cancel: async () => {
      if (!providerSessionId) throw new Error("No session to cancel");
      isCancelled = true;
      try {
        await provider.destroy(providerSessionId);
      } catch {}
      const rec = hostedReceipts.get(runId);
      if (rec) {
        rec.status = "cancelled";
        rec.completedAt = new Date().toISOString();
        try {
          const dir = hostedCanaryEvidenceDir();
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, `cu-p0-09-receipt-${runId}.json`), JSON.stringify(redactReceiptForPersistence(rec), null, 2), "utf8");
        } catch {}
      } else {
        const newRec: HostedReceipt = {
          ethenRunId: runId,
          projectId,
          actorId,
          provider: "cloudflare",
          providerSessionId,
          endpoint: endpoint!,
          attestation: attestation!,
          artifactId,
          status: "cancelled",
          createdAt: createdAt!,
          completedAt: new Date().toISOString(),
        };
        hostedReceipts.set(runId, newRec);
        try {
          const dir = hostedCanaryEvidenceDir();
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, `cu-p0-09-receipt-${runId}.json`), JSON.stringify(redactReceiptForPersistence(newRec), null, 2), "utf8");
        } catch {}
      }
      return { status: "cancelled", providerSessionId };
    },
  };

  Object.defineProperty(session, "mode", {
    get() {
      return attestation ? ("live_browser" as BrowserSessionMode) : ("unavailable" as BrowserSessionMode);
    },
    configurable: true,
  });

  return session;
}

export { UNAVAILABLE_REASON };
