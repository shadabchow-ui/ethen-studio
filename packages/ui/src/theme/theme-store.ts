/**
 * Unified Ethen theme preference store (M3 — V2 theme unification).
 *
 * ONE preference model: `system | light | dark`
 * ONE storage key:    `ethen-theme`
 * ONE bootstrap:      the pre-hydration script in app/layout.tsx
 *
 * Legacy keys are migrated on first read and never written again:
 *   - `ethen:v2:design-lab-theme` (Design Lab)
 *   - `ethen:theme` (SettingsSystemPanel)
 *
 * The RESOLVED theme (dark|light) is applied to <html> via `data-theme`,
 * the `.dark` class, and `style.colorScheme`, mirroring exactly what the
 * pre-hydration bootstrap does, so UI-driven changes and the bootstrap can
 * never disagree.
 */
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "ethen-theme";
export const LEGACY_THEME_STORAGE_KEY = "ethen:v2:design-lab-theme";
export const SETTINGS_LEGACY_THEME_STORAGE_KEY = "ethen:theme";

/**
 * Blocking first-paint bootstrap. Kept as a string so app/layout.tsx can
 * emit it as a native <head> script — Next.js `beforeInteractive` now
 * queues into `self.__next_s` and can run after the first body paint.
 */
export const THEME_BOOTSTRAP_SCRIPT = `try {
  var root = document.documentElement;
  var stored = window.localStorage.getItem("ethen-theme");
  if (stored !== "system" && stored !== "light" && stored !== "dark") {
    var legacy = window.localStorage.getItem("ethen:v2:design-lab-theme");
    if (legacy !== "system" && legacy !== "light" && legacy !== "dark") {
      legacy = window.localStorage.getItem("ethen:theme");
    }
    if (legacy === "system" || legacy === "light" || legacy === "dark") {
      window.localStorage.setItem("ethen-theme", legacy);
      window.localStorage.removeItem("ethen:v2:design-lab-theme");
      window.localStorage.removeItem("ethen:theme");
      stored = legacy;
    }
  }
  var theme = stored;
  if (!theme || theme === "system") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  root.dataset.theme = theme;
  if (theme === "dark") {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (event) {
    try {
      var preference = window.localStorage.getItem("ethen-theme");
      if (preference && preference !== "system") return;
      var next = event.matches ? "dark" : "light";
      root.dataset.theme = next;
      if (next === "dark") {
        root.classList.add("dark");
        root.style.colorScheme = "dark";
      } else {
        root.classList.remove("dark");
        root.style.colorScheme = "light";
      }
    } catch (error) {}
  });
} catch (error) {}`;

type ThemeListener = (preference: ThemePreference) => void;

const listeners = new Set<ThemeListener>();

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function persistCanonical(preference: ThemePreference): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
  window.localStorage.removeItem(SETTINGS_LEGACY_THEME_STORAGE_KEY);
}

function notify(preference: ThemePreference): void {
  listeners.forEach((listener) => listener(preference));
}

/**
 * Read the unified preference. Falls back to the legacy Design Lab key, then
 * the historical Settings key, and migrates (write unified key, remove
 * legacy keys) so the preference carries between lab, settings, and the
 * rest of the app exactly once.
 */
export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;

    const lab = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (isThemePreference(lab)) {
      persistCanonical(lab);
      return lab;
    }

    const settings = window.localStorage.getItem(SETTINGS_LEGACY_THEME_STORAGE_KEY);
    if (settings === "light" || settings === "dark") {
      persistCanonical(settings);
      return settings;
    }
  } catch {
    /* storage unavailable — fall through to system */
  }
  return "system";
}

/** Persist the PREFERENCE (never the resolved value — §31K). */
export function writeThemePreference(preference: ThemePreference): void {
  try {
    persistCanonical(preference);
  } catch {
    /* storage unavailable — in-memory preference still applies */
  }
  notify(preference);
}

