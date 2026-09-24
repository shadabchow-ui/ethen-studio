import type { ResearchSource } from "./types";

export type SourceInclusionDecision = "included" | "excluded" | "undecided";
export type SourceExtractionStatus = "not_requested" | "available" | "unavailable";

export interface SourceLedgerInput extends ResearchSource {
  provider: "exa" | "mock";
  query: string;
  runId?: string;
  requestReceiptId?: string;
  content?: string;
  extractionStatus?: SourceExtractionStatus;
}

export interface SourceQualitySignal {
  kind: "metadata_completeness" | "publication_date_present" | "content_available";
  value: boolean;
  explanation: string;
  limitation: string;
}

export interface SourceLedgerEntry {
  id: string;
  providerSourceId: string;
  canonicalUrl: string;
  raw: Readonly<ResearchSource>;
  retrievedAt: string | null;
  publishedAt: string | null;
  provider: "exa" | "mock";
  query: string;
  runId?: string;
  requestReceiptId?: string;
  contentFingerprint?: string;
  extractionStatus: SourceExtractionStatus;
  duplicateGroupId: string;
  duplicateOf?: string;
  inclusion: { decision: SourceInclusionDecision; events: SourceDecisionEvent[] };
  qualitySignals: SourceQualitySignal[];
}

export interface SourceDecisionEvent {
  type: "inclusion_decision" | "note";
  at: string;
  actorId: string;
  decision?: SourceInclusionDecision;
  note?: string;
}

const TRACKING_QUERY_KEYS = /^(utm_[a-z]+|gclid|fbclid|mc_[a-z]+)$/i;

/** Removes only known tracking data; semantic query parameters remain intact. */
export function canonicalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) parsed.port = "";
    for (const key of [...parsed.searchParams.keys()]) if (TRACKING_QUERY_KEYS.test(key)) parsed.searchParams.delete(key);
    const ordered = [...parsed.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    parsed.search = "";
    for (const [key, value] of ordered) parsed.searchParams.append(key, value);
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableId(canonicalUrl: string, providerSourceId: string): string {
  return `source-${fingerprint(`${canonicalUrl}\n${providerSourceId}`)}`;
}

function validDate(value: string | undefined): string | null {
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

function signals(source: ResearchSource, content: string | undefined): SourceQualitySignal[] {
  const complete = Boolean(source.title && source.url && validDate(source.retrievedAt));
  return [
    { kind: "metadata_completeness", value: complete, explanation: complete ? "Title, URL, and retrieval time are present." : "One or more basic retrieval fields are missing.", limitation: "Metadata completeness does not establish accuracy or authority." },
    { kind: "publication_date_present", value: Boolean(validDate(source.publishedDate)), explanation: validDate(source.publishedDate) ? "Provider supplied a parseable publication date." : "No parseable publication date was supplied.", limitation: "A publication date does not establish currency or correctness." },
    { kind: "content_available", value: Boolean(content || source.snippet), explanation: content || source.snippet ? "Provider returned extractable text or a snippet." : "No extractable text was returned.", limitation: "Available text is untrusted provider data and is not a quality score." },
  ];
}

/** Builds an inspectable ledger without mutating provider source records. */
export function buildSourceLedger(inputs: SourceLedgerInput[]): SourceLedgerEntry[] {
  const firstByGroup = new Map<string, string>();
  return inputs.map((input) => {
    const canonicalUrl = canonicalizeSourceUrl(input.url);
    const contentFingerprint = input.content ? fingerprint(input.content) : undefined;
    const duplicateGroupId = `duplicate-${fingerprint(`${canonicalUrl}\n${contentFingerprint ?? ""}`)}`;
    const id = stableId(canonicalUrl, input.id);
    const duplicateOf = firstByGroup.get(duplicateGroupId);
    if (!duplicateOf) firstByGroup.set(duplicateGroupId, id);
    const { provider, query, runId, requestReceiptId, content, extractionStatus, ...raw } = input;
    return {
      id, providerSourceId: input.id, canonicalUrl, raw, retrievedAt: validDate(input.retrievedAt), publishedAt: validDate(input.publishedDate),
      provider, query, runId, requestReceiptId, contentFingerprint, extractionStatus: extractionStatus ?? (content || input.snippet ? "available" : "not_requested"),
      duplicateGroupId, ...(duplicateOf ? { duplicateOf } : {}), inclusion: { decision: "undecided", events: [] }, qualitySignals: signals(input, content),
    };
  });
}

/** Adds an auditable decision while retaining the raw provider record unchanged. */
export function recordSourceDecision(entry: SourceLedgerEntry, event: SourceDecisionEvent): SourceLedgerEntry {
  const decision = event.type === "inclusion_decision" && event.decision ? event.decision : entry.inclusion.decision;
  return { ...entry, inclusion: { decision, events: [...entry.inclusion.events, event] } };
}

export function validateSourceLedger(entries: SourceLedgerEntry[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const urls = new Map<string, string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) errors.push(`Duplicate ledger ID: ${entry.id}.`);
    ids.add(entry.id);
    if (!entry.canonicalUrl) errors.push(`Ledger source ${entry.id} has no canonical URL.`);
    const first = urls.get(entry.duplicateGroupId);
    if (entry.duplicateOf && entry.duplicateOf !== first) errors.push(`Ledger source ${entry.id} has an invalid duplicate reference.`);
    if (!first) urls.set(entry.duplicateGroupId, entry.id);
  }
  return errors;
}
