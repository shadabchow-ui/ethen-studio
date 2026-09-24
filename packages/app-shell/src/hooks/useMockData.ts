"use client";

import { useSyncExternalStore } from "react";
import {
  getCommittedMockSessions,
  getMockProjects,
  getMockWallet,
  MOCK_STORAGE_EVENT,
} from "@ethen/config/mock/storage";
import type { MockCreditWallet, MockProjectRecord, MockSessionRecord } from "@ethen/config/mock/types";

// Stable server-side snapshot constants
const SERVER_WALLET: MockCreditWallet = {
  balance: 40,
  spent: 0,
  initial_balance: 40,
  updated_at: "",
};
const SERVER_SESSIONS: MockSessionRecord[] = [];
const SERVER_PROJECTS: MockProjectRecord[] = [];

function getServerWallet() {
  return SERVER_WALLET;
}
function getServerSessions() {
  return SERVER_SESSIONS;
}
function getServerSession() {
  return null;
}
function getServerProjects() {
  return SERVER_PROJECTS;
}
function getServerProject() {
  return null;
}

// Module-level client snapshot cache — avoids JSON.parse on every render call
let _walletCache: MockCreditWallet = SERVER_WALLET;
let _sessionsCache: MockSessionRecord[] = SERVER_SESSIONS;
let _projectsCache: MockProjectRecord[] = SERVER_PROJECTS;
let _cacheReady = false;

function ensureCache() {
  if (_cacheReady || typeof window === "undefined") return;
  _walletCache = getMockWallet();
  _sessionsCache = getCommittedMockSessions();
  _projectsCache = getMockProjects();
  _cacheReady = true;
}

function refreshCache() {
  _walletCache = getMockWallet();
  _sessionsCache = getCommittedMockSessions();
  _projectsCache = getMockProjects();
}

function getWalletSnapshot(): MockCreditWallet {
  ensureCache();
  return _walletCache;
}

function getSessionsSnapshot(): MockSessionRecord[] {
  ensureCache();
  return _sessionsCache;
}

// Global subscribe used by all three hooks — refreshes the module cache on change
function subscribe(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  ensureCache();

  const handleChange = () => {
    refreshCache();
    onChange();
  };

  window.addEventListener(MOCK_STORAGE_EVENT, handleChange as EventListener);
  window.addEventListener("storage", handleChange);

  return () => {
    window.removeEventListener(MOCK_STORAGE_EVENT, handleChange as EventListener);
    window.removeEventListener("storage", handleChange);
  };
}

export function useMockWallet(): MockCreditWallet {
  return useSyncExternalStore(subscribe, getWalletSnapshot, getServerWallet);
}

export function useMockSessions(): MockSessionRecord[] {
  return useSyncExternalStore(subscribe, getSessionsSnapshot, getServerSessions);
}

export function useMockSession(sessionId?: string | null): MockSessionRecord | null {
  // Derive from the sessions cache — same object reference until cache is refreshed
  const getSnapshot = () => {
    ensureCache();
    if (!sessionId) return null;
    return _sessionsCache.find((s) => s.id === sessionId) ?? null;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSession);
}

function getProjectsSnapshot(): MockProjectRecord[] {
  ensureCache();
  return _projectsCache;
}

export function useMockProjects(): MockProjectRecord[] {
  return useSyncExternalStore(subscribe, getProjectsSnapshot, getServerProjects);
}

export function useMockProject(projectId?: string | null): MockProjectRecord | null {
  const getSnapshot = () => {
    ensureCache();
    if (!projectId) return null;
    return _projectsCache.find((p) => p.id === projectId) ?? null;
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerProject);
}
