export type ResearchMode = "search" | "answer" | "contents" | "agent";
export type SearchType = "instant" | "fast" | "auto" | "deep";
export type SearchCategory =
  | "general"
  | "news"
  | "company"
  | "research"
  | "financials"
  | "people";
export type CodeLanguage = "python" | "javascript" | "curl";
export type RightTab = "output" | "code";

/** Shared plan contract for the canonical /research workspace. */
export interface ResearchPlanData {
  id?: string;
  version?: number;
  hash?: string;
  objective: string;
  keyQuestions: string[];
  subtopics: string[];
  sourcePriorities?: string[];
  sourceClasses?: string[];
  domainConstraints?: string[];
  dateConstraints?: string;
  requirePrimarySources?: boolean;
  depth: "standard" | "deep" | "max";
  resultCeiling?: number;
  timeBudgetMinutes?: number | null;
  tokenBudget?: number | null;
  costBudgetUsd?: number | null;
  exclusions?: string[];
  cost?: { status: "unavailable" | "estimate" | "observed"; amountUsd: number | null; authority: string | null };
  approval?: { approvedAt: string; planVersion: number; planHash: string } | null;
  approved?: boolean;
}

export interface SearchFormState {
  query: string;
  searchType: SearchType;
  numResults: number;
  category: SearchCategory;
  highlights: boolean;
  fullText: boolean;
  structuredOutputs: boolean;
}

export interface AnswerFormState {
  query: string;
  text: boolean;
  stream: boolean;
  systemPrompt: string;
  outputSchema: string;
}

export interface ContentsFormState {
  url: string;
  maxCharacters: number;
  mainContentOnly: boolean;
  fullWebpageText: boolean;
  highlights: boolean;
}

export type AgentOutputFormat = "report" | "list" | "json" | "markdown";

export interface AgentFormState {
  objective: string;
  sourceConstraints: string;
  outputFormat: AgentOutputFormat;
  maxSources: number;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  domain: string;
  retrievedAt?: string;
  publishedDate?: string;
  snippet: string;
  highlights?: string[];
}

export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  retrievedAt?: string;
  publishedDate?: string;
  snippet?: string;
}

export interface EvidenceRow {
  id: string;
  finding: string;
  sourceId?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  sourceDomain?: string;
  retrievedAt?: string;
  status?: string;
  confidence?: string;
  notes?: string;
  snippet?: string;
}

export interface AnswerResult {
  answer: string;
  sources: ResearchSource[];
  evidence: EvidenceRow[];
}

export interface ContentsResult {
  url: string;
  domain: string;
  title: string;
  text: string;
  summary?: string;
  characterCount: number;
  sources: ResearchSource[];
  evidence: EvidenceRow[];
}

export interface AgentStep {
  id: string;
  label: string;
  status: "done" | "running" | "pending";
}

export interface AgentResult {
  objective: string;
  steps: AgentStep[];
  report: string;
  sources: ResearchSource[];
  outputFormat: AgentOutputFormat;
  evidence: EvidenceRow[];
}

export type ResearchResult =
  | { mode: "search"; results: SearchResult[] }
  | { mode: "answer"; result: AnswerResult }
  | { mode: "contents"; result: ContentsResult }
  | { mode: "agent"; result: AgentResult };

export interface ResearchRunState {
  status: "idle" | "running" | "success" | "error";
  result: ResearchResult | null;
  error: string | null;
  provider?: "exa" | "mock";
}
