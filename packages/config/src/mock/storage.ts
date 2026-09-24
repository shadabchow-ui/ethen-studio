"use client";

import type { Agent } from "@ethen/contracts/agents/types";
import type { Artifact, ArtifactType } from "@ethen/contracts/artifacts/types";
import type { MockCreditWallet, MockMessage, MockProjectRecord, MockSessionRecord } from "./types";

export const MOCK_STORAGE_EVENT = "ethen:mock-storage-updated";

const SESSIONS_KEY = "ethen.mock.sessions.v1";
const WALLET_KEY = "ethen.mock.wallet.v1";
const PROJECTS_KEY = "ethen.mock.projects.v1";
const DEFAULT_CREDITS = 40;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emitUpdate(sessionId?: string) {
  if (!canUseStorage()) return;

  window.dispatchEvent(
    new CustomEvent(MOCK_STORAGE_EVENT, {
      detail: { sessionId: sessionId ?? null },
    })
  );
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be full or unavailable (private browsing, quota exceeded).
    // Mock session persistence is best-effort — never crash the workspace.
  }
}

function cleanPreview(content: string, length = 88) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, length - 1).trimEnd()}…`;
}

function titleFromPrompt(prompt: string, agent: Agent) {
  const trimmed = cleanPreview(prompt, 48);
  return trimmed.length > 0 ? trimmed : `${agent.name} session`;
}

function buildAssistantReply(agent: Agent, prompt: string) {
  const trimmed = cleanPreview(prompt, 140);

  switch (agent.workspace_archetype) {
    case "document":
      return `Draft direction ready. I preserved your intent, tightened the structure, and outlined the next revision pass for "${trimmed}".`;
    case "research":
      return `Research brief prepared. I pulled the core question, likely comparison angles, and a concise findings scaffold for "${trimmed}".`;
    case "gallery":
      return `Visual concept staged. I translated "${trimmed}" into a sharper creative direction, composition notes, and output-ready art guidance.`;
    case "table_plan":
      return `Structured plan assembled. I turned "${trimmed}" into a table-first workflow with milestones, owners, and next actions.`;
    case "generic_chat":
    default:
      return `Mock response ready. I captured the request around "${trimmed}" and queued a practical next-step answer for this workspace.`;
  }
}

function buildArtifactContent(type: ArtifactType, prompt: string, agent: Agent) {
  switch (type) {
    case "markdown":
      return `# ${agent.name} Draft\n\n## Request\n${prompt}\n\n## Next Pass\n- Clarify the objective\n- Tighten the structure\n- Deliver a polished version`;
    case "plan":
      return `- Define the target outcome\n- Break the work into 3 focused steps\n- Review risks and assumptions\n- Ship the next revision`;
    case "table":
      return `Step | Owner | Output | Status\nScope | ${agent.name} | Brief | Ready\nDraft | ${agent.name} | First pass | In progress\nReview | You | Feedback | Next`;
    case "image_ref":
      return `https://placehold.co/960x960/EEE7DD/2A2117?text=${encodeURIComponent(agent.name)}`;
    case "json":
      return JSON.stringify(
        {
          agent: agent.slug,
          request: cleanPreview(prompt, 80),
          status: "mock-ready",
        },
        null,
        2
      );
    default:
      return cleanPreview(prompt);
  }
}

function artifactTypeForAgent(agent: Agent): ArtifactType | null {
  switch (agent.workspace_archetype) {
    case "document":
      return "markdown";
    case "research":
      return "plan";
    case "gallery":
      return "image_ref";
    case "table_plan":
      return "table";
    case "generic_chat":
      return "json";
    default:
      return null;
  }
}

function artifactTitle(type: ArtifactType) {
  switch (type) {
    case "markdown":
      return "Draft";
    case "plan":
      return "Plan";
    case "table":
      return "Table";
    case "image_ref":
      return "Concept";
    case "json":
      return "Payload";
    default:
      return "Artifact";
  }
}

function defaultWallet(): MockCreditWallet {
  return {
    balance: DEFAULT_CREDITS,
    spent: 0,
    initial_balance: DEFAULT_CREDITS,
    updated_at: nowIso(),
  };
}

