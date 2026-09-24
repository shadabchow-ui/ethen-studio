/**
 * CR-09A — Universal task envelope.
 *
 * The typed envelope carries everything a console submission needs: the
 * prompt, attachment metadata, project context, selected model, resolved
 * product/agent, tools, execution mode, approval policy, source route, and
 * the eventual session/run ids that durable creation attaches to it.
 *
 * The envelope is the single contract shared by the console composer
 * (client), the console launch route (server), the durable run payload, and
 * the workspace handoff query string. It is pure and framework-free so both
 * client and server can validate and round-trip it.
 */

export type ConsoleExecutionMode = "interactive" | "asynchronous";

export type ConsoleApprovalPolicy = "automatic" | "prompt";

export interface TaskAttachmentReference {
  /** Durable asset id in private attachment storage. */
  assetId: string;
  /** Owning project id for authorization. */
  projectId: string;
  /** MIME type at upload time. */
  mimeType: string;
}

export interface TaskAttachment {
  /** Stable local id for the attachment within the envelope. */
  id: string;
  /** File name as captured from the user's selection. */
  name: string;
  /** Size in bytes. Metadata only — file content is not embedded. */
  size: number;
  /** MIME type when the browser provided one. */
  type: string;
  /**
   * JOB 7 — durable reference into private attachment storage. Present only
   * when the file was uploaded through /api/attachments/upload; the worker
   * resolves it into model context at execution time.
   */
  assetRef?: TaskAttachmentReference;
}

export interface UniversalTaskEnvelope {
  /** Free-form user prompt. Required, non-empty. */
  prompt: string;
  /** Attachment metadata captured at submit time. */
  attachments: TaskAttachment[];
  /** Selected project id, or null when no project is attached. */
  projectId: string | null;
  /** Selected model id (Model Library slug), or null for platform default. */
  modelId: string | null;
  /** Explicit product selection (flagship id), or null for intent inference. */
  productId: string | null;
  /** Resolved agent slug (filled by routing; null before resolution). */
  agentSlug: string | null;
  /** Selected tool ids (empty = platform defaults). */
  tools: string[];
  executionMode: ConsoleExecutionMode;
  approvalPolicy: ConsoleApprovalPolicy;
  /** Route that created the task (defaults to "/console"). */
  sourceRoute: string;
  /** Durable session id, attached after session creation. */
  sessionId: string | null;
  /** Durable run id, attached after run creation. */
  runId: string | null;
  /** Context identifier or route context associated with the task. */
  context?: string | null;
}

export const MAX_ENVELOPE_PROMPT_LENGTH = 8000;
export const MAX_ENVELOPE_ATTACHMENTS = 20;
export const MAX_ATTACHMENT_NAME_LENGTH = 255;

export interface CreateTaskEnvelopeInput {
  prompt: string;
  attachments?: TaskAttachment[];
  projectId?: string | null;
  modelId?: string | null;
  productId?: string | null;
  agentSlug?: string | null;
  tools?: string[];
  executionMode?: ConsoleExecutionMode;
  approvalPolicy?: ConsoleApprovalPolicy;
  sourceRoute?: string;
  sessionId?: string | null;
  runId?: string | null;
  context?: string | null;
}

/** Normalize any unknown-ish input into a typed envelope with safe defaults. */
function normalizeAssetRef(value: unknown): TaskAttachmentReference | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.assetId !== "string" || !record.assetId ||
    typeof record.projectId !== "string" || !record.projectId ||
    typeof record.mimeType !== "string" || !record.mimeType
  ) {
    return undefined;
  }
  return { assetId: record.assetId, projectId: record.projectId, mimeType: record.mimeType };
}

export function createTaskEnvelope(input: CreateTaskEnvelopeInput): UniversalTaskEnvelope {
  const attachments = Array.isArray(input.attachments)
    ? input.attachments
        .filter((a) => a && typeof a.name === "string")
        .slice(0, MAX_ENVELOPE_ATTACHMENTS)
        .map((a) => {
          const attachment: TaskAttachment = {
            id: typeof a.id === "string" && a.id ? a.id : `${a.name}:${a.size ?? 0}`,
            name: a.name,
            size: typeof a.size === "number" && Number.isFinite(a.size) && a.size >= 0 ? a.size : 0,
            type: typeof a.type === "string" ? a.type : "",
          };
          const assetRef = normalizeAssetRef((a as { assetRef?: unknown }).assetRef);
          if (assetRef) attachment.assetRef = assetRef;
          return attachment;
        })
    : [];
  const tools = Array.isArray(input.tools)
    ? input.tools.filter((t) => typeof t === "string" && t.trim() !== "")
    : [];

  return {
    prompt: typeof input.prompt === "string" ? input.prompt.trim() : "",
    attachments,
    projectId: typeof input.projectId === "string" && input.projectId ? input.projectId : null,
    modelId: typeof input.modelId === "string" && input.modelId ? input.modelId : null,
    productId: typeof input.productId === "string" && input.productId ? input.productId : null,
    agentSlug: typeof input.agentSlug === "string" && input.agentSlug ? input.agentSlug : null,
    tools,
    executionMode: input.executionMode === "asynchronous" ? "asynchronous" : "interactive",
    approvalPolicy: input.approvalPolicy === "prompt" ? "prompt" : "automatic",
    sourceRoute: typeof input.sourceRoute === "string" && input.sourceRoute ? input.sourceRoute : "/console",
    sessionId: typeof input.sessionId === "string" && input.sessionId ? input.sessionId : null,
    runId: typeof input.runId === "string" && input.runId ? input.runId : null,
    context: typeof input.context === "string" && input.context ? input.context : null,
  };
}

