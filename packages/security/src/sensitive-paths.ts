// Sensitive path detection for the local coding agent.
// Blocks or flags reads/writes to paths that commonly contain secrets.

export const DENIED_PATH_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /(?:^|\/)\.env(?:\.\w+)?$/, reason: "Environment files may contain secrets." },
  { pattern: /(?:^|\/)\.ssh\//, reason: "SSH directory may contain private keys." },
  { pattern: /(?:^|\/)\.aws\//, reason: "AWS directory may contain credentials." },
  { pattern: /(?:^|\/)\.npmrc$/, reason: "npmrc may contain auth tokens." },
  { pattern: /(?:^|\/)\.npmrc$/, reason: "npmrc may contain auth tokens." },
  { pattern: /(?:^|\/)credentials(?:\.\w+)?$/i, reason: "Credentials files may contain secrets." },
  { pattern: /(?:^|\/)\.gcloud\//, reason: "GCloud directory may contain credentials." },
  { pattern: /(?:^|\/)\.config\/gcloud\//, reason: "GCloud config may contain credentials." },
  { pattern: /(?:^|\/)\.kube\//, reason: "Kube directory may contain credentials." },
  { pattern: /(?:^|\/)\.docker\//, reason: "Docker directory may contain credentials." },
  { pattern: /(?:^|\/)\.netrc$/, reason: "netrc may contain credentials." },
  { pattern: /(?:^|\/)id_rsa(?:\.\w+)?$/, reason: "SSH private key file." },
  { pattern: /(?:^|\/)id_ed25519(?:\.\w+)?$/, reason: "SSH private key file." },
  { pattern: /(?:^|\/)id_ecdsa(?:\.\w+)?$/, reason: "SSH private key file." },
  { pattern: /(?:^|\/)id_dsa(?:\.\w+)?$/, reason: "SSH private key file." },
  { pattern: /(?:^|\/)\.pem$/, reason: "PEM files may contain private keys." },
  { pattern: /(?:^|\/)\.key$/, reason: "Key files may contain private keys." },
  { pattern: /\.key$/, reason: "Key files may contain private keys." },
  { pattern: /(?:^|\/)\.pfx$/, reason: "PFX files may contain private keys." },
  { pattern: /(?:^|\/)\.p12$/, reason: "P12 files may contain private keys." },
  { pattern: /(?:^|\/)secrets?\.(?:ya?ml|json|toml|env)$/i, reason: "Secrets file may contain credentials." },
  { pattern: /(?:^|\/)\.[a-z]+rc$/, reason: "Config files may contain tokens." },
];

export const WARN_PATH_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /(?:^|\/)\.github\//, reason: "GitHub config — review for tokens." },
  { pattern: /(?:^|\/)\.gitlab-ci\.yml$/, reason: "CI config — may contain tokens." },
  { pattern: /(?:^|\/)\.circleci\//, reason: "CI config — may contain tokens." },
  { pattern: /(?:^|\/)Makefile$/, reason: "Build config — review for tokens." },
  { pattern: /(?:^|\/)Dockerfile(?:\.\w+)?$/i, reason: "Docker config — review for tokens." },
  { pattern: /(?:^|\/)docker-compose(?:\.\w+)?\.ya?ml$/i, reason: "Docker config — review for tokens." },
];

export interface SensitivePathResult {
  blocked: boolean;
  warning: boolean;
  reason: string | null;
}

export function checkSensitivePath(filePath: string): SensitivePathResult {
  if (!filePath) return { blocked: false, warning: false, reason: null };

  const normalized = filePath.replace(/\\/g, "/");

  for (const { pattern, reason } of DENIED_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      return { blocked: true, warning: false, reason };
    }
  }

  for (const { pattern, reason } of WARN_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      return { blocked: false, warning: true, reason };
    }
  }

  return { blocked: false, warning: false, reason: null };
}

export function isSensitivePath(filePath: string): boolean {
  return checkSensitivePath(filePath).blocked;
}

export function isWarnPath(filePath: string): boolean {
  return checkSensitivePath(filePath).warning;
}
