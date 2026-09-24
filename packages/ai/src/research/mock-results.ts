import type { ResearchResult } from "./types";

export const MOCK_SEARCH_RESULT: ResearchResult = {
  mode: "search",
  results: [],
};

export const MOCK_ANSWER_RESULT: ResearchResult = {
  mode: "answer",
  result: {
    answer: "",
    sources: [],
    evidence: [],
  },
};

export const MOCK_CONTENTS_RESULT: ResearchResult = {
  mode: "contents",
  result: {
    url: "",
    domain: "",
    title: "No URL provided",
    text: "",
    summary: undefined,
    characterCount: 0,
    sources: [],
    evidence: [],
  },
};

export const MOCK_AGENT_RESULT: ResearchResult = {
  mode: "agent",
  result: {
    objective: "Preview mode only",
    steps: [
      { id: "s1", label: "Live provider unavailable in preview mode", status: "done" },
    ],
    report: "",
    sources: [],
    outputFormat: "report",
    evidence: [],
  },
};

export function getMockResult(mode: string): ResearchResult {
  if (mode === "search") return MOCK_SEARCH_RESULT;
  if (mode === "answer") return MOCK_ANSWER_RESULT;
  if (mode === "agent") return MOCK_AGENT_RESULT;
  return MOCK_CONTENTS_RESULT;
}
