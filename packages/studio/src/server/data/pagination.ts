/** Studio V5 data — opaque cursor pagination (STUDIO_02, server-only). */
import "server-only";
import { dataError } from "./types";
import type { Page } from "./types";

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;

export function clampLimit(limit: number | undefined | null): number {
  if (limit === undefined || limit === null || Number.isNaN(limit)) return DEFAULT_PAGE_LIMIT;
  return Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.floor(limit)));
}

interface CursorPayload {
  v: 1;
  offset: number;
}

export function encodeCursor(offset: number): string {
  const payload: CursorPayload = { v: 1, offset };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): number {
  if (cursor === null || cursor === undefined || cursor === "") return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (parsed?.v !== 1 || typeof parsed.offset !== "number" || parsed.offset < 0 || !Number.isInteger(parsed.offset)) {
      throw new Error("bad cursor shape");
    }
    return parsed.offset;
  } catch {
    throw dataError("BAD_REQUEST", "Invalid pagination cursor.", { cursor });
  }
}

/** Slice a pre-sorted array into an opaque-cursor page. */
export function paginate<T>(sorted: readonly T[], limit: number, cursor: string | null | undefined): Page<T> {
  const safeLimit = clampLimit(limit);
  const offset = decodeCursor(cursor);
  const items = sorted.slice(offset, offset + safeLimit);
  const next = offset + items.length;
  return { items, nextCursor: next < sorted.length ? encodeCursor(next) : null };
}
