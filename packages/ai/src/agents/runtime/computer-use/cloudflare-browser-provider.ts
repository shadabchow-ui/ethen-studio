// Server-only Cloudflare Browser Rendering provider — real Browser Run DevTools sessions.
// Implements HostedBrowserProvider using Cloudflare's persistent Browser Rendering DevTools API.
// No credentials are logged; env is read only here, never in client.

import "server-only";
import type {
  HostedBrowserAttestation,
  HostedBrowserConnectRequest,
  HostedBrowserProvider,
} from "./hosted-browser-provider";
import { browserUrlBlockReason, browserUrlBlockReasonAsync } from "./browser-sandbox";

function getCloudflareConfig(): { accountId: string; token: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error("Cloudflare Browser Rendering not configured");
  return { accountId, token };
}

type StoredSession = {
  identity: HostedBrowserConnectRequest["identity"];
  createdAt: string;
  endpoint: string; // api origin
  webSocketDebuggerUrl: string; // real remote CDP endpoint returned by Cloudflare
  sessionId: string; // real Cloudflare sessionId, NOT locally generated
};

export class CloudflareBrowserProvider implements HostedBrowserProvider {
  readonly name = "cloudflare" as const;

  private sessions = new Map<string, StoredSession>();

  async createSession(req: HostedBrowserConnectRequest): Promise<{ sessionId: string; endpoint: string }> {
    const { accountId, token } = getCloudflareConfig();
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/devtools/browser?keep_alive=600000`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Cloudflare create browser session failed: ${resp.status} ${t.slice(0, 1000)}`);
    }
    const json = (await resp.json()) as { sessionId: string; webSocketDebuggerUrl: string; devtoolsUrl?: string };
    if (!json.sessionId || !json.webSocketDebuggerUrl) {
      throw new Error(`Cloudflare create session missing sessionId/webSocketDebuggerUrl: ${JSON.stringify(json).slice(0, 1000)}`);
    }
    const sessionId = json.sessionId;
    const webSocketDebuggerUrl = json.webSocketDebuggerUrl;
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/devtools/browser/${sessionId}`;
    const createdAt = new Date().toISOString();
    const stored: StoredSession = { identity: req.identity, createdAt, endpoint, webSocketDebuggerUrl, sessionId };
    this.sessions.set(sessionId, stored);
    globalCloudflareSessions.set(sessionId, { provider: "cloudflare", ethenRunId: req.identity.ethenRunId, projectId: req.identity.projectId, actorId: req.identity.actorId, endpoint: webSocketDebuggerUrl, createdAt, webSocketDebuggerUrl });
    return { sessionId, endpoint: webSocketDebuggerUrl };
  }

  async connect(sessionId: string): Promise<{ cdpUrl?: string; wsEndpoint?: string }> {
    const rec = this.sessions.get(sessionId) ?? (globalCloudflareSessions.get(sessionId) as unknown as StoredSession | undefined);
    if (!rec) throw new Error("Unknown Cloudflare session");
    const ws = (rec as StoredSession).webSocketDebuggerUrl ?? (rec as unknown as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl ?? rec.endpoint;
    return { wsEndpoint: ws, cdpUrl: ws };
  }

  async destroy(sessionId: string): Promise<void> {
    const rec = this.sessions.get(sessionId);
    const fallback = globalCloudflareSessions.get(sessionId);
    const stored = rec ?? (fallback as unknown as StoredSession | undefined);
    // Remove from local maps first (always)
    this.sessions.delete(sessionId);
    globalCloudflareSessions.delete(sessionId);
    // Try to close real Cloudflare session via DELETE if we have account/token
    try {
      const { accountId, token } = getCloudflareConfig();
      // Cloudflare docs: DELETE /accounts/{id}/browser-rendering/devtools/browser/{sessionId}
      // Try both with and without /devtools prefix for compatibility
      const urls = [
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/devtools/browser/${sessionId}`,
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/browser/${sessionId}`,
      ];
      for (const url of urls) {
        try {
          const r = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
          if (r.ok || r.status === 404) break;
        } catch {}
      }
    } catch {}
    // Also try to close via stored endpoint if different
    if (stored && (stored as StoredSession).webSocketDebuggerUrl) {
      // No explicit close needed for WSS beyond DELETE
    }
  }

  async attest(sessionId: string): Promise<HostedBrowserAttestation> {
    const rec = this.sessions.get(sessionId) as unknown as StoredSession | undefined;
    const fallback = globalCloudflareSessions.get(sessionId) as unknown as StoredSession & { provider: string; ethenRunId: string; projectId: string } | undefined;
    const resolved = rec ?? fallback;
    if (!resolved) throw new Error("Unknown session for attestation");
    const endpoint = (resolved as StoredSession).webSocketDebuggerUrl ?? resolved.endpoint;
    const identity = (resolved as StoredSession).identity ?? { ethenRunId: (resolved as unknown as { ethenRunId: string }).ethenRunId, projectId: (resolved as unknown as { projectId: string }).projectId } as HostedBrowserConnectRequest["identity"];
    const ethenRunId = identity.ethenRunId ?? (resolved as unknown as { ethenRunId: string }).ethenRunId ?? "unknown";
    const projectId = identity.projectId ?? (resolved as unknown as { projectId: string }).projectId ?? "unknown";
    return {
      provider: "cloudflare",
      providerSessionId: sessionId,
      endpoint,
      createdAt: resolved.createdAt,
      evidence: {
        provider: "cloudflare",
        endpoint,
        sessionId,
        webSocketDebuggerUrl: endpoint,
        ethenRunId,
        projectId,
        createdAt: resolved.createdAt,
        api: "browser-rendering-devtools",
      },
    };
  }

  // Remote screenshot via SAME CDP session — enforces egress before spend
  async screenshotViaCDP(sessionId: string, url: string): Promise<{ data: Buffer; contentType: string }> {
    const rec = this.sessions.get(sessionId) ?? (globalCloudflareSessions.get(sessionId) as unknown as StoredSession | undefined);
    if (!rec) throw new Error("Unknown session");

    const syncBlock = browserUrlBlockReason(url);
    if (syncBlock) throw new Error(syncBlock);
    const asyncBlock = await browserUrlBlockReasonAsync(url);
    if (asyncBlock) throw new Error(asyncBlock);

    const wsEndpoint = (rec as StoredSession).webSocketDebuggerUrl ?? (rec as unknown as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl ?? rec.endpoint;
    if (!wsEndpoint || !wsEndpoint.startsWith("wss://")) throw new Error("Missing webSocketDebuggerUrl for screenshot");

    const token = process.env.CLOUDFLARE_API_TOKEN!;
    const proxy =
      process.env.HTTPS_PROXY ??
      process.env.https_proxy ??
      process.env.HTTP_PROXY ??
      process.env.http_proxy;
    const { HttpsProxyAgent } = await import("https-proxy-agent");
    const WebSocket = (await import("ws")).default;
    return await new Promise<{ data: Buffer; contentType: string }>((resolve, reject) => {
      const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
      const ws = new WebSocket(wsEndpoint, {
        headers: { Authorization: `Bearer ${token}` },
        ...(agent ? { agent } : {}),
      } as unknown as ConstructorParameters<typeof WebSocket>[1]);
      let targetId: string | null = null;
      let sessionIdForPage: string | null = null;
      let timeout: NodeJS.Timeout | null = null;
      const cleanup = () => { if (timeout) clearTimeout(timeout); try { ws.close(); } catch {} };
      timeout = setTimeout(() => { cleanup(); reject(new Error("CDP screenshot timeout")); }, 25000);
      ws.on("open", () => { ws.send(JSON.stringify({ id: 1, method: "Target.getTargets" })); });
      ws.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id === 1 && msg.result?.targetInfos) {
            const pageTarget = msg.result.targetInfos.find((t: { type: string }) => t.type === "page");
            if (pageTarget) { targetId = pageTarget.targetId; ws.send(JSON.stringify({ id: 2, method: "Target.attachToTarget", params: { targetId, flatten: true } })); }
            else { ws.send(JSON.stringify({ id: 2, method: "Target.createTarget", params: { url } })); }
          } else if (msg.id === 2) {
            if (msg.result?.sessionId) { sessionIdForPage = msg.result.sessionId; ws.send(JSON.stringify({ id: 3, method: "Page.navigate", params: { url }, sessionId: sessionIdForPage })); }
            else if (msg.result?.targetId) { targetId = msg.result.targetId; ws.send(JSON.stringify({ id: 2, method: "Target.attachToTarget", params: { targetId, flatten: true } })); }
          } else if (msg.method === "Target.attachedToTarget") {
            sessionIdForPage = msg.params.sessionId; ws.send(JSON.stringify({ id: 3, method: "Page.navigate", params: { url }, sessionId: sessionIdForPage }));
          } else if (msg.id === 3) {
            setTimeout(() => { const p: Record<string, unknown> = { format: "png", captureBeyondViewport: false }; if (sessionIdForPage) (p as Record<string, unknown>).sessionId = sessionIdForPage; ws.send(JSON.stringify({ id: 4, method: "Page.captureScreenshot", params: p, ...(sessionIdForPage ? { sessionId: sessionIdForPage } : {}) })); }, 2500);
          } else if (msg.id === 4 && msg.result?.data) {
            cleanup(); const buf = Buffer.from(msg.result.data, "base64"); if (buf.length === 0) reject(new Error("Empty screenshot")); else resolve({ data: buf, contentType: "image/png" });
          } else if (msg.error) { cleanup(); reject(new Error(JSON.stringify(msg.error))); }
        } catch (e) { cleanup(); reject(e); }
      });
      ws.on("error", (e: Error) => { cleanup(); reject(e); });
    });
  }

  // Remote content via SAME CDP session (for secondary proof)
  async fetchContentViaCDP(sessionId: string, url: string): Promise<string> {
    const rec = this.sessions.get(sessionId) ?? (globalCloudflareSessions.get(sessionId) as unknown as StoredSession | undefined);
    if (!rec) throw new Error("Unknown session");
    const syncBlock = browserUrlBlockReason(url);
    if (syncBlock) throw new Error(syncBlock);
    const asyncBlock = await browserUrlBlockReasonAsync(url);
    if (asyncBlock) throw new Error(asyncBlock);
    const wsEndpoint = (rec as StoredSession).webSocketDebuggerUrl ?? (rec as unknown as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl ?? rec.endpoint;
    const token2 = process.env.CLOUDFLARE_API_TOKEN!;
    const proxy2 =
      process.env.HTTPS_PROXY ??
      process.env.https_proxy ??
      process.env.HTTP_PROXY ??
      process.env.http_proxy;
    const { HttpsProxyAgent: HttpsProxyAgent2 } = await import("https-proxy-agent");
    const WebSocket2 = (await import("ws")).default;
    return await new Promise<string>((resolve, reject) => {
      const agent2 = proxy2 ? new HttpsProxyAgent2(proxy2) : undefined;
      const ws2 = new WebSocket2(wsEndpoint, {
        headers: { Authorization: `Bearer ${token2}` },
        ...(agent2 ? { agent: agent2 } : {}),
      } as unknown as ConstructorParameters<typeof WebSocket>[1]);
      let targetId2: string | null = null;
      let sid2: string | null = null;
      let timeout2: NodeJS.Timeout | null = null;
      const cleanup2 = () => { if (timeout2) clearTimeout(timeout2); try { ws2.close(); } catch {} };
      timeout2 = setTimeout(() => { cleanup2(); reject(new Error("CDP content timeout")); }, 20000);
      ws2.on("open", () => { ws2.send(JSON.stringify({ id: 1, method: "Target.getTargets" })); });
      ws2.on("message", (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id === 1 && msg.result?.targetInfos) {
            const pt = msg.result.targetInfos.find((t: { type: string }) => t.type === "page");
            if (pt) { targetId2 = pt.targetId; ws2.send(JSON.stringify({ id: 2, method: "Target.attachToTarget", params: { targetId: targetId2, flatten: true } })); }
            else { ws2.send(JSON.stringify({ id: 2, method: "Target.createTarget", params: { url } })); }
          } else if (msg.id === 2) {
            if (msg.result?.sessionId) { sid2 = msg.result.sessionId; ws2.send(JSON.stringify({ id: 3, method: "Page.navigate", params: { url }, sessionId: sid2 })); }
            else if (msg.result?.targetId) { targetId2 = msg.result.targetId; ws2.send(JSON.stringify({ id: 2, method: "Target.attachToTarget", params: { targetId: targetId2, flatten: true } })); }
          } else if (msg.method === "Target.attachedToTarget") { sid2 = msg.params.sessionId; ws2.send(JSON.stringify({ id: 3, method: "Page.navigate", params: { url }, sessionId: sid2 })); }
          else if (msg.id === 3) { setTimeout(() => { ws2.send(JSON.stringify({ id: 4, method: "Page.getResourceContent", params: { frameId: targetId2 ?? undefined, url }, sessionId: sid2 ?? undefined })); ws2.send(JSON.stringify({ id: 5, method: "DOM.getDocument", params: { depth: 1 }, sessionId: sid2 ?? undefined })); }, 1500); }
          else if (msg.id === 5 && msg.result?.root) { // fallback: evaluate
            ws2.send(JSON.stringify({ id: 6, method: "Runtime.evaluate", params: { expression: "document.documentElement.outerHTML", returnByValue: true }, sessionId: sid2 ?? undefined }));
          } else if (msg.id === 6 && msg.result?.result?.value) { cleanup2(); resolve(String(msg.result.result.value).slice(0, 20000)); }
          else if (msg.error) { cleanup2(); reject(new Error(JSON.stringify(msg.error))); }
        } catch (e) { cleanup2(); reject(e); }
      });
      ws2.on("error", (e: Error) => { cleanup2(); reject(e); });
    }).catch(async () => {
      // Fallback to REST content (still remote, but not CDP same-session)
      const { accountId } = (() => { const a = process.env.CLOUDFLARE_ACCOUNT_ID; const t = process.env.CLOUDFLARE_API_TOKEN; if (!a || !t) throw new Error("not configured"); return { accountId: a }; })();
      const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      if (!resp.ok) throw new Error(`content fallback failed ${resp.status}`);
      const ct = resp.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) { const j = await resp.json().catch(()=>null) as unknown; if (j && typeof j==="object" && "result" in (j as Record<string,unknown>)) { const r=(j as Record<string,unknown>).result as Record<string,unknown>; if (typeof r.content==="string") return r.content; } return JSON.stringify(j).slice(0,20000); }
      return await resp.text();
    });
  }

  // Legacy REST quick actions kept for non-CU-P0-09 helpers but NOT used for CU-P0-09 evidence
  async screenshot(sessionId: string, url: string): Promise<{ data: Buffer; contentType: string }> {
    return this.screenshotViaCDP(sessionId, url);
  }

  async fetchContent(sessionId: string, url: string): Promise<string> {
    return this.fetchContentViaCDP(sessionId, url);
  }
}

// Global registry for cross-instance test access (server-only)
export const globalCloudflareSessions = new Map<
  string,
  { provider: string; ethenRunId: string; projectId: string; actorId: string; endpoint: string; createdAt: string; webSocketDebuggerUrl?: string }
>();

export function getGlobalSession(sessionId: string) {
  return globalCloudflareSessions.get(sessionId);
}
