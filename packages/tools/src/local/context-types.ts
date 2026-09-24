import type { RepoMetadata } from "./types";

export interface ProjectRuleFile {
  path: string;
  content: string | null;
  size: number | null;
  error: string | null;
  truncated: boolean;
}

export interface ProjectRulesContext {
  repoRoot: string;
  meta: RepoMetadata | null;
  agenetsMd: ProjectRuleFile | null;
  claudeMd: ProjectRuleFile | null;
  cursorRules: ProjectRuleFile[];
  readmeMd: ProjectRuleFile | null;
  packageScripts: Record<string, string> | null;
  loadedAt: string;
  warnings: string[];
}
