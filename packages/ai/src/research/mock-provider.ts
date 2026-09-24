import type {
  SearchFormState,
  AnswerFormState,
  ContentsFormState,
  AgentFormState,
  SearchResult,
  AnswerResult,
  ContentsResult,
  AgentResult,
} from "./types";

export function mockSearch(form: SearchFormState): SearchResult[] {
  void form;
  return [];
}

export function mockAnswer(form: AnswerFormState): AnswerResult {
  void form;
  return {
    answer: "",
    sources: [],
    evidence: [],
  };
}

export function mockContents(form: ContentsFormState): ContentsResult {
  const url = form.url.trim();
  const domain = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  return {
    url,
    domain,
    title: url || "No URL provided",
    text: "",
    summary: undefined,
    characterCount: 0,
    sources: url ? [{ id: "preview-url", title: url, url, domain }] : [],
    evidence: [],
  };
}

export function mockAgent(form: AgentFormState): AgentResult {
  const objective = form.objective.trim() || "your research objective";
  return {
    objective,
    steps: [
      { id: "s1", label: "Live provider unavailable in preview mode", status: "done" },
      {
        id: "s2",
        label: `Waiting for EXA_API_KEY before researching "${objective.slice(0, 60)}${objective.length > 60 ? "…" : ""}"`,
        status: "done",
      },
    ],
    report: "",
    sources: [],
    outputFormat: form.outputFormat,
    evidence: [],
  };
}
