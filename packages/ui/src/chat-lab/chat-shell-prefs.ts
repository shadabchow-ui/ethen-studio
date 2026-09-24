"use client";

/**
 * Chat shell preferences — sidebar width + collapse.
 *
 * Canonical console geometry: default 288px, min 200px, max 420px.
 * Local-first (correct before any network), same pattern as chat-settings.
 * Chat-owned today; shaped for later extraction into the shared flagship
 * shell without changing the storage contract.
 */

import * as React from "react";

export const CHAT_SIDEBAR_DEFAULT_WIDTH = 288;
export const CHAT_SIDEBAR_MIN_WIDTH = 200;
export const CHAT_SIDEBAR_MAX_WIDTH = 420;
export const CHAT_SIDEBAR_KEYBOARD_STEP = 8;
export const CHAT_SIDEBAR_KEYBOARD_LARGE_STEP = 24;

export const CHAT_SIDEBAR_STORAGE_KEY = "ethen.chat.sidebar.v1";
export const CHAT_SIDEBAR_EVENT = "ethen:chat-sidebar";

export interface ChatSidebarPrefs {
  width: number;
  collapsed: boolean;
}

export const DEFAULT_CHAT_SIDEBAR_PREFS: ChatSidebarPrefs = {
  width: CHAT_SIDEBAR_DEFAULT_WIDTH,
  collapsed: false,
};

export function clampSidebarWidth(value: unknown): number {
  const rounded =
    typeof value === "number" && Number.isFinite(value)
      ? Math.round(value)
      : CHAT_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(CHAT_SIDEBAR_MAX_WIDTH, Math.max(CHAT_SIDEBAR_MIN_WIDTH, rounded));
}

export function loadChatSidebarPrefs(): ChatSidebarPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_CHAT_SIDEBAR_PREFS };
  try {
    const raw = window.localStorage.getItem(CHAT_SIDEBAR_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CHAT_SIDEBAR_PREFS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      width: clampSidebarWidth(parsed.width),
      collapsed: parsed.collapsed === true,
    };
  } catch {
    return { ...DEFAULT_CHAT_SIDEBAR_PREFS };
  }
}

export function saveChatSidebarPrefs(prefs: ChatSidebarPrefs): void {
  try {
    const next: ChatSidebarPrefs = {
      width: clampSidebarWidth(prefs.width),
      collapsed: prefs.collapsed === true,
    };
    window.localStorage.setItem(CHAT_SIDEBAR_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHAT_SIDEBAR_EVENT, { detail: next }));
  } catch {
    // Best-effort: a private/quota-blocked store never breaks the shell.
  }
}

// ── React binding ────────────────────────────────────────────────────────────
// localStorage is the store: the server snapshot is the default geometry (so
// SSR and hydration match), the client snapshot is the stored value, and
// same-tab writes (event) plus other tabs (storage) notify subscribers.

const SERVER_SNAPSHOT: ChatSidebarPrefs = { ...DEFAULT_CHAT_SIDEBAR_PREFS };
let cachedRaw: string | null | undefined;
let cachedPrefs: ChatSidebarPrefs = SERVER_SNAPSHOT;

function readSidebarSnapshot(): ChatSidebarPrefs {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CHAT_SIDEBAR_STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPrefs = loadChatSidebarPrefs();
  }
  return cachedPrefs;
}

function subscribeSidebarPrefs(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CHAT_SIDEBAR_STORAGE_KEY) onChange();
  };
  window.addEventListener(CHAT_SIDEBAR_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHAT_SIDEBAR_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useChatSidebarPrefs(): readonly [
  ChatSidebarPrefs,
  (update: (current: ChatSidebarPrefs) => ChatSidebarPrefs) => void,
] {
  const prefs = React.useSyncExternalStore(subscribeSidebarPrefs, readSidebarSnapshot, () => SERVER_SNAPSHOT);
  const update = React.useCallback((next: (current: ChatSidebarPrefs) => ChatSidebarPrefs) => {
    saveChatSidebarPrefs(next(readSidebarSnapshot()));
  }, []);
  return [prefs, update] as const;
}
