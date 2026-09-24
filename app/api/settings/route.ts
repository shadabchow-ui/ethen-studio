import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireUserSession } from "@ethen/ai/platform/auth/guards";
import {
  auditSettingsAction,
  readUserSettings,
  writeUserSettings,
} from "@ethen/database/user-settings";

/**
 * Studio V3 Job 1 — scoped settings adapter (mirrors Chat's contract).
 *
 * GET /api/settings — full shared settings doc for the viewer.
 * PATCH /api/settings — partial update with optimistic concurrency.
 * Same shared backend as Chat (same user, same doc); Studio settings reuse
 * the identical persistence and sync. Signed-out viewers get 401 so the
 * client stores locally and labels it honestly.
 */
export async function GET() {
  const authorization = await requireUserSession();
  if (authorization.response) {
    return NextResponse.json({ ok: false, signedIn: false, error: "signed_out" }, { status: 401 });
  }
  const actorId = authorization.actorId as string;
  try {
    const result = await readUserSettings(actorId);
    return NextResponse.json({
      ok: true,
      signedIn: true,
      durable: result.durable,
      version: result.version,
      settings: result.settings,
    });
  } catch {
    return NextResponse.json(
      { ok: true, signedIn: true, durable: false, version: 0, error: "Settings service unavailable." },
      { status: 503 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const authorization = await requireUserSession();
  if (authorization.response) {
    return NextResponse.json({ ok: false, signedIn: false, error: "Sign in to sync settings." }, { status: 401 });
  }
  const actorId = authorization.actorId as string;
  let body: { patch?: unknown; version?: unknown } = {};
  try {
    body = (await request.json()) as { patch?: unknown; version?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.version !== "number") {
    return NextResponse.json({ ok: false, error: "Missing document version." }, { status: 400 });
  }
  try {
    const result = await writeUserSettings(actorId, body.patch ?? {}, body.version);
    const keys = body.patch && typeof body.patch === "object" ? Object.keys(body.patch as object) : [];
    if (keys.includes("privacy") || keys.includes("general")) {
      await auditSettingsAction(actorId, "settings.update", { sections: keys.slice(0, 12) });
    }
    return NextResponse.json({ ok: true, signedIn: true, durable: true, version: result.version, settings: result.settings });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 409) {
      const current = await readUserSettings(actorId);
      return NextResponse.json(
        {
          ok: false,
          error: "Settings changed elsewhere. Latest values returned — try again.",
          version: current.version,
          settings: current.settings,
        },
        { status: 409 },
      );
    }
    if (code === "NO_DB" || code === "NO_TABLE" || code === "SYNTHETIC_ACTOR") {
      const message =
        code === "SYNTHETIC_ACTOR"
          ? "Settings sync needs a real account — values stay in this browser."
          : "Settings database is not ready for this deployment — values stay in this browser.";
      return NextResponse.json({ ok: false, error: message, code }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "Settings could not be saved. Try again." }, { status: 500 });
  }
}
