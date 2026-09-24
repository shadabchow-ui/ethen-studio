import { randomUUID } from "node:crypto";
import { createServiceClient } from "@ethen/database/service";
import { hasConfiguredSupabaseServerEnv } from "@ethen/config/env";
import { DEFAULT_CHAT_ARTIFACT, type ChatArtifactKind } from "./artifact-presentation";

// Client-safe presentation contract lives outside this module so Client
// Components can reach it without pulling the server-only Supabase service
// into their import graph. Re-exported here to keep one server import site.
export { DEFAULT_CHAT_ARTIFACT };
export type { ChatArtifactKind };


export interface ChatArtifactRecord {
  id: string;
  chat_id: string;
  user_id: string;
  title: string;
  kind: ChatArtifactKind;
  content: string;
  version: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChatArtifactVersionRecord {
  id: string;
  artifact_id: string;
  version: number;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateChatArtifactInput {
  id?: string;
  chatId: string;
  userId: string;
  title: string;
  kind: ChatArtifactKind;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateChatArtifactInput {
  artifactId: string;
  userId: string;
  content: string;
  title?: string;
  metadata?: Record<string, unknown>;
}


// ── In-memory store for deterministic testing & environments without Supabase ──

const memArtifacts = new Map<string, ChatArtifactRecord>();
const memVersions = new Map<string, ChatArtifactVersionRecord[]>();

export function clearMemoryArtifactsForTesting(): void {
  memArtifacts.clear();
  memVersions.clear();
}

function getService(actorId: string | null) {
  if (!hasConfiguredSupabaseServerEnv()) return null;
  return createServiceClient({ reason: "chat_artifact_persistence", actorId });
}

// ── Persistence Operations ───────────────────────────────────────────────────

export async function createChatArtifact(
  input: CreateChatArtifactInput,
): Promise<ChatArtifactRecord> {
  const id = input.id ?? `art_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date().toISOString();

  const record: ChatArtifactRecord = {
    id,
    chat_id: input.chatId,
    user_id: input.userId,
    title: input.title || "Untitled Artifact",
    kind: input.kind || "text",
    content: input.content ?? "",
    version: 1,
    metadata: input.metadata ?? {},
    created_at: now,
    updated_at: now,
  };

  const versionRecord: ChatArtifactVersionRecord = {
    id: `ver_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    artifact_id: id,
    version: 1,
    content: record.content,
    metadata: record.metadata,
    created_at: now,
  };

  const sb = getService(input.userId);
  if (sb) {
    try {
      await sb.from("chat_artifacts").insert({
        id: record.id,
        chat_id: record.chat_id,
        user_id: record.user_id,
        title: record.title,
        kind: record.kind,
        content: record.content,
        version: record.version,
        metadata: record.metadata,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });

      await sb.from("chat_artifact_versions").insert({
        id: versionRecord.id,
        artifact_id: versionRecord.artifact_id,
        version: versionRecord.version,
        content: versionRecord.content,
        metadata: versionRecord.metadata,
        created_at: versionRecord.created_at,
      });
    } catch (err) {
      console.warn("[chat/artifacts] Supabase insert warning:", err);
    }
  }

  memArtifacts.set(id, record);
  memVersions.set(id, [versionRecord]);

  return record;
}

export async function updateChatArtifact(
  input: UpdateChatArtifactInput,
): Promise<ChatArtifactRecord | null> {
  const existing = await getChatArtifact(input.artifactId, input.userId);
  if (!existing) return null;

  const nextVersion = existing.version + 1;
  const now = new Date().toISOString();

  const updatedRecord: ChatArtifactRecord = {
    ...existing,
    title: input.title !== undefined ? input.title : existing.title,
    content: input.content,
    version: nextVersion,
    metadata: input.metadata !== undefined ? { ...existing.metadata, ...input.metadata } : existing.metadata,
    updated_at: now,
  };

  const versionRecord: ChatArtifactVersionRecord = {
    id: `ver_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    artifact_id: input.artifactId,
    version: nextVersion,
    content: updatedRecord.content,
    metadata: updatedRecord.metadata,
    created_at: now,
  };

  const sb = getService(input.userId);
  if (sb) {
    try {
      await sb
        .from("chat_artifacts")
        .update({
          title: updatedRecord.title,
          content: updatedRecord.content,
          version: updatedRecord.version,
          metadata: updatedRecord.metadata,
          updated_at: updatedRecord.updated_at,
        })
        .eq("id", input.artifactId)
        .eq("user_id", input.userId);

      await sb.from("chat_artifact_versions").insert({
        id: versionRecord.id,
        artifact_id: versionRecord.artifact_id,
        version: versionRecord.version,
        content: versionRecord.content,
        metadata: versionRecord.metadata,
        created_at: versionRecord.created_at,
      });
    } catch (err) {
      console.warn("[chat/artifacts] Supabase update warning:", err);
    }
  }

  memArtifacts.set(input.artifactId, updatedRecord);
  const versionList = memVersions.get(input.artifactId) ?? [];
  versionList.push(versionRecord);
  memVersions.set(input.artifactId, versionList);

  return updatedRecord;
}

export async function getChatArtifact(
  artifactId: string,
  userId?: string,
): Promise<ChatArtifactRecord | null> {
  const sb = getService(userId ?? null);
  if (sb) {
    try {
      let query = sb.from("chat_artifacts").select("*").eq("id", artifactId);
      if (userId) {
        query = query.eq("user_id", userId);
      }
      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        return data as ChatArtifactRecord;
      }
    } catch (err) {
      console.warn("[chat/artifacts] Supabase getChatArtifact warning:", err);
    }
  }

  const inMem = memArtifacts.get(artifactId);
  if (!inMem) return null;
  if (userId && inMem.user_id !== userId) return null;
  return inMem;
}

export async function listChatArtifacts(
  chatId: string,
  userId?: string,
): Promise<ChatArtifactRecord[]> {
  const sb = getService(userId ?? null);
  if (sb) {
    try {
      let query = sb.from("chat_artifacts").select("*").eq("chat_id", chatId);
      if (userId) {
        query = query.eq("user_id", userId);
      }
      const { data, error } = await query.order("updated_at", { ascending: false });
      if (!error && data) {
        return data as ChatArtifactRecord[];
      }
    } catch (err) {
      console.warn("[chat/artifacts] Supabase listChatArtifacts warning:", err);
    }
  }

  return Array.from(memArtifacts.values())
    .filter((a) => a.chat_id === chatId && (!userId || a.user_id === userId))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getChatArtifactVersions(
  artifactId: string,
): Promise<ChatArtifactVersionRecord[]> {
  const sb = getService(null);
  if (sb) {
    try {
      const { data, error } = await sb
        .from("chat_artifact_versions")
        .select("*")
        .eq("artifact_id", artifactId)
        .order("version", { ascending: true });
      if (!error && data) {
        return data as ChatArtifactVersionRecord[];
      }
    } catch (err) {
      console.warn("[chat/artifacts] Supabase getChatArtifactVersions warning:", err);
    }
  }

  const list = memVersions.get(artifactId) ?? [];
  return [...list].sort((a, b) => a.version - b.version);
}
