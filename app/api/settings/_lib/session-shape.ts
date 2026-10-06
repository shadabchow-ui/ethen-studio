/**
 * RC2 — pure Clerk-session → Studio-session shape mapping.
 *
 * Framework-free (no Next/Clerk/React imports) so the contract suite
 * covers the ms→ISO conversion and the current-session flag directly.
 * The `_lib/clerk-sessions.ts` server module is the only importer.
 */

import type { SessionInfo } from "@ethen/ui/settings/settings-data";

export interface ClerkSessionLike {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
}

function isoOrNull(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  try {
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

export function toSessionInfo(session: ClerkSessionLike, currentSessionId: string | null): SessionInfo {
  return {
    id: session.id,
    status: session.status,
    current: currentSessionId !== null && session.id === currentSessionId,
    createdAt: isoOrNull(session.createdAt),
    updatedAt: isoOrNull(session.updatedAt),
    lastActiveAt: isoOrNull(session.lastActiveAt),
  };
}
