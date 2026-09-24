/**
 * Shared settings client — one persistence model for Chat + Designer.
 *
 * Authority order:
 *   signed in + durable backend -> server (`Supabase user_settings`) is truth;
 *                                  localStorage is a first-paint cache only.
 *   signed out (or no durable backend) -> localStorage only, and the UI must
 *                                  label it honestly (see `persistence`).
 *
 * Optimistic concurrency: PATCH sends the base `version`; the server rejects
 * stale writes with 409 so two tabs cannot silently clobber each other.
 */
"use client";

import * as React from "react";
import {
  DEFAULT_SETTINGS,
  applySettingsPatch,
  validateUserSettings,
  type SettingsPatch,
  type UserSettings,
} from "./settings-schema";
import { applyThemePreference, writeThemePreference } from "../theme/theme-store";

export const SETTINGS_LOCAL_KEY = "ethen.settings.v1";
export const SETTINGS_SYNC_EVENT = "ethen:settings-sync";

export type SettingsPersistence = "server" | "local";
export type SettingsPhase = "loading" | "ready" | "saving" | "error";

export interface RemoteSettingsResponse {
  ok: boolean;
  signedIn?: boolean;
  durable?: boolean;
  version?: number;
  settings?: unknown;
  error?: string;
}

const subscribeNever = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function loadLocalSettings(): UserSettings {
  if (typeof window === "undefined") return clone(DEFAULT_SETTINGS);
  try {
    const raw = window.localStorage.getItem(SETTINGS_LOCAL_KEY);
    if (!raw) return clone(DEFAULT_SETTINGS);
    const validated = validateUserSettings(JSON.parse(raw));
    // Theme stays canonical in `ethen-theme`; mirror it into the doc so the
    // two can never visibly disagree.
    try {
      const theme = window.localStorage.getItem("ethen-theme");
      if (theme === "light" || theme === "dark" || theme === "system") {
        validated.appearance.theme = theme;
      }
    } catch {
      /* ignore */
    }
    return validated;
  } catch {
    return clone(DEFAULT_SETTINGS);
  }
}

export function saveLocalSettings(settings: UserSettings): string | null {
  try {
    window.localStorage.setItem(SETTINGS_LOCAL_KEY, JSON.stringify(settings));
    return null;
  } catch {
    return "Settings could not be saved in this browser. Check your browser storage and try again.";
  }
}

export async function fetchRemoteSettings(): Promise<{
  signedIn: boolean;
  durable: boolean;
  settings: UserSettings | null;
  error: string | null;
}> {
  try {
    const response = await fetch("/api/settings", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      return { signedIn: false, durable: false, settings: null, error: null };
    }
    if (!response.ok) {
      return { signedIn: true, durable: false, settings: null, error: "Settings service unavailable." };
    }
    const body = (await response.json()) as RemoteSettingsResponse;
    if (!body.ok) {
      return { signedIn: body.signedIn !== false, durable: false, settings: null, error: body.error ?? "Settings service unavailable." };
    }
    return {
      signedIn: body.signedIn !== false,
      durable: body.durable === true,
      settings: body.settings !== undefined ? validateUserSettings(body.settings) : null,
      error: null,
    };
  } catch {
    return { signedIn: true, durable: false, settings: null, error: "Settings service could not be reached." };
  }
}

export async function patchRemoteSettings(
  patch: SettingsPatch,
  baseVersion: number,
): Promise<{ settings: UserSettings; version: number } | { error: string; conflict?: boolean }> {
  try {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch, version: baseVersion }),
    });
    const body = (await response.json().catch(() => null)) as RemoteSettingsResponse | null;
    if (response.status === 401 || response.status === 403) {
      return { error: "Sign in to sync settings across devices." };
    }
    if (response.status === 409) {
      return { error: "Settings changed elsewhere. Reloaded the latest values — try again.", conflict: true };
    }
    if (!response.ok || !body?.ok || body.settings === undefined) {
      return { error: body?.error ?? "Settings could not be saved. Try again." };
    }
    return { settings: validateUserSettings(body.settings), version: body.version ?? baseVersion + 1 };
  } catch {
    return { error: "Settings could not be saved. Check your connection and try again." };
  }
}

