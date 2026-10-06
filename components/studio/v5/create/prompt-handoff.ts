/**
 * RC9 — long-prompt handoff (pure core, node-testable; storage calls are
 * try/catch and injectable for tests).
 *
 * The home composer navigates with `?prompt=` while the prompt fits the
 * URL-safe threshold; longer prompts are stashed in sessionStorage under a
 * short random id and the route carries `?promptRef=<id>` instead, so a
 * giant prompt never lands in the URL. Consumption is one-shot: the create
 * route reads the stash on mount and drops the key.
 */

export const PROMPT_HANDOFF_KEY_PREFIX = "ethen.studio.prompt-handoff.v1";

export interface PromptHandoffStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function promptHandoffKeyFor(id: string): string {
  return `${PROMPT_HANDOFF_KEY_PREFIX}:${id}`;
}

export function newPromptHandoffId(): string {
  try {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
  }
}

/** Pure routing decision: inline the prompt or hand it off. */
export function promptCarriageFor(
  prompt: string,
  urlSafeLength: number,
): { type: "inline"; prompt: string } | { type: "handoff"; prompt: string } {
  const trimmed = prompt.trim();
  if (!trimmed || trimmed.length <= urlSafeLength) return { type: "inline", prompt: trimmed };
  return { type: "handoff", prompt: trimmed };
}

/** Stash a prompt; returns the short id, or null when storage is unavailable. */
export function storePromptHandoff(
  storage: PromptHandoffStorage | null | undefined,
  prompt: string,
): string | null {
  if (!storage) return null;
  try {
    const id = newPromptHandoffId();
    storage.setItem(promptHandoffKeyFor(id), prompt);
    return id;
  } catch {
    return null;
  }
}

/** Peek a handoff without consuming it (mount-safe under StrictMode). */
export function peekPromptHandoff(
  storage: PromptHandoffStorage | null | undefined,
  id: string | null | undefined,
): string | null {
  if (!storage || !id) return null;
  try {
    return storage.getItem(promptHandoffKeyFor(id));
  } catch {
    return null;
  }
}

/** Drop a consumed handoff key; never throws. */
export function dropPromptHandoff(
  storage: PromptHandoffStorage | null | undefined,
  id: string | null | undefined,
): void {
  if (!storage || !id) return;
  try {
    storage.removeItem(promptHandoffKeyFor(id));
  } catch {
    // Best-effort cleanup; stale keys die with the session.
  }
}

export function sessionPromptHandoffStorage(): PromptHandoffStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
