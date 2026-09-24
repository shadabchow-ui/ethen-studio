/**
 * Incremental stream-text parser for Ethen Chat.
 *
 * Turns cumulative streamed text into renderer-ready blocks WITHOUT
 * rebuilding the whole response per chunk. Parsing is deterministic and
 * append-oriented, so React keys (`b-<index>`) for the completed prefix are
 * identical on every chunk.
 */

import type { ProseBlock, StreamBlock } from "./types";

export type { StreamBlock };

const FENCE = "```";

function isFence(line: string): boolean {
  return line.startsWith(FENCE);
}

function isHeading(line: string): boolean {
  return /^#{1,4}\s+\S/.test(line);
}

function listKind(line: string): "ul" | "ol" | null {
  if (/^[-*]\s+\S/.test(line)) return "ul";
  if (/^\d+[.)]\s+\S/.test(line)) return "ol";
  return null;
}

function stripListMarker(line: string): string {
  return line.replace(/^([-*]|\d+[.)])\s+/, "");
}

function isQuote(line: string): boolean {
  return line.startsWith("> ");
}

function isTableRow(line: string): boolean {
  return line.startsWith("|") && line.trimEnd().endsWith("|");
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line) && line.includes("-");
}

function splitRow(line: string): readonly string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseStreamText(text: string): readonly StreamBlock[] {
  const lines = text.split("\n");
  const blocks: StreamBlock[] = [];
  let index = 0;
  const key = () => `b-${index++}`;

  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "p", text: paragraph.join(" "), key: key() });
    paragraph = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code: stable container whether closed or still streaming.
    if (isFence(line)) {
      flushParagraph();
      const language = line.slice(FENCE.length).trim() || "text";
      const code: string[] = [];
      i += 1;
      let closed = false;
      while (i < lines.length && !isFence(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && isFence(lines[i])) {
        closed = true;
        i += 1;
      }
      void closed;
      blocks.push({ kind: "code", language, code: code.join("\n"), key: key() });
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      i += 1;
      continue;
    }

    if (isHeading(line)) {
      flushParagraph();
      blocks.push({ kind: "h", text: line.replace(/^#+\s+/, ""), key: key() });
      i += 1;
      continue;
    }

    const list = listKind(line);
    if (list !== null) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && listKind(lines[i]) === list) {
        items.push(stripListMarker(lines[i]));
        i += 1;
      }
      if (list === "ul") blocks.push({ kind: "ul", items, key: key() });
      else blocks.push({ kind: "ol", items, key: key() });
      continue;
    }

    if (isQuote(line)) {
      flushParagraph();
      const quoted: string[] = [];
      while (i < lines.length && isQuote(lines[i])) {
        quoted.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push({ kind: "quote", text: quoted.join(" "), key: key() });
      continue;
    }

    // Pipe table: header + separator establish the table; complete rows
    // append; a trailing incomplete row falls through as plain tail text.
    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isSeparatorRow(lines[i + 1]) &&
      splitRow(lines[i + 1]).length === splitRow(line).length
    ) {
      flushParagraph();
      const head = splitRow(line);
      i += 2;
      const rows: (readonly string[])[] = [];
      while (i < lines.length && isTableRow(lines[i]) && splitRow(lines[i]).length === head.length) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ kind: "table", head, rows, key: key() });
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }
  flushParagraph();
  return blocks;
}

export function streamBlockText(block: StreamBlock): string {
  switch (block.kind) {
    case "p":
    case "h":
    case "quote":
      return block.text;
    case "ul":
    case "ol":
      return block.items.join("\n");
    case "code":
      return block.code;
    case "table":
      return [...block.head, ...block.rows.flat()].join(" | ");
  }
}
