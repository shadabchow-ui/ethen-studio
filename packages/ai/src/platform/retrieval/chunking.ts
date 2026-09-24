import type { ChunkingOptions } from "./types";
import { DEFAULT_CHUNKING_OPTIONS } from "./types";

export interface ChunkResult {
  text: string;
  hash: string;
  index: number;
}

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return `h-${(hash >>> 0).toString(36)}`;
}

/**
 * Split content into chunks by paragraph/sentence boundaries.
 * Uses a greedy paragraph-first approach with character limits.
 */
export function chunkContent(
  content: string,
  opts?: ChunkingOptions,
): ChunkResult[] {
  const options = { ...DEFAULT_CHUNKING_OPTIONS, ...opts };
  if (!content.trim()) return [];

  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: ChunkResult[] = [];
  let currentText = "";

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    if (currentText.length + para.length + 2 <= options.maxChunkChars) {
      currentText = currentText ? `${currentText}\n\n${para}` : para;
    } else {
      if (currentText.length >= options.minChunkChars) {
        chunks.push({
          text: currentText,
          hash: simpleHash(currentText),
          index: chunks.length,
        });
        currentText = para;
      } else {
        const combined = currentText ? `${currentText}\n\n${para}` : para;
        const sentences = combined.split(/(?<=[.!?])\s+/);
        let sentenceChunk = "";
        for (const sentence of sentences) {
          if (sentenceChunk.length + sentence.length + 1 <= options.maxChunkChars) {
            sentenceChunk = sentenceChunk ? `${sentenceChunk} ${sentence}` : sentence;
          } else {
            if (sentenceChunk.length >= options.minChunkChars) {
              chunks.push({
                text: sentenceChunk,
                hash: simpleHash(sentenceChunk),
                index: chunks.length,
              });
            }
            sentenceChunk = sentence;
          }
        }
        currentText = sentenceChunk;
      }
    }
  }

  if (currentText.length > 0) {
    const sentences = currentText.split(/(?<=[.!?])\s+/);
    let sentenceChunk = "";
    for (const sentence of sentences) {
      if (sentenceChunk.length + sentence.length + 1 <= options.maxChunkChars) {
        sentenceChunk = sentenceChunk ? `${sentenceChunk} ${sentence}` : sentence;
      } else {
        if (sentenceChunk.length >= options.minChunkChars) {
          chunks.push({
            text: sentenceChunk,
            hash: simpleHash(sentenceChunk),
            index: chunks.length,
          });
        }
        sentenceChunk = sentence;
      }
    }
    if (sentenceChunk.length > 0) {
      chunks.push({
        text: sentenceChunk,
        hash: simpleHash(sentenceChunk),
        index: chunks.length,
      });
    }
  }

  return chunks;
}

/** Mark chunks as deleted that are no longer present in new chunk set. */
export function computeStaleChunks(
  oldChunkHashes: Set<string>,
  newChunkHashes: Set<string>,
): Set<string> {
  const stale = new Set<string>();
  for (const hash of oldChunkHashes) {
    if (!newChunkHashes.has(hash)) {
      stale.add(hash);
    }
  }
  return stale;
}

/** Check if a chunk embedding should be marked stale. */
export function isEmbeddingStale(
  currentContentHash: string,
  contentHashAtEmbedding: string | null,
): boolean {
  if (!contentHashAtEmbedding) return true;
  return currentContentHash !== contentHashAtEmbedding;
}
