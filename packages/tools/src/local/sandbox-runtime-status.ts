export interface SandboxRuntimeStatus {
  configured: boolean;
  available: boolean;
  note: string;
}

export function getSandboxRuntimeStatus(): SandboxRuntimeStatus {
  const root = process.env.ETHEN_LOCAL_SANDBOX_ROOT?.trim() ?? "";

  if (!root) {
    return {
      configured: false,
      available: false,
      note: "ETHEN_LOCAL_SANDBOX_ROOT is not configured. Set this environment variable to enable isolated git worktree execution.",
    };
  }

  return {
    configured: true,
    available: true,
    note: `Sandbox root is configured via ETHEN_LOCAL_SANDBOX_ROOT. Filesystem and git availability are validated when a worktree is requested.`,
  };
}
