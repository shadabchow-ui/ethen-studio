// Client-safe sandbox module.
//
// All Node-dependent sandbox functions have been moved to
// `./sandbox-server.ts` (guarded by `import "server-only"`).
//
// Server-side code must import directly from:
//   import { ... } from "./sandbox-server";
//
// Client-facing code (types, display helpers) stays here.

/**
 * Display the sandbox path in a human-readable form.
 * Uses only string operations — no filesystem access.
 */
export function getSandboxDisplayPathFromRoot(
  sandboxPath: string,
  sandboxRoot: string | null,
): string {
  if (sandboxRoot && sandboxPath.startsWith(sandboxRoot)) {
    const rel = sandboxPath.slice(sandboxRoot.length).replace(/^[/\\]+/, "");
    return `[sandbox]/${rel}`;
  }
  // Best-effort basename without node:path
  const parts = sandboxPath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? sandboxPath;
}
