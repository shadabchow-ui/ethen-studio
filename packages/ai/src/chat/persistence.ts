import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createServiceClient } from "@ethen/database/service";
import { hasConfiguredSupabaseServerEnv } from "@ethen/config/env";

export interface ChatRecord {
  id: string;
  user_id: string;
  title: string;
  model_id: string;
  visibility: "private" | "public" | "shared";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRecord {
  id: string;
  chat_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  blocks: unknown[];
  steps: unknown[];
  sources: unknown[];
  attachments: unknown[];
  run_id: string | null;
  attempt: number;
  stopped: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatStreamRecord {
  stream_id: string;
  chat_id: string;
  user_id: string;
  status: "live" | "completed" | "failed" | "interrupted" | "expired" | "cancelled";
  last_sequence: number;
  transcript: string;
  transcript_sha256: string | null;
  error_class: string | null;
  expires_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChatStreamSegmentRecord {
  id: string;
  stream_id: string;
  sequence: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export function computeTranscriptHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ── In-memory store for dev/testing when Supabase server env is absent ────────

const memChats = new Map<string, ChatRecord>();
const memMessages = new Map<string, ChatMessageRecord[]>();
const memStreams = new Map<string, ChatStreamRecord>();
const memSegments = new Map<string, ChatStreamSegmentRecord[]>();

export function clearMemoryStoresForTesting(): void {
  memChats.clear();
  memMessages.clear();
  memStreams.clear();
  memSegments.clear();
}

function getService(actorId: string | null) {
  if (!hasConfiguredSupabaseServerEnv()) return null;
  return createServiceClient({ reason: "chat_persistence", actorId });
}

// ── Chat CRUD ────────────────────────────────────────────────────────────────

export async function createChat(
  userId: string,
  input?: { id?: string; title?: string; modelId?: string; metadata?: Record<string, unknown> },
): Promise<ChatRecord> {
  const id = input?.id ?? `chat_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date().toISOString();
  const record: ChatRecord = {
    id,
    user_id: userId,
    title: input?.title ?? "New Chat",
    model_id: input?.modelId ?? "astra",
    visibility: "private",
    metadata: input?.metadata ?? {},
    created_at: now,
    updated_at: now,
  };

  const sb = getService(userId);
  if (sb) {
    const { error } = await sb.from("chats").insert({
      id: record.id,
      user_id: record.user_id,
      title: record.title,
      model_id: record.model_id,
      visibility: record.visibility,
      metadata: record.metadata,
      created_at: record.created_at,
      updated_at: record.updated_at,
    });
    if (error) {
      console.warn("[chat/persistence] createChat insert failed:", error.message);
    }
  }

  // Always keep in-memory sync for instant availability
  memChats.set(record.id, record);
  return record;
}

export async function getChat(chatId: string, userId: string): Promise<ChatRecord | null> {
  const sb = getService(userId);
  if (sb) {
    const { data, error } = await sb
      .from("chats")
      .select("*")
      .eq("id", chatId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!error && data) {
      return data as ChatRecord;
    }
  }

  const inMem = memChats.get(chatId);
  if (inMem && inMem.user_id === userId) {
    return inMem;
  }
  return null;
}

export async function listChats(userId: string): Promise<ChatRecord[]> {
  const sb = getService(userId);
  if (sb) {
    const { data, error } = await sb
      .from("chats")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (!error && data) {
      return data as ChatRecord[];
    }
  }

  return Array.from(memChats.values())
    .filter((c) => c.user_id === userId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function updateChat(
  chatId: string,
  userId: string,
  update: Partial<Pick<ChatRecord, "title" | "model_id" | "visibility" | "metadata">>,
): Promise<ChatRecord | null> {
  const now = new Date().toISOString();
  const sb = getService(userId);
  if (sb) {
    const { data, error } = await sb
      .from("chats")
      .update({ ...update, updated_at: now })
      .eq("id", chatId)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (!error && data) {
      const updated = data as ChatRecord;
      memChats.set(chatId, updated);
      return updated;
    }
  }

  const existing = memChats.get(chatId);
  if (existing && existing.user_id === userId) {
    const updated: ChatRecord = {
      ...existing,
      ...update,
      updated_at: now,
    };
    memChats.set(chatId, updated);
    return updated;
  }
  return null;
}

export async function deleteChat(chatId: string, userId: string): Promise<boolean> {
  const sb = getService(userId);
  if (sb) {
    const { error } = await sb.from("chats").delete().eq("id", chatId).eq("user_id", userId);
    if (error) {
      console.warn("[chat/persistence] deleteChat error:", error.message);
    }
  }

  const existing = memChats.get(chatId);
  if (existing && existing.user_id === userId) {
    memChats.delete(chatId);
    memMessages.delete(chatId);
    return true;
  }
  return true;
}

// ── Messages CRUD ────────────────────────────────────────────────────────────

export async function saveChatMessage(
  message: Omit<ChatMessageRecord, "created_at"> & { created_at?: string },
): Promise<ChatMessageRecord> {
  const now = message.created_at ?? new Date().toISOString();
  const record: ChatMessageRecord = {
    ...message,
    created_at: now,
  };

  const sb = getService(record.user_id);
  if (sb) {
    const { error } = await sb.from("chat_messages").upsert(
      {
        id: record.id,
        chat_id: record.chat_id,
        user_id: record.user_id,
        role: record.role,
        content: record.content,
        blocks: record.blocks,
        steps: record.steps,
        sources: record.sources,
        attachments: record.attachments,
        run_id: record.run_id,
        attempt: record.attempt,
        stopped: record.stopped,
        metadata: record.metadata,
        created_at: record.created_at,
      },
      { onConflict: "id" },
    );
    if (error) {
      console.warn("[chat/persistence] saveChatMessage upsert error:", error.message);
    }
  }

  const list = memMessages.get(record.chat_id) ?? [];
  const idx = list.findIndex((m) => m.id === record.id);
  if (idx >= 0) {
    list[idx] = record;
  } else {
    list.push(record);
  }
  memMessages.set(record.chat_id, list);

  // Update chat updated_at
  await updateChat(record.chat_id, record.user_id, {});
  return record;
}

export async function saveChatMessages(
  messages: Array<Omit<ChatMessageRecord, "created_at"> & { created_at?: string }>,
): Promise<boolean> {
  if (messages.length === 0) return true;
  for (const m of messages) {
    await saveChatMessage(m);
  }
  return true;
}

export async function getChatMessages(chatId: string, userId: string): Promise<ChatMessageRecord[]> {
  const sb = getService(userId);
  if (sb) {
    const { data, error } = await sb
      .from("chat_messages")
      .select("*")
      .eq("chat_id", chatId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (!error && data) {
      return data as ChatMessageRecord[];
    }
  }

  const list = memMessages.get(chatId) ?? [];
  return list.filter((m) => m.user_id === userId);
}

// ── Resumable Streams ────────────────────────────────────────────────────────

export async function createChatStream(input: {
  streamId: string;
  chatId: string;
  userId: string;
  metadata?: Record<string, unknown>;
}): Promise<ChatStreamRecord> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const record: ChatStreamRecord = {
    stream_id: input.streamId,
    chat_id: input.chatId,
    user_id: input.userId,
    status: "live",
    last_sequence: 0,
    transcript: "",
    transcript_sha256: null,
    error_class: null,
    expires_at: expiresAt,
    metadata: input.metadata ?? {},
    created_at: now,
    updated_at: now,
  };

  const sb = getService(input.userId);
  if (sb) {
    const { error } = await sb.from("chat_streams").upsert(
      {
        stream_id: record.stream_id,
        chat_id: record.chat_id,
        user_id: record.user_id,
        status: record.status,
        last_sequence: record.last_sequence,
        transcript: record.transcript,
        transcript_sha256: record.transcript_sha256,
        error_class: record.error_class,
        expires_at: record.expires_at,
        metadata: record.metadata,
        created_at: record.created_at,
        updated_at: record.updated_at,
      },
      { onConflict: "stream_id" },
    );
    if (error) {
      console.warn("[chat/persistence] createChatStream error:", error.message);
    }
  }

  memStreams.set(record.stream_id, record);
  return record;
}

export async function getChatStream(streamId: string, userId?: string): Promise<ChatStreamRecord | null> {
  const sb = getService(userId ?? null);
  if (sb) {
    let query = sb.from("chat_streams").select("*").eq("stream_id", streamId);
    if (userId) {
      query = query.eq("user_id", userId);
    }
    const { data, error } = await query.maybeSingle();
    if (!error && data) {
      return data as ChatStreamRecord;
    }
  }

  const inMem = memStreams.get(streamId);
  if (!inMem) return null;
  if (userId && inMem.user_id !== userId) return null;
  return inMem;
}

export async function appendChatStreamSegment(
  streamId: string,
  sequence: number,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const segmentId = randomUUID();
  const now = new Date().toISOString();
  const segment: ChatStreamSegmentRecord = {
    id: segmentId,
    stream_id: streamId,
    sequence,
    event_type: eventType,
    payload,
    created_at: now,
  };

  const stream = memStreams.get(streamId);
  const userId = stream?.user_id ?? null;
  const sb = getService(userId);

  if (sb) {
    await sb.from("chat_stream_segments").insert({
      id: segment.id,
      stream_id: segment.stream_id,
      sequence: segment.sequence,
      event_type: segment.event_type,
      payload: segment.payload,
      created_at: segment.created_at,
    });

    await sb
      .from("chat_streams")
      .update({ last_sequence: sequence, updated_at: now })
      .eq("stream_id", streamId);
  }

  const list = memSegments.get(streamId) ?? [];
  list.push(segment);
  memSegments.set(streamId, list);

  if (stream) {
    stream.last_sequence = sequence;
    stream.updated_at = now;
  }
  return true;
}

export async function getChatStreamSegments(
  streamId: string,
  sinceSequence = 0,
): Promise<ChatStreamSegmentRecord[]> {
  const stream = memStreams.get(streamId);
  const userId = stream?.user_id ?? null;
  const sb = getService(userId);

  if (sb) {
    const { data, error } = await sb
      .from("chat_stream_segments")
      .select("*")
      .eq("stream_id", streamId)
      .gt("sequence", sinceSequence)
      .order("sequence", { ascending: true });
    if (!error && data) {
      return data as ChatStreamSegmentRecord[];
    }
  }

  const list = memSegments.get(streamId) ?? [];
  return list
    .filter((s) => s.sequence > sinceSequence)
    .sort((a, b) => a.sequence - b.sequence);
}

export async function completeChatStream(
  streamId: string,
  transcript: string,
): Promise<{ ok: boolean; transcriptHash: string }> {
  const transcriptHash = computeTranscriptHash(transcript);
  const now = new Date().toISOString();

  const stream = memStreams.get(streamId);
  const userId = stream?.user_id ?? null;
  const sb = getService(userId);

  if (sb) {
    await sb
      .from("chat_streams")
      .update({
        status: "completed",
        transcript,
        transcript_sha256: transcriptHash,
        updated_at: now,
      })
      .eq("stream_id", streamId);
  }

  if (stream) {
    stream.status = "completed";
    stream.transcript = transcript;
    stream.transcript_sha256 = transcriptHash;
    stream.updated_at = now;
  }
  return { ok: true, transcriptHash };
}

export async function interruptChatStream(
  streamId: string,
  partialTranscript = "",
  errorClass = "client_interrupted",
): Promise<boolean> {
  const now = new Date().toISOString();
  const stream = memStreams.get(streamId);
  const userId = stream?.user_id ?? null;
  const sb = getService(userId);

  if (sb) {
    await sb
      .from("chat_streams")
      .update({
        status: "interrupted",
        transcript: partialTranscript,
        error_class: errorClass,
        updated_at: now,
      })
      .eq("stream_id", streamId);
  }

  if (stream) {
    stream.status = "interrupted";
    stream.transcript = partialTranscript;
    stream.error_class = errorClass;
    stream.updated_at = now;
  }
  return true;
}

export async function cancelChatStream(streamId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const stream = memStreams.get(streamId);
  const userId = stream?.user_id ?? null;
  const sb = getService(userId);

  if (sb) {
    await sb
      .from("chat_streams")
      .update({
        status: "cancelled",
        error_class: "user_cancelled",
        updated_at: now,
      })
      .eq("stream_id", streamId);
  }

  if (stream) {
    stream.status = "cancelled";
    stream.error_class = "user_cancelled";
    stream.updated_at = now;
  }
  return true;
}
