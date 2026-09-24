// Client-safe constants shared by the local repo bridge and the coding
// runtime's context summary UI. No Node-only imports here — this module is
// read directly by client components and must stay free of fs/path so it
// never pulls Node-only code into the browser bundle.

export const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".cache",
  "out",
]);

export const MAX_FILE_BYTES = 512 * 1024; // 512 KB
export const MAX_TREE_ENTRIES = 2000;

/** Returns true if this directory name should be skipped. */
export function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}
