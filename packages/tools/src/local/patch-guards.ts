import path from "node:path";
import fs from "node:fs";
import { resolveRepoPath, looksLikeBinary, isSymlink, MAX_FILE_BYTES } from "./guards";

const SECRET_PATH_PATTERNS = [
  ".env",
  ".npmrc",
  ".git-credentials",
  "credentials.json",
  "service-account.json",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "known_hosts",
  "authorized_keys",
];

const SECRET_DIR_PREFIXES = [
  ".ssh/",
  ".aws/",
  ".gcloud/",
  ".config/gcloud/",
];

export interface PathSafetyResult {
  safe: boolean;
  reason?: string;
}

export function validatePatchPath(root: string, relPath: string): PathSafetyResult {
  if (path.isAbsolute(relPath)) {
    return { safe: false, reason: `Absolute paths are not accepted: "${relPath}".` };
  }

  if (relPath.includes("\0")) {
    return { safe: false, reason: `Path contains null bytes: "${relPath}".` };
  }

  try {
    resolveRepoPath(root, relPath);
  } catch (e) {
    return { safe: false, reason: e instanceof Error ? e.message : "Path traversal detected." };
  }

  const abs = path.resolve(root, relPath);
  // Reject symlinks in patch paths — if the target exists as a symlink,
  // the patch would follow it outside the repo root boundary.
  if (fs.existsSync(abs) && isSymlink(abs)) {
    return { safe: false, reason: `Symlinks are not allowed in patch paths: "${relPath}".` };
  }

  const normalized = path.normalize(relPath);

  if (normalized.startsWith(".git") && (normalized === ".git" || normalized.startsWith(".git/"))) {
    return { safe: false, reason: `.git paths are rejected: "${relPath}".` };
  }

  const basename = path.basename(normalized);
  for (const pattern of SECRET_PATH_PATTERNS) {
    if (basename === pattern) {
      return { safe: false, reason: `Secret-like file blocked: "${relPath}".` };
    }
    if (basename.startsWith(pattern)) {
      return { safe: false, reason: `Secret-like file blocked: "${relPath}".` };
    }
  }

  if (basename.startsWith(".env")) {
    return { safe: false, reason: `Environment file blocked: "${relPath}".` };
  }

  for (const prefix of SECRET_DIR_PREFIXES) {
    if (normalized.startsWith(prefix) || normalized.startsWith(`./${prefix}`)) {
      return { safe: false, reason: `Secret directory path blocked: "${relPath}".` };
    }
  }

  return { safe: true };
}

export function validatePatchFileContent(root: string, relPath: string, content: string): PathSafetyResult {
  try {
    const abs = resolveRepoPath(root, relPath);
    if (!fs.existsSync(abs)) {
      return { safe: true };
    }
    // Reject symlinks before any file operation — lstatSync does not follow
    // symlinks, preventing a crafted symlink from bypassing path traversal
    // guards by pointing outside the repo root.
    if (isSymlink(abs)) {
      return { safe: false, reason: `Symlinks are not allowed in patch paths: "${relPath}".` };
    }
    const stat = fs.statSync(abs);
    if (stat.size > MAX_FILE_BYTES) {
      return { safe: false, reason: `File exceeds max size (${MAX_FILE_BYTES} bytes): "${relPath}".` };
    }
  } catch {
    return { safe: true };
  }

  const buf = Buffer.from(content, "utf8");
  if (looksLikeBinary(buf)) {
    return { safe: false, reason: `Binary content rejected: "${relPath}".` };
  }

  return { safe: true };
}
