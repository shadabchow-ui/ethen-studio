"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { Fragment } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "./lib/utils";

interface MarkdownLightProps {
  content: string;
  className?: string;
}

type ListState =
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

interface TableState {
  headers: string[];
  rows: string[][];
}

function CodeBlock({ language, code, className }: { language: string; code: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className={cn("ethen-code-block", className)}>
      <div className="ethen-code-header">
        <span className="ethen-code-lang">{language || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="ethen-code-copy"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {language ? (
        <SyntaxHighlighter
          language={language}
          style={oneDark}
          customStyle={{
            margin: 0,
            background: "transparent",
            border: "none",
            borderRadius: 0,
          }}
          codeTagProps={{ style: { background: "transparent", fontFamily: "inherit" } }}
        >
          {code}
        </SyntaxHighlighter>
      ) : (
        <pre className="overflow-x-auto"><code>{code}</code></pre>
      )}
    </div>
  );
}

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(`[^`]+`)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(_([^_]+)_)|(`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      nodes.push(
        <a key={`link-${match.index}`} href={match[4]} rel="noopener noreferrer" target="_blank">
          {parseInline(match[3])}
        </a>,
      );
    } else if (match[5]) {
      nodes.push(<strong key={`strong-${match.index}`}>{match[6]}</strong>);
    } else if (match[7]) {
      nodes.push(<em key={`em-${match.index}`}>{match[8]}</em>);
    } else {
      nodes.push(
        <code key={`code-${match.index}`}>
          {match[0].slice(1, -1)}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function parseBlocks(content: string) {
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: ListState | null = null;
  let codeFence: { language: string; lines: string[] } | null = null;
  let table: TableState | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ").trim();
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`}>
          {parseInline(text)}
        </p>,
      );
    }
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const Tag = list.type;
    blocks.push(
      <Tag key={`list-${blocks.length}`}>
        {list.items.map((item, index) => (
          <li key={`${Tag}-${index}`}>{parseInline(item)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  const flushCodeFence = () => {
    if (!codeFence) return;
    blocks.push(
      <CodeBlock key={`pre-${blocks.length}`} language={codeFence.language} code={codeFence.lines.join("\n")} />,
    );
    codeFence = null;
  };

  const flushTable = () => {
    if (!table || table.headers.length === 0) return;
    blocks.push(
      <div key={`table-wrapper-${blocks.length}`} className="ethen-table-wrapper">
        <table>
          <thead>
            <tr>
              {table.headers.map((h, i) => (
                <th key={i}>{parseInline(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{parseInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = null;
  };

  for (const line of lines) {
    if (codeFence) {
      if (/^```/.test(line.trim())) {
        flushCodeFence();
      } else {
        codeFence.lines.push(line);
      }
      continue;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const fenceMatch = trimmed.match(/^```([\w-+#]+)?\s*$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      flushTable();
      codeFence = { language: fenceMatch[1] ?? "", lines: [] };
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushTable();
      const level = headingMatch[1].length as 1 | 2 | 3 | 4;
      const Tag = `h${level}` as const;
      blocks.push(
        <Tag key={`h-${blocks.length}`}>
          {parseInline(headingMatch[2].trim())}
        </Tag>,
      );
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      flushTable();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(bulletMatch[1].trim());
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      flushTable();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(orderedMatch[2].trim());
      continue;
    }

    const blockquoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      flushTable();
      const content = blockquoteMatch[1];
      blocks.push(
        <blockquote key={`bq-${blocks.length}`}>
          {content ? parseInline(content) : <br />}
        </blockquote>,
      );
      continue;
    }

    const hrMatch = /^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed) || /^_{3,}$/.test(trimmed);
    if (hrMatch) {
      flushParagraph();
      flushList();
      flushTable();
      blocks.push(<hr key={`hr-${blocks.length}`} />);
      continue;
    }

    const tableRowMatch = trimmed.match(/^\|(.+)\|$/);
    if (tableRowMatch) {
      flushParagraph();
      flushList();
      const cells = tableRowMatch[1].split("|").map((c) => c.trim());
      const isSeparator = cells.every((c) => /^:?-{3,}:?$/.test(c));
      if (isSeparator) {
        continue;
      }
      if (!table) {
        table = { headers: cells, rows: [] };
      } else if (table.rows.length === 0 && table.headers.length === cells.length) {
        table.rows.push(cells);
      } else if (table.headers.length === cells.length) {
        table.rows.push(cells);
      } else {
        flushTable();
        paragraph.push(trimmed);
      }
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushCodeFence();
  flushTable();

  return blocks;
}

export function MarkdownLight({ content, className }: MarkdownLightProps) {
  return (
    <div className={cn("ethen-prose", className)}>
      {parseBlocks(content).map((block, index) => (
        <Fragment key={index}>{block}</Fragment>
      ))}
    </div>
  );
}
