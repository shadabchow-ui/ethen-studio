/**
 * FJ-11 — Shared frontend-visible streaming event contract.
 *
 * Re-exports the canonical typed envelope, adapters, cancellation guards,
 * and replay helpers so consumers import ONE module (`@ethen/ai/stream`) instead
 * of reaching into producer internals.
 */
export { STREAM_EVENT_CONTRACT_VERSION, STREAM_EVENT_TYPES, parseStreamEventEnvelope, parseStreamEventEnvelopeJson, isTerminal } from "./contract";
export type {
  StreamEvent,
  StreamEventEnvelope,
  StreamEventContext,
  StreamEventType,
  MessageStartEvent,
  TextDeltaEvent,
  ReasoningStatusEvent,
  ReasoningStatusData,
  ToolDispatchEvent,
  ToolResultEvent,
  CitationEvent,
  ArtifactUpdateEvent,
  ApprovalPendingEvent,
  CompletionEvent,
  CancellationEvent,
  ErrorEvent,
  PingEvent,
  UnknownEvent,
} from "./contract";

export { fromCodingStreamMessage, fromCortexExecutionEvent, fromChatbotSseFrame, fromGatewayChunk } from "./adapters";
export type { GatewayChunkLike } from "./adapters";

export { StreamCancellation, createStreamCancellation } from "./cancellation";
export type { CancelRequestResult, GenerationOutcome, StreamTerminalState } from "./cancellation";

export { resolveReplayStart, buildReplayQuery, extractSseDataLines, parseSequence } from "./replay";
export type { ReplayStart, ReplayStartInput } from "./replay";

export { createInitialStreamState, reduceStreamEvent, reduceStreamEvents, isStreamTerminal } from "./state";
export type { StreamPhase, StreamUiState, ToolRecord } from "./state";
