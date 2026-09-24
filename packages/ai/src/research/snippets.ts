import type {
  ResearchMode,
  SearchFormState,
  AnswerFormState,
  ContentsFormState,
  AgentFormState,
  CodeLanguage,
} from "./types";

// ── Python ─────────────────────────────────────────────────────────────────────

function searchPython(s: SearchFormState): string {
  const contentsObj = buildContentsObject(s.highlights, s.fullText);
  const contentsLine = contentsObj
    ? `\n    contents=${JSON.stringify(contentsObj)},`
    : "";
  return `from exa_py import Exa

exa = Exa(api_key="EXA_API_KEY")

results = exa.search(
    "${s.query || "your query here"}",
    type="${s.searchType}",
    num_results=${s.numResults},
    category="${s.category}",${contentsLine}
)

for r in results.results:
    print(r.title, r.url)`;
}

function answerPython(a: AnswerFormState): string {
  return `from exa_py import Exa

exa = Exa(api_key="EXA_API_KEY")

response = exa.answer(
    "${a.query || "your question here"}",
    text=${a.text ? "True" : "False"},
    stream=${a.stream ? "True" : "False"},
)

print(response.answer)`;
}

function contentsPython(c: ContentsFormState): string {
  return `from exa_py import Exa

exa = Exa(api_key="EXA_API_KEY")

results = exa.get_contents(
    ["${c.url || "https://example.com"}"],
    max_characters=${c.maxCharacters},
    main_content_only=${c.mainContentOnly ? "True" : "False"},
    highlights=${c.highlights ? "True" : "False"},
)

for r in results.results:
    print(r.title)
    print(r.text[:500])`;
}

// ── JavaScript ────────────────────────────────────────────────────────────────

function searchJS(s: SearchFormState): string {
  const contentsObj = buildContentsObject(s.highlights, s.fullText);
  const contentsLine = contentsObj
    ? `\n  contents: ${JSON.stringify(contentsObj)},`
    : "";
  return `import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY);

const results = await exa.search("${s.query || "your query here"}", {
  type: "${s.searchType}",
  numResults: ${s.numResults},
  category: "${s.category}",${contentsLine}
});

results.results.forEach(r => {
  console.log(r.title, r.url);
});`;
}

function answerJS(a: AnswerFormState): string {
  return `import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY);

const response = await exa.answer("${a.query || "your question here"}", {
  text: ${a.text},
  stream: ${a.stream},
});

console.log(response.answer);`;
}

function contentsJS(c: ContentsFormState): string {
  return `import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY);

const results = await exa.getContents(
  ["${c.url || "https://example.com"}"],
  {
    maxCharacters: ${c.maxCharacters},
    mainContentOnly: ${c.mainContentOnly},
    highlights: ${c.highlights},
  }
);

results.results.forEach(r => {
  console.log(r.title, r.text.slice(0, 500));
});`;
}

// ── cURL ──────────────────────────────────────────────────────────────────────

function searchCurl(s: SearchFormState): string {
  const body: Record<string, unknown> = {
    query: s.query || "your query here",
    type: s.searchType,
    numResults: s.numResults,
    category: s.category,
  };
  const co = buildContentsObject(s.highlights, s.fullText);
  if (co) body.contents = co;
  return `curl -X POST https://api.exa.ai/search \\
  -H "x-api-key: $EXA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
}

function answerCurl(a: AnswerFormState): string {
  const body = {
    query: a.query || "your question here",
    text: a.text,
    stream: a.stream,
  };
  return `curl -X POST https://api.exa.ai/answer \\
  -H "x-api-key: $EXA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
}

function contentsCurl(c: ContentsFormState): string {
  const body = {
    ids: [c.url || "https://example.com"],
    maxCharacters: c.maxCharacters,
    mainContentOnly: c.mainContentOnly,
    highlights: c.highlights,
  };
  return `curl -X POST https://api.exa.ai/contents \\
  -H "x-api-key: $EXA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildContentsObject(
  highlights: boolean,
  fullText: boolean
): Record<string, boolean> | null {
  if (!highlights && !fullText) return null;
  const obj: Record<string, boolean> = {};
  if (highlights) obj.highlights = true;
  if (fullText) obj.text = true;
  return obj;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

function agentPython(a: AgentFormState): string {
  return `from exa_py import Exa

exa = Exa(api_key="EXA_API_KEY")

# Agent / Deep Research — multi-step objective search
result = exa.research(
    objective="${a.objective || "your research objective here"}",
    max_sources=${a.maxSources},
    output_format="${a.outputFormat}",
    source_constraints="${a.sourceConstraints || ""}",
)

print(result.report)
for source in result.sources:
    print(source.title, source.url)`;
}

function agentJS(a: AgentFormState): string {
  return `import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY);

// Agent / Deep Research — multi-step objective search
const result = await exa.research("${a.objective || "your research objective here"}", {
  maxSources: ${a.maxSources},
  outputFormat: "${a.outputFormat}",
  sourceConstraints: "${a.sourceConstraints || ""}",
});

console.log(result.report);
result.sources.forEach(s => console.log(s.title, s.url));`;
}

function agentCurl(a: AgentFormState): string {
  const body: Record<string, unknown> = {
    objective: a.objective || "your research objective here",
    maxSources: a.maxSources,
    outputFormat: a.outputFormat,
  };
  if (a.sourceConstraints) body.sourceConstraints = a.sourceConstraints;
  return `curl -X POST https://api.exa.ai/research \\
  -H "x-api-key: $EXA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body, null, 2)}'`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateSnippet(
  mode: ResearchMode,
  lang: CodeLanguage,
  search: SearchFormState,
  answer: AnswerFormState,
  contents: ContentsFormState,
  agent: AgentFormState
): string {
  if (mode === "search") {
    if (lang === "python") return searchPython(search);
    if (lang === "javascript") return searchJS(search);
    return searchCurl(search);
  }
  if (mode === "answer") {
    if (lang === "python") return answerPython(answer);
    if (lang === "javascript") return answerJS(answer);
    return answerCurl(answer);
  }
  if (mode === "agent") {
    if (lang === "python") return agentPython(agent);
    if (lang === "javascript") return agentJS(agent);
    return agentCurl(agent);
  }
  if (lang === "python") return contentsPython(contents);
  if (lang === "javascript") return contentsJS(contents);
  return contentsCurl(contents);
}
