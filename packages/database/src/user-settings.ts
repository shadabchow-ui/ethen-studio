/**
 * Durable shared settings store — server-only.
 *
 * Authority: Supabase `public.user_settings` (one row per user, RLS-scoped).
 * Validation authority stays in `@ethen/ui/settings/settings-schema` so the
 * server can never persist a document the clients cannot read.
 */
import "server-only";

import {
  applySettingsPatch,
  validateUserSettings,
  type UserSettings,
} from "@ethen/ui/settings/settings-schema";

export type { UserSettings };

export interface SettingsReadResult {
  settings: UserSettings;
  version: number;
  durable: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Synthetic/local actors (dev bypass, local review) have no profiles row, so
 * no durable user scope exists for them. They get honest local-only mode —
 * never a 500, never fake durability.
 */
export function isDurableActor(userId: string): boolean {
  return UUID_RE.test(userId);
}

/**
 * Read the caller's settings doc. Returns defaults with `durable: false`
 * when there is no database, no table, no row, or no durable actor — so
 * callers degrade honestly instead of throwing.
 */
export async function readUserSettings(userId: string): Promise<SettingsReadResult> {
  const { DEFAULT_SETTINGS } = await import("@ethen/ui/settings/settings-schema");
  const fallback = (): SettingsReadResult => ({
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as UserSettings,
    version: 0,
    durable: false,
  });
  if (!isDurableActor(userId)) return fallback();
  const { createServiceClient } = await import("./service");
  const supabase = createServiceClient({
    reason: "user_settings_read",
    actorId: userId,
  });
  if (!supabase) return fallback();
  try {
    const { data, error } = await supabase
      .from("user_settings")
      .select("settings, version")
      .eq("user_id", userId)
      .maybeSingle();
    // No row yet -> durable store, defaults. Any error (missing table,
    // RLS, outage) -> honest non-durable mode, never a throw.
    if (error || !data) {
      if (error) console.error("[user-settings] read degraded:", error.message);
      return error
        ? fallback()
        : { settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as UserSettings, version: 0, durable: true };
    }
    return {
      settings: validateUserSettings(data.settings),
      version: typeof data.version === "number" ? data.version : 1,
      durable: true,
    };
  } catch (error) {
    console.error("[user-settings] read failed:", error instanceof Error ? error.message : error);
    return fallback();
  }
}

export interface SettingsWriteResult {
  settings: UserSettings;
  version: number;
}

/**
 * Apply a partial patch with optimistic concurrency. Throws an Error with
 * `code` 409 on version conflict so routes can return an honest conflict.
 */
export async function writeUserSettings(
  userId: string,
  patch: unknown,
  baseVersion: number,
): Promise<SettingsWriteResult> {
  if (!isDurableActor(userId)) {
    throw Object.assign(new Error("Settings sync needs a real account — values stay in this browser."), {
      code: "SYNTHETIC_ACTOR",
    });
  }
  const { createServiceClient } = await import("./service");
  const supabase = createServiceClient({
    reason: "user_settings_write",
    actorId: userId,
  });
  if (!supabase) {
    throw Object.assign(new Error("Settings database is not configured for this deployment."), { code: "NO_DB" });
  }
  const current = await readUserSettings(userId);
  if (current.version !== 0 && baseVersion !== current.version) {
    throw Object.assign(new Error("Settings changed elsewhere."), { code: 409 });
  }
  const next = applySettingsPatch(current.settings, patch);
  const nextVersion = current.version + 1;
  // A durable read that found no table (migration not applied yet) still
  // reports durable:false, but a write must say so explicitly, not 500.
  if (!current.durable && current.version === 0) {
    const probe = await supabase.from("user_settings").select("user_id").limit(1);
    if (probe.error) {
      throw Object.assign(
        new Error("Settings database is not ready for this deployment (migration pending) — values stay in this browser."),
        { code: "NO_TABLE" },
      );
    }
  }
  try {
    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: userId,
        settings: next,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      throw Object.assign(new Error("Settings could not be saved."), { code: "DB_WRITE", cause: error });
    }
  } catch (error) {
    if ((error as { code?: unknown }).code === "DB_WRITE") throw error;
    throw Object.assign(new Error("Settings could not be saved. Try again."), { code: "DB_WRITE" });
  }
  return { settings: next, version: nextVersion };
}

/** Append-only audit entry for sensitive settings actions. Never throws. */
export async function auditSettingsAction(
  userId: string,
  action: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { createServiceClient } = await import("./service");
    const supabase = createServiceClient({ reason: "user_settings_audit", actorId: userId });
    if (!supabase) return;
    await supabase.from("user_settings_audit").insert({
      user_id: userId,
      action: action.slice(0, 128),
      detail,
    });
  } catch {
    /* audit is best-effort */
  }
}
