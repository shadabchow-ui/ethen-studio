import "server-only";

import { getRedisPublisher, getRedisSubscriber } from "./stream-redis";
import { getStreamSegments, appendStreamSegment } from "./streams";
import type { StreamSegmentRecord } from "./types";

export interface FanoutSegment {
  streamId: string;
  projectId: string;
  sequence: number;
  eventId: string;
  segmentKind: string;
  charOffsetStart: number;
  charOffsetEnd: number;
  byteOffsetStart: number;
  byteOffsetEnd: number;
  deltaSha256: string | null;
  eventPayload: Record<string, unknown>;
  createdAt: string;
}

export interface FanoutStatus {
  available: boolean;
  mode: "redis" | "postgres-only" | "setup-required";
  reason: string | null;
}

export interface PublishResult {
  ok: boolean;
  reason: string | null;
}

export interface SubscribeResult {
  unsubscribe: () => Promise<void>;
  available: boolean;
  reason: string | null;
}

export interface ReplayThenFollowResult {
  replaySegments: StreamSegmentRecord[];
  follow: { available: boolean; reason: string | null };
}

function channelName(streamId: string): string {
  return `ethen:stream:${streamId}`;
}

function segmentToMessage(seg: FanoutSegment): string {
  return JSON.stringify(seg);
}

function messageToSegment(msg: string): FanoutSegment | null {
  try {
    return JSON.parse(msg) as FanoutSegment;
  } catch {
    return null;
  }
}

export async function getFanoutStatus(): Promise<FanoutStatus> {
  const pub = await getRedisPublisher();
  if (pub.available) {
    return { available: true, mode: "redis", reason: null };
  }
  return { available: false, mode: "postgres-only", reason: pub.reason };
}

export async function publishLiveSegment(segment: FanoutSegment): Promise<PublishResult> {
  const pub = await getRedisPublisher();
  if (!pub.available) {
    return { ok: false, reason: `Redis not available: ${pub.reason}` };
  }
  const ok = await pub.publish(channelName(segment.streamId), segmentToMessage(segment));
  return { ok, reason: ok ? null : "Failed to publish segment to Redis channel." };
}

export async function subscribeToLiveStream(
  streamId: string,
  onSegment: (segment: FanoutSegment) => void,
): Promise<SubscribeResult> {
  const sub = await getRedisSubscriber();
  if (!sub.available) {
    return { unsubscribe: async () => {}, available: false, reason: sub.reason };
  }
  const unsub = await sub.subscribe(channelName(streamId), (msg) => {
    const seg = messageToSegment(msg);
    if (seg) onSegment(seg);
  });
  return { unsubscribe: async () => { unsub(); }, available: true, reason: null };
}

export async function replayThenFollow(
  streamId: string,
  fromSequence: number,
  onReplay: (segment: StreamSegmentRecord) => void,
  onLive: (segment: FanoutSegment) => void,
): Promise<ReplayThenFollowResult> {
  const { segments, error } = await getStreamSegments(streamId, { fromSequence });
  if (error) {
    return { replaySegments: [], follow: { available: false, reason: error } };
  }

  for (const seg of segments) {
    onReplay(seg);
  }

  const subResult = await subscribeToLiveStream(streamId, onLive);
  return { replaySegments: segments, follow: { available: subResult.available, reason: subResult.reason } };
}

export async function followLiveStream(
  streamId: string,
  onSegment: (segment: FanoutSegment) => void,
): Promise<SubscribeResult> {
  return subscribeToLiveStream(streamId, onSegment);
}
