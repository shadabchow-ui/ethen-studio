import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { checkIdentityUse, selectLibraryTab, type IdentityLibraryTab } from "@ethen/studio-core/server/identity";
import { isStudioLocalRequest } from "@/lib/studio-local-project";
import { getMemoryIdentityRepository } from "../_lib/memory-identity";
import { resolveProjectScope } from "../_lib/supabase-data";
import {
  IdentityError,
  createIdentityWithVersion1,
  listFavorites,
  listIdentities,
  listRecents,
  resolveConsentSnapshot,
} from "../_lib/supabase-identity";

export const dynamic = "force-dynamic";

const KINDS = ["voice", "character", "product", "brand"] as const;
const TABS: readonly IdentityLibraryTab[] = ["my", "stock", "favorites", "recent"];
const ORIGINS = ["designed", "cloned", "imported"] as const;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * STUDIO_10 — V1 identities adapter. GET lists one library tab
 * (My/Stock/Favorites/Recent) with per-identity consent state; POST
 * creates a project identity with immutable version 1. Stock creation
 * is rejected: stock is curated, never tenant-created.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const params = request.nextUrl.searchParams;
    const projectId = params.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const actorId = authorization.actorId ?? session.actorId;
    if (!actorId) return studioError("UNAUTHORIZED", "actor is required.");
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const kind = params.get("kind");
    if (kind !== null && !(KINDS as readonly string[]).includes(kind)) {
      return studioError("VALIDATION_ERROR", `kind is unknown: ${kind}.`);
    }
    const tabParam = params.get("tab") ?? "my";
    if (!(TABS as readonly string[]).includes(tabParam)) {
      return studioError("VALIDATION_ERROR", `tab is unknown: ${tabParam}.`);
    }
    const tab = tabParam as IdentityLibraryTab;
    const local = await isStudioLocalRequest();
    const memory = local ? getMemoryIdentityRepository() : null;
    const identities = memory
      ? memory.listIdentities(resolved.scope).filter((record) => !kind || record.kind === kind)
      : await listIdentities(resolved, kind ?? undefined);
    const favorites = memory ? memory.listFavorites(resolved.scope, actorId) : await listFavorites(resolved, actorId);
    const recents = memory ? memory.listRecents(resolved.scope, actorId) : await listRecents(resolved, actorId);
    const selected = selectLibraryTab(
      { identities, favorites, recents, aliases: memory ? memory.listAliases() : [] },
      { scope: resolved.scope, actorId, tab, kind: kind ?? undefined, query: params.get("q") ?? undefined },
    );
    const favoriteIds = new Set(favorites.map((row) => row.identityId));
    const rows = [];
    for (const record of selected.identities) {
      const consent = memory ? memory.getConsent(record.identityId) : await resolveConsentSnapshot(record.identityId);
      rows.push({
        identityId: record.identityId,
        kind: record.kind,
        origin: record.origin,
        name: record.name,
        currentVersion: record.currentVersion,
        status: record.status,
        stock: record.scope === null,
        favorite: favoriteIds.has(record.identityId),
        consent: consent ? { status: consent.status, verification: consent.verification } : null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      });
    }
    return studioSuccess({ identities: rows, tab, missingFavoriteIds: selected.missingFavoriteIds });
  } catch (error) {
    if (error instanceof IdentityError) return studioError(error.status, error.message);
    const setup = setupRequiredResponse(error, "Identities need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Identity listing failed.");
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    if (!(authorization.actorId ?? session.actorId)) return studioError("UNAUTHORIZED", "actor is required.");
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const kind = asString(body.kind);
    if (!kind || !(KINDS as readonly string[]).includes(kind)) {
      return studioError("VALIDATION_ERROR", "kind must be voice, character, product, or brand.");
    }
    const origin = asString(body.origin);
    if (!origin || !(ORIGINS as readonly string[]).includes(origin)) {
      return studioError("VALIDATION_ERROR", "origin must be designed, cloned, or imported; stock is curated.");
    }
    const name = asString(body.name);
    if (!name) return studioError("VALIDATION_ERROR", "name is required.");
    const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};
    const consentGrantId = asString(body.consentGrantId);
    const created = await createIdentityWithVersion1({
      resolved,
      kind: kind as (typeof KINDS)[number],
      origin: origin as (typeof ORIGINS)[number],
      name,
      payload,
      consentGrantId,
    });
    const consent = await resolveConsentSnapshot(created.record.identityId);
    const use = checkIdentityUse({ identityId: created.record.identityId, version: created.version, consent, operation: "generate" });
    return studioSuccess(
      {
        identity: {
          identityId: created.record.identityId,
          kind: created.record.kind,
          origin: created.record.origin,
          name: created.record.name,
          currentVersion: created.record.currentVersion,
        },
        use: { allowed: use.allowed, code: use.code, reason: use.reason },
      },
      crypto.randomUUID(),
      201,
    );
  } catch (error) {
    if (error instanceof IdentityError) return studioError(error.status, error.message);
    const setup = setupRequiredResponse(error, "Identities need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Identity creation failed.");
  }
}