/** Subscribe to preference writes from any control on this page. */
export function subscribeThemePreference(listener: ThemeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The resolved theme the SERVER always produces (no window → no OS query, and
 * no storage → the preference is always "system"). Client components must use
 * this for their first render so the hydrating tree matches the server HTML,
 * then reconcile to the real resolved theme in a layout effect.
 */
export const SSR_RESOLVED_THEME: ResolvedTheme = "dark";

/** Resolve a preference against the current OS color scheme. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  if (typeof window === "undefined") return "dark";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "dark";
  }
}

/**
 * Read the already-applied resolved theme from <html>. The pre-hydration
 * bootstrap has set this before any React render, so client components can
 * initialize icons/labels without waiting for an effect.
 */
export function readResolvedThemeFromDocument(): ResolvedTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Apply a RESOLVED theme to <html>. Must stay consistent with the
 * pre-hydration bootstrap in app/layout.tsx.
 */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

/** Resolve + apply a stored preference. Returns the resolved value. */
export function applyThemePreference(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  applyResolvedTheme(resolved);
  return resolved;
}

/**
 * D15-J02 — route-scoped theme lock.
 *
 * Lets a route (e.g. `/code`, dark-only for F-03) pin its rendered theme
 * without mutating the viewer's stored preference: the lock overrides
 * resolution only, never storage. Leaving the locked route resolves the
 * stored preference again, exactly as before. The preference model,
 * `data-theme` stamping, `.dark` class and `colorScheme` behaviour above
 * are unchanged — locked values flow through the same `applyResolvedTheme`.
 *
 * Locks live in module memory (defaults below) so no route adoption or
 * layout change is needed to register them; F-03 adopts them per route.
 */
export interface ThemeRouteLock {
  /** Route prefix matched on segment boundaries (`/code` matches `/code/1`, never `/codex`). */
  routePrefix: string;
  theme: ResolvedTheme;
}

export const DEFAULT_ROUTE_THEME_LOCKS: readonly ThemeRouteLock[] = [
  { routePrefix: "/code", theme: "dark" },
];

const routeThemeLocks = new Map<string, ResolvedTheme>(
  DEFAULT_ROUTE_THEME_LOCKS.map((lock) => [lock.routePrefix, lock.theme]),
);

/** Register (or re-point) a route-scoped lock. Never touches storage. */
export function lockThemeForRoute(routePrefix: string, theme: ResolvedTheme): void {
  routeThemeLocks.set(routePrefix, theme);
}

/** Remove a route-scoped lock. Returns true when a lock was registered. Never touches storage. */
export function unlockThemeForRoute(routePrefix: string): boolean {
  return routeThemeLocks.delete(routePrefix);
}

/** Snapshot the registered locks (defaults included unless unlocked). */
export function getRouteThemeLocks(): readonly ThemeRouteLock[] {
  return [...routeThemeLocks.entries()].map(([routePrefix, theme]) => ({ routePrefix, theme }));
}

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  const path = pathname.split("?")[0].split("#")[0];
  if (prefix === "/") return path.startsWith("/");
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Longest matching lock wins; null when no lock covers the path. */
export function getRouteLockedTheme(pathname: string): ResolvedTheme | null {
  let matched: ResolvedTheme | null = null;
  let longest = -1;
  for (const [prefix, theme] of routeThemeLocks) {
    if (prefix.length > longest && matchesRoutePrefix(pathname, prefix)) {
      matched = theme;
      longest = prefix.length;
    }
  }
  return matched;
}

/** Resolve a path: locked theme wins, otherwise the stored preference resolves as before. */
export function resolveThemeForPath(pathname: string, preference: ThemePreference): ResolvedTheme {
  return getRouteLockedTheme(pathname) ?? resolveTheme(preference);
}

/**
 * Resolve + apply for a path. Applies through the same document stamping
 * and never writes the stored preference.
 */
export function applyThemeForPath(pathname: string, preference: ThemePreference): ResolvedTheme {
  const resolved = resolveThemeForPath(pathname, preference);
  applyResolvedTheme(resolved);
  return resolved;
}
