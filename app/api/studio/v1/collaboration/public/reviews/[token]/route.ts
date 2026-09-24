import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  CollaborationError,
  hashReviewToken,
  resolvePublicLink,
} from "@ethen/studio-core/server/collaboration";
import { linkByTokenHash } from "../../../../_lib/supabase-collaboration";

export const dynamic = "force-dynamic";

/**
 * STUDIO_18 — public review handler. No session: the bearer token is
 * the credential. Unknown, expired, revoked, and out-of-scope tokens
 * all answer identically so tokens cannot be enumerated. Returns only
 * the link scope (asset ids + note); bytes stay behind authed routes.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const { token } = await context.params;
    if (!token) return studioError("NOT_FOUND", "Review link was not found.");
    const found = await linkByTokenHash(hashReviewToken(token));
    if (!found) return studioError("NOT_FOUND", "Review link was not found.");
    const resolution = resolvePublicLink({
      token,
      candidates: [found.link],
      now: new Date().toISOString(),
    });
    if (!resolution.ok) return studioError("NOT_FOUND", "Review link was not found.");
    const link = resolution.link;
    return studioSuccess({
      link: {
        assetIds: link.assetIds,
        note: link.note,
        expiresAt: link.expiresAt,
        createdAt: link.createdAt,
      },
      assets,
      note: link.note,
    });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Collaboration needs the Studio data service.");
    if (setup) return setup;
    if (error instanceof CollaborationError) return studioError("NOT_FOUND", "Review link was not found.");
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Public review failed.");
  }
}
