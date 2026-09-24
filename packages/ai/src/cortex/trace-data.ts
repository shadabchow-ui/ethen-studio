import type { CortexRouteReceiptData } from "@ethen/contracts/cortex/receipt";

export interface SourceChipData {
  index: number;
  title: string;
  url: string;
  domain: string;
}

export interface TraceData {
  receipt: CortexRouteReceiptData | null;
  messageCount: number;
  sources: SourceChipData[];
}

function parseReceiptHeader(encodedReceipt: string): CortexRouteReceiptData | null {
  try {
    const decoded = decodeURIComponent(encodedReceipt);
    const parsed = JSON.parse(decoded) as CortexRouteReceiptData;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseSourcesHeader(encoded: string): SourceChipData[] {
  try {
    const decoded = decodeURIComponent(encoded);
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed)) return parsed as SourceChipData[];
  } catch {}
  return [];
}

export function traceDataFromHeaders(headers: Record<string, string>): TraceData | null {
  const sources = headers["X-Ethen-Cortex-Sources"]
    ? parseSourcesHeader(headers["X-Ethen-Cortex-Sources"])
    : [];

  const encodedReceipt = headers["X-Ethen-Cortex-Receipt"];
  if (encodedReceipt) {
    const receipt = parseReceiptHeader(encodedReceipt);
    if (receipt) {
      return {
        receipt,
        messageCount: 1,
        sources,
      };
    }
  }

  const receipt: CortexRouteReceiptData = {};
  let hasData = false;

  if (headers["X-Ethen-Cortex-Mode"]) {
    receipt.mode = headers["X-Ethen-Cortex-Mode"];
    hasData = true;
  }
  if (headers["X-Ethen-Cortex-Intent"]) {
    receipt.intent = headers["X-Ethen-Cortex-Intent"];
    hasData = true;
  }
  if (headers["X-Ethen-Cortex-Route-Profile"]) {
    receipt.routeProfile = headers["X-Ethen-Cortex-Route-Profile"];
    hasData = true;
  }
  if (headers["X-Ethen-Cortex-Confidence"]) {
    const conf = Number(headers["X-Ethen-Cortex-Confidence"]);
    if (!isNaN(conf)) {
      receipt.quality = receipt.quality || {};
      receipt.quality.confidence = conf >= 0.85 ? "high" : conf >= 0.6 ? "medium" : conf >= 0.3 ? "low" : "unknown";
      hasData = true;
    }
  }

  if (headers["X-Ethen-Runtime-Mode"] && !receipt.mode) {
    receipt.mode = headers["X-Ethen-Runtime-Mode"];
    hasData = true;
  }
  if (headers["X-Ethen-Runtime-Provider"]) {
    receipt.provider = {
      selectedProvider: headers["X-Ethen-Runtime-Provider"],
      providerVisible: true,
    };
    hasData = true;
  }
  if (headers["X-Ethen-Runtime-Source"]) {
    const src = headers["X-Ethen-Runtime-Source"];
    receipt.source = (src === "mock-mode" ? "mock" : src === "env-default" ? "production" : src === "auto-detected" ? "production" : undefined) as CortexRouteReceiptData["source"];
    hasData = true;
  }
  if (headers["X-Ethen-Runtime-Route"] && !receipt.routeProfile) {
    receipt.routeProfile = headers["X-Ethen-Runtime-Route"];
    hasData = true;
  }
  if (headers["X-Ethen-Runtime-Fallback"]) {
    receipt.fallback = {
      used: headers["X-Ethen-Runtime-Fallback"] === "1",
      finalStatus: headers["X-Ethen-Runtime-Fallback"] === "1" ? "fallback_success" : "primary_success",
    };
    if (headers["X-Ethen-Runtime-Fallback-Reason"]) {
      receipt.fallback.reason = headers["X-Ethen-Runtime-Fallback-Reason"];
    }
    hasData = true;
  }

  if (!hasData) return sources.length > 0 ? { receipt: null, messageCount: 1, sources } : null;

  return {
    receipt,
    messageCount: 1,
    sources,
  };
}
