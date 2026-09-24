"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isMockMode, hasSupabaseEnv } from "@ethen/config/runtime-flags";
// Client hook: both queries come from the universal barrel (browser Supabase
// client). The server barrel re-exports a same-named `getUserSessions` that is
// `server-only`; importing it here pulled a server module into the client
// graph and broke the build.
import { getUserSessions, getUserSessionPreviews } from "../../../account/src/index";
import { getCommittedMockSessions, MOCK_STORAGE_EVENT } from "@ethen/config/mock/storage";
import { SEED_AGENTS } from "@ethen/config/mock/seed-agents";
import type {Session} from "../../../account/src/index";
import type { MockSessionRecord } from "@ethen/config/mock/types";

export interface RecentSession {
  id: string;
  title: string;
  agentId: string | null;
  agentSlug: string | null;
  agentName: string | null;
  agentIcon: string | null;
  updatedAt: string;
  lastMessagePreview: string | null;
  workspaceArchetype: string | null;
}

export interface RecentSessionsState {
  items: RecentSession[];
  loading: boolean;
  error: string | null;
}

const SERVER_SNAPSHOT: MockSessionRecord[] = [];

let _mockSessionsCache: MockSessionRecord[] | null = null;

function refreshMockCache() {
  _mockSessionsCache = getCommittedMockSessions();
}

function getMockSnapshot(): MockSessionRecord[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (_mockSessionsCache === null) {
    refreshMockCache();
  }
  return _mockSessionsCache!;
}

function subscribeMock(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handleChange = () => {
    refreshMockCache();
    cb();
  };
  window.addEventListener(MOCK_STORAGE_EVENT, handleChange as EventListener);
  return () => window.removeEventListener(MOCK_STORAGE_EVENT, handleChange as EventListener);
}

function mockToRecent(s: MockSessionRecord): RecentSession {
  const preview =
    s.last_message_preview ??
    (s.messages?.length
      ? s.messages[s.messages.length - 1]?.content?.slice(0, 120) ?? null
      : null);

  return {
    id: s.id,
    title: s.title,
    agentId: s.agent_id,
    agentSlug: s.agent_slug,
    agentName: s.agent_name,
    agentIcon: s.agent_icon,
    updatedAt: s.updated_at,
    lastMessagePreview: preview,
    workspaceArchetype: s.workspace_archetype,
  };
}

function serverToRecent(s: Session, lastMessagePreview: string | null): RecentSession {
  const agent = s.agent_id
    ? SEED_AGENTS.find((a) => a.id === s.agent_id)
    : null;

  return {
    id: s.id,
    title: s.title ?? "Untitled session",
    agentId: s.agent_id ?? null,
    agentSlug: agent?.slug ?? null,
    agentName: agent?.name ?? null,
    agentIcon: agent?.icon ?? null,
    updatedAt: s.updated_at ?? s.created_at,
    lastMessagePreview,
    workspaceArchetype: s.workspace_archetype ?? null,
  };
}

export function useRecentSessionsState(limit = 3): RecentSessionsState {
  const mockSessions = useSyncExternalStore(
    subscribeMock,
    getMockSnapshot,
    // Server snapshot MUST be stable and match the server render. Passing
    // getMockSnapshot here would read localStorage on the client during
    // hydration, producing a different first render than the server's empty
    // snapshot and triggering a hydration mismatch. The empty array is the
    // only value the server can have rendered.
    () => SERVER_SNAPSHOT,
  );

  const [serverSessions, setServerSessions] = useState<Session[]>([]);
  const [serverPreviews, setServerPreviews] = useState<Record<string, string | null>>({});
  // Initial loading is intentionally environment-independent: both the server
  // and the first client render must agree on the same skeleton state. The
  // effect resolves the real value after mount (client-only). Basing the
  // initial state on `hasSupabaseEnv()` bakes an environment value into the
  // first render and diverges whenever the client bundle and server disagree
  // about environment — the exact hydration mismatch this sidebar saw.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isMockMode || !hasSupabaseEnv()) {
      // No durable session source to fetch; resolve the skeleton immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    getUserSessions(20)
      .then(async (data) => {
        if (cancelled) return;
        setServerSessions(data);

        const previews = await getUserSessionPreviews(data.map((session) => session.id));
        if (!cancelled) {
          setServerPreviews(previews);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load recent sessions.");
          setServerSessions([]);
          setServerPreviews({});
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  if (isMockMode) {
    return {
      items: mockSessions.slice(0, limit).map(mockToRecent),
      loading: false,
      error: null,
    };
  }

  return {
    items: serverSessions
      .slice(0, limit)
      .map((serverSession) => serverToRecent(serverSession, serverPreviews[serverSession.id] ?? null)),
    loading,
    error,
  };
}

export function useRecentSessions(limit = 3): RecentSession[] {
  return useRecentSessionsState(limit).items;
}
