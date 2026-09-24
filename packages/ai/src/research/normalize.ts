import type {
  SearchResult,
  AnswerResult,
  ContentsResult,
  ResearchSource,
  EvidenceRow,
} from "./types";

export function normalizeExaSearchResult(raw: Record<string, unknown>): SearchResult {
  const id =
    typeof raw.id === "string"
      ? raw.id
      : `exa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const url = typeof raw.url === "string" ? raw.url : "";
  const domain = extractDomain(url);
  const contents = raw.contents as Record<string, unknown> | undefined;

  return {
    id,
    title: typeof raw.title === "string" ? raw.title : url,
    url,
    domain,
    retrievedAt: new Date().toISOString(),
    publishedDate: typeof raw.publishedDate === "string" ? raw.publishedDate : undefined,
    snippet: extractSnippet(raw, contents),
    highlights: extractHighlights(contents),
  };
}

export function normalizeExaAnswerResult(raw: Record<string, unknown>): AnswerResult {
  const sources = Array.isArray(raw.citations)
    ? (raw.citations as Array<Record<string, unknown>>).map((citation, index) =>
        normalizeSource(
          {
            id: `citation-${index + 1}`,
            title: typeof citation.title === "string" ? citation.title : undefined,
            url: typeof citation.url === "string" ? citation.url : undefined,
            publishedDate:
              typeof citation.publishedDate === "string" ? citation.publishedDate : undefined,
            snippet:
              typeof citation.snippet === "string"
                ? citation.snippet
                : typeof citation.text === "string"
                  ? citation.text
                  : undefined,
          },
          `citation-${index + 1}`,
        ),
      )
    : [];

  return {
    answer: typeof raw.answer === "string" ? raw.answer : "",
    sources,
    evidence: sources.map((source, index) => ({
      id: `answer-evidence-${index + 1}`,
      finding: "Cited in answer output",
      sourceId: source.id,
      sourceTitle: source.title,
      sourceUrl: source.url,
      sourceDomain: source.domain,
      retrievedAt: source.retrievedAt,
      status: "cited",
      snippet: source.snippet,
    })),
  };
}

export function normalizeExaContentsResult(raw: Record<string, unknown>): ContentsResult {
  const url = typeof raw.url === "string" ? raw.url : "";
  const text = typeof raw.text === "string" ? raw.text : "";
  const title = typeof raw.title === "string" ? raw.title : url;
  const source = normalizeSource(
    {
      id: "contents-source-1",
      title,
      url,
      snippet: text,
    },
    "contents-source-1",
  );

  return {
    url,
    domain: extractDomain(url),
    title,
    text,
    summary: undefined,
    characterCount: text.length,
    sources: url ? [source] : [],
    evidence: url
      ? [
          {
            id: "contents-evidence-1",
            finding: "Extracted page content available",
            sourceId: source.id,
            sourceTitle: source.title,
            sourceUrl: source.url,
            sourceDomain: source.domain,
            retrievedAt: source.retrievedAt,
            status: "extracted",
            snippet: source.snippet,
          },
        ]
      : [],
  };
}

export function buildSearchSources(results: SearchResult[]): ResearchSource[] {
  return results.map((result) =>
    normalizeSource(
      {
        id: result.id,
        title: result.title,
        url: result.url,
        retrievedAt: result.retrievedAt,
        publishedDate: result.publishedDate,
        snippet: result.snippet,
      },
      result.id,
    ),
  );
}

export function buildSearchEvidence(results: SearchResult[]): EvidenceRow[] {
  return results.map((result, index) => ({
    id: `search-evidence-${index + 1}`,
    finding: "Search result returned for the current query",
    sourceId: result.id,
    sourceTitle: result.title,
    sourceUrl: result.url,
    sourceDomain: result.domain,
    retrievedAt: result.retrievedAt,
    status: "returned",
    snippet: result.snippet,
    notes:
      result.highlights && result.highlights.length > 0
        ? limitText(result.highlights.join(" "), 220)
        : undefined,
  }));
}

function normalizeSource(
  raw: {
    id?: string;
    title?: string;
    url?: string;
    retrievedAt?: string;
    publishedDate?: string;
    snippet?: string;
  },
  fallbackId: string,
): ResearchSource {
  const url = typeof raw.url === "string" ? raw.url : "";
  return {
    id: raw.id ?? fallbackId,
    title: limitText(raw.title?.trim() || url, 180),
    url,
    domain: url ? extractDomain(url) : "",
    retrievedAt: raw.retrievedAt ?? new Date().toISOString(),
    publishedDate: raw.publishedDate,
    snippet: raw.snippet ? limitText(raw.snippet, 280) : undefined,
  };
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function extractSnippet(
  raw: Record<string, unknown>,
  contents?: Record<string, unknown>,
): string {
  if (typeof raw.snippet === "string" && raw.snippet) return raw.snippet;
  if (contents && typeof contents.text === "string" && contents.text) {
    return limitText(contents.text, 300);
  }
  if (typeof raw.text === "string" && raw.text) return limitText(raw.text, 300);
  return "";
}

function extractHighlights(contents?: Record<string, unknown>): string[] | undefined {
  if (!contents) return undefined;
  const highlights = contents.highlights;
  if (!Array.isArray(highlights)) return undefined;

  const items = highlights
    .map((highlight) => {
      if (typeof highlight === "string") return limitText(highlight, 220);
      if (
        highlight &&
        typeof highlight === "object" &&
        typeof (highlight as Record<string, unknown>).text === "string"
      ) {
        return limitText((highlight as Record<string, unknown>).text as string, 220);
      }
      return null;
    })
    .filter((value): value is string => value !== null);

  return items.length > 0 ? items : undefined;
}

function limitText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}