/** Apply non-theme appearance prefs as document attributes/vars (theme uses the shared theme authority). */
export function applyAppearance(settings: UserSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const a = settings.appearance;
  try {
    applyThemePreference(a.theme);
  } catch {
    /* theme authority unavailable — non-fatal */
  }
  root.dataset.ethenMotion = a.motion;
  root.dataset.ethenDensity = a.density;
  root.dataset.ethenContentSize = a.contentSize;
  root.dataset.ethenContentWidth = a.contentWidth;
  root.style.setProperty("--ethen-interface-font", a.interfaceFont);
  root.style.setProperty("--ethen-content-font", a.contentFont);
  root.style.setProperty("--ethen-code-font", a.codeFont);
  try {
    const reduceOs = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reduce = a.motion === "reduced" || (a.motion === "system" && reduceOs);
    root.dataset.ethenMotionResolved = reduce ? "reduced" : "full";
  } catch {
    root.dataset.ethenMotionResolved = a.motion === "reduced" ? "reduced" : "full";
  }
  try {
    root.lang = settings.general.locale || "en-US";
  } catch {
    /* ignore */
  }
}

export interface UserSettingsState {
  settings: UserSettings;
  phase: SettingsPhase;
  /** Last error message, if any. */
  error: string | null;
  /** Whether the server is the durable authority for this viewer. */
  persistence: SettingsPersistence;
  signedIn: boolean;
  serverVersion: number;
  /** True once the initial remote reconciliation finished. */
  hydrated: boolean;
  /** Optimistic toggle/select write. Rolls back + surfaces Retry on failure. */
  update: (patch: SettingsPatch) => Promise<boolean>;
  /** Explicit Save path for text-heavy forms. */
  save: (patch: SettingsPatch) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const SettingsContext = React.createContext<UserSettingsState | null>(null);

/**
 * Provider — mount once per settings surface (or per app shell). Fetches the
 * remote doc, reconciles with the local cache, applies appearance live, and
 * stays in sync across tabs via storage + sync events.
 */
export function UserSettingsProvider({
  initial,
  children,
}: {
  initial?: UserSettings;
  children: React.ReactNode;
}) {
  // SSR-safe: the first client render must match the server HTML exactly, so
  // state initializes from deterministic defaults and reconciles with the
  // local cache synchronously before paint (layout effect, no flash).
  const [settings, setSettings] = React.useState<UserSettings>(() =>
    initial ? JSON.parse(JSON.stringify(initial)) as UserSettings : JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as UserSettings,
  );
  const [phase, setPhase] = React.useState<SettingsPhase>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [persistence, setPersistence] = React.useState<SettingsPersistence>("local");
  const [signedIn, setSignedIn] = React.useState(true);
  const [serverVersion, setServerVersion] = React.useState(0);
  const [hydrated, setHydrated] = React.useState(false);
  const stateRef = React.useRef({ settings, serverVersion, persistence });
  React.useLayoutEffect(() => {
    stateRef.current = { settings, serverVersion, persistence };
  });

  const refresh = React.useCallback(async () => {
    const remote = await fetchRemoteSettings();
    if (!remote.signedIn) {
      setSignedIn(false);
      setPersistence("local");
      setSettings(loadLocalSettings());
      setPhase("ready");
      setHydrated(true);
      return;
    }
    setSignedIn(true);
    if (remote.settings && remote.durable) {
      setSettings(remote.settings);
      setServerVersion(remote.settings.version);
      setPersistence("server");
      saveLocalSettings(remote.settings);
      try {
        // The durable doc wins: keep the single theme authority (`ethen-theme`)
        // on the same value so every theme control agrees across tabs/devices.
        writeThemePreference(remote.settings.appearance.theme);
      } catch {
        /* ignore */
      }
      applyAppearance(remote.settings);
      setError(null);
      setPhase("ready");
    } else if (remote.settings && !remote.durable) {
      // Server reachable but not durable (no DB): local stays the store.
      setPersistence("local");
      setError(null);
      setPhase("ready");
      applyAppearance(loadLocalSettings());
    } else {
      setPersistence("local");
      setError(remote.error ?? "Settings service unavailable.");
      setPhase("error");
    }
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    const handle = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(handle);
  }, [refresh]);

  // Reconcile the local first-paint cache before the browser paints so saved
  // values apply without a visible flash (SSR and first render used defaults).
  const hydratedClient = React.useSyncExternalStore(subscribeNever, clientSnapshot, serverSnapshot);
  const [cacheAdopted, setCacheAdopted] = React.useState(Boolean(initial));
  if (hydratedClient && !cacheAdopted) {
    setCacheAdopted(true);
    setSettings(loadLocalSettings());
  }
  React.useLayoutEffect(() => {
    if (!cacheAdopted || initial) return;
    applyAppearance(stateRef.current.settings);
    // Once, when the cache is adopted; later changes apply through their writers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheAdopted]);

  // Cross-tab sync: another tab saved -> reload local cache (server wins when durable).
  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SETTINGS_LOCAL_KEY && event.key !== null) return;
      if (stateRef.current.persistence === "server") {
        void refresh();
      } else {
        const next = loadLocalSettings();
        setSettings(next);
        applyAppearance(next);
      }
    };
    const onSync = () => {
      if (stateRef.current.persistence === "server") void refresh();
      else {
        const next = loadLocalSettings();
        setSettings(next);
        applyAppearance(next);
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SETTINGS_SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SETTINGS_SYNC_EVENT, onSync);
    };
  }, [refresh]);

  // Apply appearance live whenever settings change.
  React.useEffect(() => {
    applyAppearance(settings);
  }, [settings]);

  const write = React.useCallback(
    async (patch: SettingsPatch): Promise<boolean> => {
      const current = stateRef.current;
      const optimistic = applySettingsPatch(current.settings, patch);
      setSettings(optimistic);
      applyAppearance(optimistic);
      setPhase("saving");
      setError(null);

      if (current.persistence === "server") {
        const result = await patchRemoteSettings(patch, current.serverVersion);
        if ("error" in result) {
          if (result.conflict) {
            await refresh();
          } else {
            setSettings(current.settings);
            applyAppearance(current.settings);
          }
          setError(result.error);
          setPhase("error");
          return false;
        }
        setSettings(result.settings);
        setServerVersion(result.version);
        saveLocalSettings(result.settings);
        try {
          writeThemePreference(result.settings.appearance.theme);
        } catch {
          /* ignore */
        }
        applyAppearance(result.settings);
        window.dispatchEvent(new CustomEvent(SETTINGS_SYNC_EVENT));
        setPhase("ready");
        return true;
      }

      const problem = saveLocalSettings(optimistic);
      if (problem) {
        setSettings(current.settings);
        applyAppearance(current.settings);
        setError(problem);
        setPhase("error");
        return false;
      }
      try {
        window.localStorage.setItem("ethen-theme", optimistic.appearance.theme);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent(SETTINGS_SYNC_EVENT));
      setPhase("ready");
      return true;
    },
    [refresh],
  );

  const value = React.useMemo<UserSettingsState>(
    () => ({
      settings,
      phase,
      error,
      persistence,
      signedIn,
      serverVersion,
      hydrated,
      update: write,
      save: write,
      refresh,
    }),
    [settings, phase, error, persistence, signedIn, serverVersion, hydrated, write, refresh],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useUserSettings(): UserSettingsState {
  const ctx = React.useContext(SettingsContext);
  if (!ctx) throw new Error("useUserSettings must be used inside <UserSettingsProvider>");
  return ctx;
}
