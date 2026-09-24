// Server-only provider abstraction for hosted isolated browsers.
// No credentials are read here; the caller must supply a resolved provider config.
// This file defines the contract that a real vendor adapter (Browserbase, Browserless,
// Steel, Cloudflare Browser Rendering, remote CDP/WebSocket) must implement.
// It does NOT import vendor SDKs or read env vars — that stays in the seam.

import "server-only";

export type HostedBrowserProviderName = "browserbase" | "browserless" | "steel" | "cloudflare" | "generic-cdp";

export interface HostedBrowserSessionIdentity {
  provider: HostedBrowserProviderName;
  providerSessionId: string;
  ethenRunId: string;
  projectId: string;
  actorId: string;
  endpoint: string; // provider endpoint origin (no secret)
  createdAt: string;
}

export interface HostedBrowserAttestation {
  provider: HostedBrowserProviderName;
  providerSessionId: string;
  endpoint: string;
  createdAt: string;
  // Server-observed metadata that proves a real remote session exists.
  evidence: Record<string, string>;
}

export interface HostedBrowserConnectRequest {
  identity: HostedBrowserSessionIdentity;
  initialUrl?: string;
  // Server-only: caller must enforce browserUrlBlockReason/browserUrlBlockReasonAsync
  // and approval binding before calling connect.
}

export interface HostedBrowserProvider {
  readonly name: HostedBrowserProviderName;
  createSession(req: HostedBrowserConnectRequest): Promise<{ sessionId: string; endpoint: string }>;
  connect(sessionId: string): Promise<{ cdpUrl?: string; wsEndpoint?: string }>;
  destroy(sessionId: string): Promise<void>;
  // Attestation must derive from real session evidence, not env flag alone.
  attest(sessionId: string): Promise<HostedBrowserAttestation>;
}

export function assertHostedAttestation(att: HostedBrowserAttestation): void {
  if (!att.provider || !att.providerSessionId || !att.endpoint || !att.createdAt) {
    throw new Error("Hosted attestation incomplete: missing provider/session/endpoint/timestamp");
  }
  if (!att.evidence || Object.keys(att.evidence).length === 0) {
    throw new Error("Hosted attestation requires provider evidence");
  }
}
