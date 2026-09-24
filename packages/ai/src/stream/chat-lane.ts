import "server-only";

import { EventEmitter } from "node:events";
import { getRedisPublisher, getRedisSubscriber } from "@ethen/models/gateway/platform/stream-redis";
import {
  appendChatStreamSegment,
  getChatStreamSegments,
  getChatStream,
  type ChatStreamRecord,
} from "../chat/persistence";
import type { ToolStep, ChatSource } from "../chat/types";

export type ChatStreamEventType =
  | "working"
  | "tool-activity"
  | "sources"
  | "chunk"
  | "completed"
  | "failed"
  | "stopped";

export interface ChatStreamEvent {
  type: ChatStreamEventType;
  runId: string;
  sequence: number;
  text?: string;
  steps?: readonly ToolStep[];
  sources?: readonly ChatSource[];
  error?: { title: string; detail: string; action: string };
  transcriptHash?: string;
  timestamp?: string;
}

// In-process event fanout for fast local delivery and fallback when Redis is absent
const localFanout = new EventEmitter();
localFanout.setMaxListeners(100);

export function getChatChannelName(streamId: string): string {
  return `chat:stream:${streamId}`;
}

/**
 * Publish a chat stream event to both Redis (if available) and local fanout,
 * and persist as a stream segment.
 */
export async function publishChatStreamEvent(
  streamId: string,
  sequence: number,
  event: Omit<ChatStreamEvent, "sequence" | "timestamp">,
): Promise<boolean> {
  const fullEvent: ChatStreamEvent = {
    ...event,
    sequence,
    timestamp: new Date().toISOString(),
  };

  const payloadStr = JSON.stringify(fullEvent);
  const channel = getChatChannelName(streamId);

  // 1. Emit locally
  localFanout.emit(channel, fullEvent);

  // 2. Publish to Redis if configured
  try {
    const publisher = await getRedisPublisher();
    if (publisher.available) {
      await publisher.publish(channel, payloadStr);
    }
  } catch {
    // Redis unavailable or failed, local delivery still holds
  }

  // 3. Persist segment to database
  try {
    await appendChatStreamSegment(streamId, sequence, event.type, fullEvent as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn("[stream/chat-lane] Segment persistence failed:", err);
  }

  return true;
}

/**
 * Subscribe to live events for a chat stream.
 * Returns an unsubscribe callback.
 */
export async function subscribeChatStream(
  streamId: string,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<() => void> {
  const channel = getChatChannelName(streamId);

  // Local listener
  const localHandler = (event: ChatStreamEvent) => {
    onEvent(event);
  };
  localFanout.on(channel, localHandler);

  let redisUnsub: (() => void) | null = null;
  try {
    const subscriber = await getRedisSubscriber();
    if (subscriber.available) {
      redisUnsub = await subscriber.subscribe(channel, (message) => {
        try {
          const parsed = JSON.parse(message) as ChatStreamEvent;
          onEvent(parsed);
        } catch {
          // ignore malformed message
        }
      });
    }
  } catch {
    // ignore Redis subscribe failure, local listener active
  }

  return () => {
    localFanout.off(channel, localHandler);
    if (redisUnsub) {
      redisUnsub();
    }
  };
}

/**
 * Replay buffered chat stream events since a given sequence number.
 * Guarantees monotonic ordering and exact reproduction of transcript.
 */
export async function replayChatStreamEvents(
  streamId: string,
  sinceSequence = 0,
): Promise<{
  stream: ChatStreamRecord | null;
  events: ChatStreamEvent[];
}> {
  const stream = await getChatStream(streamId);
  if (!stream) {
    return { stream: null, events: [] };
  }

  const segments = await getChatStreamSegments(streamId, sinceSequence);
  const events: ChatStreamEvent[] = segments.map((s) => {
    const p = s.payload as unknown as ChatStreamEvent;
    return {
      type: (s.event_type as ChatStreamEventType) ?? p.type,
      runId: p.runId ?? streamId,
      sequence: s.sequence,
      text: p.text,
      steps: p.steps,
      sources: p.sources,
      error: p.error,
      transcriptHash: p.transcriptHash,
      timestamp: s.created_at,
    };
  });

  return { stream, events };
}
