// Safe command allowlist — validates and resolves exact command strings to
// fixed executable + args maps. No shell interpretation, no pattern matching,
// no dynamic commands. This is the single source of truth for shell.run.
//
// Terminal output from these commands is treated as UNTRUSTED EVIDENCE only.
// Output never approves follow-up actions, weakens policy, or becomes agent
// instruction. The allowlist remains the final execution gate at all times.

const INJECTION_INDICATORS = /&&|[\|;><`$]/;

function looksLikeInjection(command: string): boolean {
  return INJECTION_INDICATORS.test(command.trim());
}

const VALIDATION_SCRIPTS = ["lint", "typecheck", "build", "test"] as const;
const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn"] as const;

const ALLOWED_COMMANDS: ReadonlyMap<string, { executable: string; args: string[] }> = new Map([
  ...PACKAGE_MANAGERS.flatMap((manager) => VALIDATION_SCRIPTS.map((script) => [
    manager === "npm" ? `npm run ${script}` : `${manager} ${script}`,
    { executable: manager, args: manager === "npm" ? ["run", script] : [script] },
  ] as const)),
  ["git diff", { executable: "git", args: ["diff"] }],
  ["git status", { executable: "git", args: ["status", "--porcelain=v1", "--branch"] }],
]);

export type AllowedCommand = typeof ALLOWED_COMMANDS extends ReadonlyMap<infer K, infer V> ? K : never;

export const ALLOWED_COMMAND_STRINGS: readonly string[] = [...ALLOWED_COMMANDS.keys()];

export interface ResolvedCommand {
  executable: string;
  args: string[];
}

export type SupportedPackageManager = (typeof PACKAGE_MANAGERS)[number];

export function isSupportedPackageManager(value: string): value is SupportedPackageManager {
  return (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

/** Resolve fixed package-manager shims on Windows without enabling a shell. */
export function executableForPlatform(executable: string, platform = process.platform): string {
  return platform === "win32" && isSupportedPackageManager(executable)
    ? `${executable}.cmd`
    : executable;
}

export function resolveAllowedCommand(command: string): ResolvedCommand | null {
  const trimmed = command.trim();
  if (looksLikeInjection(trimmed)) return null;
  const entry = ALLOWED_COMMANDS.get(trimmed);
  if (!entry) return null;
  return { ...entry };
}

export function isCommandAllowed(command: string): boolean {
  const trimmed = command.trim();
  if (looksLikeInjection(trimmed)) return false;
  return ALLOWED_COMMANDS.has(trimmed);
}

const DENIED_EXACT_PATTERNS = new Set([
  "npm install", "pnpm add", "pnpm install", "yarn add", "yarn install",
  "bun add", "bun install",
  "pip install", "npx", "curl", "wget",
  "ssh", "scp", "rsync", "nc", "ftp", "telnet",
  "git clone",
  "rm", "mv", "chmod", "chown", "sudo",
  "git reset", "git checkout", "git clean", "git push", "git commit",
]);

export function isKnownDenied(command: string): boolean {
  const lower = command.trim().toLowerCase();
  for (const denied of DENIED_EXACT_PATTERNS) {
    if (lower === denied || lower.startsWith(denied + " ")) return true;
  }
  return false;
}