export type EnvelopeValidation = { ok: true } | { ok: false; error: string };

export function validateTaskEnvelope(envelope: UniversalTaskEnvelope): EnvelopeValidation {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, error: "Envelope must be an object." };
  }
  const prompt = typeof envelope.prompt === "string" ? envelope.prompt.trim() : "";
  if (!prompt) {
    return { ok: false, error: "A prompt is required." };
  }
  if (prompt.length > MAX_ENVELOPE_PROMPT_LENGTH) {
    return {
      ok: false,
      error: `Prompt exceeds the ${MAX_ENVELOPE_PROMPT_LENGTH}-character limit.`,
    };
  }
  if (!Array.isArray(envelope.attachments)) {
    return { ok: false, error: "Attachments must be a list." };
  }
  for (const attachment of envelope.attachments) {
    if (!attachment || typeof attachment.name !== "string" || !attachment.name.trim()) {
      return { ok: false, error: "Every attachment needs a name." };
    }
    if (attachment.name.length > MAX_ATTACHMENT_NAME_LENGTH) {
      return { ok: false, error: "Attachment names are limited to 255 characters." };
    }
    if (typeof attachment.size !== "number" || !Number.isFinite(attachment.size) || attachment.size < 0) {
      return { ok: false, error: "Attachment size must be a non-negative number." };
    }
    const assetRef = (attachment as { assetRef?: unknown }).assetRef;
    if (assetRef !== undefined && normalizeAssetRef(assetRef) === undefined) {
      return { ok: false, error: "Attachment references must carry assetId, projectId, and mimeType." };
    }
  }
  if (!Array.isArray(envelope.tools)) {
    return { ok: false, error: "Tools must be a list." };
  }
  for (const tool of envelope.tools) {
    if (typeof tool !== "string" || !tool.trim()) {
      return { ok: false, error: "Tool ids must be non-empty strings." };
    }
  }
  if (envelope.executionMode !== "interactive" && envelope.executionMode !== "asynchronous") {
    return { ok: false, error: "Execution mode must be interactive or asynchronous." };
  }
  if (envelope.approvalPolicy !== "automatic" && envelope.approvalPolicy !== "prompt") {
    return { ok: false, error: "Approval policy must be automatic or prompt." };
  }
  if (envelope.sessionId !== null && typeof envelope.sessionId !== "string") {
    return { ok: false, error: "Session id must be a string or null." };
  }
  if (envelope.runId !== null && typeof envelope.runId !== "string") {
    return { ok: false, error: "Run id must be a string or null." };
  }
  return { ok: true };
}

/**
 * Encode the envelope for a navigation query string. Plain percent-encoded
 * JSON: compact, isomorphic (server + client), and small enough for the
 * handoff URL (attachment metadata only — no file content).
 */
export function encodeEnvelopeForUrl(envelope: UniversalTaskEnvelope): string {
  return encodeURIComponent(JSON.stringify(envelope));
}

/**
 * Decode an envelope from a query string. Returns null for any malformed
 * input so a broken handoff link degrades to "no context" instead of
 * throwing during render.
 */
export function decodeEnvelopeFromUrl(raw: string | null | undefined): UniversalTaskEnvelope | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const candidate = parsed as Partial<UniversalTaskEnvelope>;
    if (typeof candidate.prompt !== "string") return null;
    const envelope = createTaskEnvelope({
      prompt: candidate.prompt,
      attachments: Array.isArray(candidate.attachments) ? (candidate.attachments as TaskAttachment[]) : [],
      projectId: typeof candidate.projectId === "string" ? candidate.projectId : null,
      modelId: typeof candidate.modelId === "string" ? candidate.modelId : null,
      productId: typeof candidate.productId === "string" ? candidate.productId : null,
      agentSlug: typeof candidate.agentSlug === "string" ? candidate.agentSlug : null,
      tools: Array.isArray(candidate.tools) ? candidate.tools.filter((t): t is string => typeof t === "string") : [],
      executionMode: candidate.executionMode,
      approvalPolicy: candidate.approvalPolicy,
      sourceRoute: typeof candidate.sourceRoute === "string" ? candidate.sourceRoute : undefined,
      sessionId: typeof candidate.sessionId === "string" ? candidate.sessionId : null,
      runId: typeof candidate.runId === "string" ? candidate.runId : null,
      context: typeof candidate.context === "string" ? candidate.context : null,
    });
    return validateTaskEnvelope(envelope).ok ? envelope : null;
  } catch {
    return null;
  }
}
