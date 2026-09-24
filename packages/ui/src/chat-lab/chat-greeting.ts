/**
 * Chat greeting — resolved from the authenticated profile, never hardcoded.
 *
 * Resolution: preferredName → displayName → first token of fullName →
 * generic fallback. Emails, UUIDs, auth subject ids, and fixture words are
 * never greeted. Pure (no DOM): the shell passes the profile + clock, tests
 * import the resolvers directly.
 */

export const GREETING_FALLBACK = "What are you working on?";

export interface GreetingProfile {
  preferredName?: unknown;
  displayName?: unknown;
  fullName?: unknown;
}

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTH_SUBJECT_PREFIX = /^(user|acct|actor)[-_]/i;
const NON_NAME = /^(undefined|null|none|test user|fixture)\b/i;

function sanitizeCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!trimmed) return null;
  if (trimmed.includes("@")) return null;
  if (UUID_LIKE.test(trimmed)) return null;
  if (AUTH_SUBJECT_PREFIX.test(trimmed)) return null;
  if (NON_NAME.test(trimmed)) return null;
  return trimmed;
}

export function resolveGreetingName(profile: GreetingProfile): string | null {
  const preferred = sanitizeCandidate(profile.preferredName);
  if (preferred) return preferred;
  const display = sanitizeCandidate(profile.displayName);
  if (display) return display;
  const full = sanitizeCandidate(profile.fullName);
  if (full) {
    const first = full.split(" ")[0];
    return first && !NON_NAME.test(first) ? first : null;
  }
  return null;
}

export type Daypart = "morning" | "afternoon" | "evening";

export function daypartForHour(hour: number): Daypart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

export function resolveGreeting(profile: GreetingProfile, now: Date = new Date()): string {
  const name = resolveGreetingName(profile);
  if (!name) return GREETING_FALLBACK;
  return `Good ${daypartForHour(now.getHours())}, ${name}.`;
}
