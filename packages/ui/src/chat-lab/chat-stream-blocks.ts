/**
 * CHAT_A2_2 — incremental stream-text parser.
 *
 * Turns cumulative streamed text into renderer-ready blocks WITHOUT
 * rebuilding the whole response per chunk. Parsing is deterministic and
 * append-oriented, so React keys (`b-<index>`) for the completed prefix are
 * identical on every chunk: completed blocks keep their content and their
 * key, only the unfinished tail grows. No remount, no per-token animation.
 *
 * Supported incrementally: paragraphs, headings, bullet/ordered lists,
 * quotes, fenced code (an unclosed fence still yields a stable code
 * container that incoming code appends to). Pipe tables: a complete
 * header + separator + complete rows establish a table block and complete
 * rows append; a trailing incomplete row is held as plain tail text.
 * LIMITATION (documented, per job scope): the held-back row shows raw pipe
 * syntax until its closing `|` arrives — no large table parser was added.
 *
 * Re-exports the production parser from lib/chat/stream-blocks.
 */

export * from "@ethen/ai/chat/stream-blocks";
