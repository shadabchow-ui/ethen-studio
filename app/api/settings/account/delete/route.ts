import "server-only";

import { NextResponse } from "next/server";
import { productionDeletionDeps } from "./_lib/deps";
import { handleDelete, handleEligibility } from "./_lib/handler";

/**
 * STUDIO-DEL-01 — in-app account deletion.
 *
 * GET  — eligibility preview (read-only): subscription requirement, what is
 *        deleted, what is retained, and outstanding credits.
 * POST — confirmed deletion (`{ confirm: "DELETE" }`). Requires the caller's
 *        own Clerk session; idempotent; resumes a partially completed run.
 *        Large blobs are deleted asynchronously: 202 until none are pending.
 *
 * All behaviour lives in `_lib/handler.ts` behind a storage port; this file
 * only adapts it to HTTP.
 */
export async function GET() {
  const result = await handleEligibility(productionDeletionDeps());
  return NextResponse.json(result.body, { status: result.status });
}

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const result = await handleDelete(productionDeletionDeps(), body);
  return NextResponse.json(result.body, { status: result.status });
}