function readSessions() {
  return readJson<MockSessionRecord[]>(SESSIONS_KEY, []);
}

function writeSessions(sessions: MockSessionRecord[]) {
  writeJson(SESSIONS_KEY, sessions);
}

function writeWallet(wallet: MockCreditWallet) {
  writeJson(WALLET_KEY, wallet);
}

function baseSession(agent: Agent, sessionId: string): MockSessionRecord {
  const timestamp = nowIso();

  return {
    id: sessionId,
    agent_id: agent.id,
    agent_slug: agent.slug,
    agent_name: agent.name,
    agent_icon: agent.icon,
    workspace_archetype: agent.workspace_archetype,
    title: `${agent.name} session`,
    created_at: timestamp,
    updated_at: timestamp,
    last_message_preview: null,
    artifact_count: 0,
    message_count: 0,
    credits_spent: 0,
    messages: [],
    artifacts: [],
  };
}

export function isCommittedMockSession(session: MockSessionRecord) {
  return (
    session.message_count > 0 ||
    session.messages.length > 0 ||
    Boolean(session.last_message_preview?.trim()) ||
    session.artifact_count > 0 ||
    session.artifacts.length > 0
  );
}

function upsertSession(nextSession: MockSessionRecord) {
  const sessions = readSessions();
  const others = sessions.filter((session) => session.id !== nextSession.id);
  writeSessions([nextSession, ...others].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
}

export function getMockWallet() {
  const wallet = readJson<MockCreditWallet>(WALLET_KEY, defaultWallet());

  if (!canUseStorage()) return wallet;

  if (!window.localStorage.getItem(WALLET_KEY)) {
    writeWallet(wallet);
  }

  return wallet;
}

export function getMockSessions() {
  return readSessions().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getCommittedMockSessions() {
  return getMockSessions().filter(isCommittedMockSession);
}

export function getMockSession(sessionId: string) {
  return getMockSessions().find((session) => session.id === sessionId) ?? null;
}

export function ensureMockSession(agent: Agent, sessionId: string) {
  const existing = getMockSession(sessionId);
  if (existing) return existing;

  const session = baseSession(agent, sessionId);
  upsertSession(session);
  emitUpdate(sessionId);
  return session;
}

export function deleteMockSession(sessionId: string) {
  const sessions = readSessions();
  const next = sessions.filter((session) => session.id !== sessionId);
  if (next.length === sessions.length) return false;
  writeSessions(next);
  emitUpdate(sessionId);
  return true;
}

export function renameMockSession(sessionId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const sessions = readSessions();
  const index = sessions.findIndex((session) => session.id === sessionId);
  if (index === -1) return null;

  const updated: MockSessionRecord = {
    ...sessions[index],
    title: trimmed,
    updated_at: nowIso(),
  };

  const next = [...sessions];
  next[index] = updated;
  writeSessions(next);
  emitUpdate(sessionId);
  return updated;
}

export function getMockArtifacts(sessionId: string): Artifact[] {
  return getMockSession(sessionId)?.artifacts ?? [];
}

export function saveMockArtifact({
  sessionId,
  title,
  artifactType,
  content,
  metadata,
}: {
  sessionId: string;
  title: string;
  artifactType: ArtifactType;
  content: string;
  metadata?: Record<string, unknown>;
}): Artifact {
  const sessions = readSessions();
  const existing = sessions.find((session) => session.id === sessionId);
  const timestamp = nowIso();

  const artifact: Artifact = {
    id: makeId("artifact"),
    session_id: sessionId,
    message_id: null,
    title,
    artifact_type: artifactType,
    content,
    metadata: metadata ?? null,
    version: 1,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const base: MockSessionRecord = existing ?? {
    id: sessionId,
    agent_id: "",
    agent_slug: (metadata?.agent_slug as string | undefined) ?? "unknown",
    agent_name: (metadata?.agent_slug as string | undefined) ?? "Workspace",
    agent_icon: "",
    workspace_archetype: "generic_chat",
    title: `${(metadata?.agent_slug as string | undefined) ?? "Workspace"} session`,
    created_at: timestamp,
    updated_at: timestamp,
    last_message_preview: null,
    artifact_count: 0,
    message_count: 0,
    credits_spent: 0,
    messages: [],
    artifacts: [],
  };

  const updatedArtifacts = [...base.artifacts, artifact];
  const nextSession: MockSessionRecord = {
    ...base,
    updated_at: timestamp,
    artifact_count: updatedArtifacts.length,
    artifacts: updatedArtifacts,
  };

  upsertSession(nextSession);
  emitUpdate(sessionId);

  return artifact;
}

export function updateMockArtifact({
  sessionId,
  artifactId,
  title,
  content,
  metadata,
  version,
}: {
  sessionId: string;
  artifactId: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  version?: number;
}): Artifact | null {
  const sessions = readSessions();
  const sessionIndex = sessions.findIndex((session) => session.id === sessionId);
  if (sessionIndex === -1) return null;

  const session = sessions[sessionIndex];
  const artifactIndex = session.artifacts.findIndex((artifact) => artifact.id === artifactId);
  if (artifactIndex === -1) return null;

  const current = session.artifacts[artifactIndex];
  const updated: Artifact = {
    ...current,
    title: title ?? current.title,
    content,
    metadata: metadata ?? current.metadata,
    version: version ?? current.version + 1,
    updated_at: nowIso(),
  };

  const nextArtifacts = [...session.artifacts];
  nextArtifacts[artifactIndex] = updated;

  const nextSession: MockSessionRecord = {
    ...session,
    updated_at: updated.updated_at,
    artifacts: nextArtifacts,
  };

  const nextSessions = [...sessions];
  nextSessions[sessionIndex] = nextSession;
  writeSessions(nextSessions);
  emitUpdate(sessionId);

  return updated;
}

export function sendMockMessage({
  agent,
  sessionId,
  prompt,
}: {
  agent: Agent;
  sessionId: string;
  prompt: string;
}) {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return { ok: false as const, error: "Write a message before sending." };
  }

  const wallet = getMockWallet();
  if (wallet.balance < agent.credit_cost) {
    return { ok: false as const, error: "Not enough mock credits for this request." };
  }

  const current = getMockSession(sessionId) ?? baseSession(agent, sessionId);
  const timestamp = nowIso();
  const nextWallet: MockCreditWallet = {
    ...wallet,
    balance: wallet.balance - agent.credit_cost,
    spent: wallet.spent + agent.credit_cost,
    updated_at: timestamp,
  };

  const userMessage: MockMessage = {
    id: makeId("msg-user"),
    role: "user",
    content: trimmedPrompt,
    created_at: timestamp,
  };

  const assistantMessage: MockMessage = {
    id: makeId("msg-assistant"),
    role: "assistant",
    content: buildAssistantReply(agent, trimmedPrompt),
    created_at: timestamp,
  };

  const artifacts = [...current.artifacts];
  const artifactType = artifactTypeForAgent(agent);
  if (artifactType) {
    artifacts.push({
      id: makeId("artifact"),
      session_id: sessionId,
      message_id: assistantMessage.id,
      title: `${artifactTitle(artifactType)} ${artifacts.length + 1}`,
      artifact_type: artifactType,
      content: buildArtifactContent(artifactType, trimmedPrompt, agent),
      metadata: {
        mock: true,
      },
      version: 1,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  const nextSession: MockSessionRecord = {
    ...current,
    title:
      current.message_count === 0 && current.title.endsWith(" session")
        ? titleFromPrompt(trimmedPrompt, agent)
        : current.title,
    updated_at: timestamp,
    last_message_preview: cleanPreview(assistantMessage.content),
    artifact_count: artifacts.length,
    message_count: current.message_count + 2,
    credits_spent: current.credits_spent + agent.credit_cost,
    messages: [...current.messages, userMessage, assistantMessage],
    artifacts,
  };

  upsertSession(nextSession);
  writeWallet(nextWallet);
  emitUpdate(sessionId);

  return {
    ok: true as const,
    session: nextSession,
    wallet: nextWallet,
  };
}

export function saveChatbotMessages({
  agent,
  sessionId,
  userContent,
  assistantContent,
}: {
  agent: Agent;
  sessionId: string;
  userContent: string;
  assistantContent: string;
}) {
  const current = getMockSession(sessionId) ?? baseSession(agent, sessionId);
  const timestamp = nowIso();

  const userMessage: MockMessage = {
    id: makeId("msg-user"),
    role: "user",
    content: userContent,
    created_at: timestamp,
  };

  const assistantMessage: MockMessage = {
    id: makeId("msg-assistant"),
    role: "assistant",
    content: assistantContent,
    created_at: timestamp,
  };

  const nextSession: MockSessionRecord = {
    ...current,
    title:
      current.message_count === 0 && current.title.endsWith(" session")
        ? titleFromPrompt(userContent, agent)
        : current.title,
    updated_at: timestamp,
    last_message_preview: cleanPreview(assistantContent),
    message_count: current.message_count + 2,
    messages: [...current.messages, userMessage, assistantMessage],
  };

  upsertSession(nextSession);
  emitUpdate(sessionId);
}

function readProjects() {
  return readJson<MockProjectRecord[]>(PROJECTS_KEY, []);
}

function writeProjects(projects: MockProjectRecord[]) {
  writeJson(PROJECTS_KEY, projects);
}

export function getMockProjects() {
  return readProjects().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getMockProject(projectId: string) {
  return readProjects().find((project) => project.id === projectId) ?? null;
}

export function createMockProject({
  name,
  description,
}: {
  name: string;
  description?: string;
}): MockProjectRecord {
  const timestamp = nowIso();
  const project: MockProjectRecord = {
    id: makeId("project"),
    name: name.trim() || "Untitled project",
    description: description?.trim() ?? "",
    created_at: timestamp,
    updated_at: timestamp,
    session_ids: [],
    artifact_ids: [],
  };

  writeProjects([project, ...readProjects()]);
  emitUpdate();
  return project;
}

export function updateMockProject(
  projectId: string,
  updates: { name?: string; description?: string }
): MockProjectRecord | null {
  const projects = readProjects();
  const index = projects.findIndex((project) => project.id === projectId);
  if (index === -1) return null;

  const updated: MockProjectRecord = {
    ...projects[index],
    name: updates.name !== undefined ? updates.name.trim() || projects[index].name : projects[index].name,
    description: updates.description !== undefined ? updates.description.trim() : projects[index].description,
    updated_at: nowIso(),
  };

  const next = [...projects];
  next[index] = updated;
  writeProjects(next);
  emitUpdate();
  return updated;
}

export function deleteMockProject(projectId: string) {
  writeProjects(readProjects().filter((project) => project.id !== projectId));
  emitUpdate();
}

function toggleProjectRef(
  projectId: string,
  key: "session_ids" | "artifact_ids",
  refId: string,
  attach: boolean
): MockProjectRecord | null {
  const projects = readProjects();
  const index = projects.findIndex((project) => project.id === projectId);
  if (index === -1) return null;

  const current = projects[index];
  const existingRefs = current[key];
  const nextRefs = attach
    ? existingRefs.includes(refId)
      ? existingRefs
      : [...existingRefs, refId]
    : existingRefs.filter((id) => id !== refId);

  const updated: MockProjectRecord = {
    ...current,
    [key]: nextRefs,
    updated_at: nowIso(),
  };

  const next = [...projects];
  next[index] = updated;
  writeProjects(next);
  emitUpdate();
  return updated;
}

export function attachSessionToProject(projectId: string, sessionId: string) {
  return toggleProjectRef(projectId, "session_ids", sessionId, true);
}

export function detachSessionFromProject(projectId: string, sessionId: string) {
  return toggleProjectRef(projectId, "session_ids", sessionId, false);
}

export function attachArtifactToProject(projectId: string, artifactId: string) {
  return toggleProjectRef(projectId, "artifact_ids", artifactId, true);
}

export function detachArtifactFromProject(projectId: string, artifactId: string) {
  return toggleProjectRef(projectId, "artifact_ids", artifactId, false);
}
