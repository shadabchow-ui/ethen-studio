import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toSessionInfo } from "../../../app/api/settings/_lib/session-shape";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (entry === "node_modules" || entry === ".next") continue;
    try {
      if (entry.includes(".")) {
        if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
      } else {
        walk(rel, out);
      }
    } catch {
      // Unreadable entries are skipped; routes are asserted explicitly below.
    }
  }
  return out;
}

// ── RC2: settings API contract table ───────────────────────────────────

interface ContractEntry {
  route: string;
  methods: readonly string[];
}

const CONTRACT: Record<string, ContractEntry> = {
  "/api/settings": { route: "app/api/settings/route.ts", methods: ["GET", "PATCH"] },
  "/api/settings/account": { route: "app/api/settings/account/route.ts", methods: ["GET"] },
  "/api/settings/sessions": { route: "app/api/settings/sessions/route.ts", methods: ["GET"] },
  "/api/settings/sessions/current": { route: "app/api/settings/sessions/current/route.ts", methods: ["DELETE"] },
  "/api/settings/sessions/[id]": { route: "app/api/settings/sessions/[id]/route.ts", methods: ["DELETE"] },
  "/api/settings/account/logout-all": { route: "app/api/settings/account/logout-all/route.ts", methods: ["POST"] },
  "/api/settings/account/delete": { route: "app/api/settings/account/delete/route.ts", methods: ["GET", "POST"] },
  "/api/settings/skills": { route: "app/api/settings/skills/route.ts", methods: ["GET", "PATCH"] },
  "/api/settings/connectors": { route: "app/api/settings/connectors/route.ts", methods: ["GET", "POST"] },
  "/api/settings/connectors/[id]": { route: "app/api/settings/connectors/[id]/route.ts", methods: ["DELETE"] },
  "/api/settings/billing/portal": { route: "app/api/settings/billing/portal/route.ts", methods: ["POST"] },
  "/api/settings/privacy/export": { route: "app/api/settings/privacy/export/route.ts", methods: ["POST"] },
  "/api/settings/billing": { route: "app/api/settings/billing/route.ts", methods: ["GET"] },
  "/api/settings/usage": { route: "app/api/settings/usage/route.ts", methods: ["GET"] },
};

const LITERAL = /["'`](\/api\/settings(?:\/[A-Za-z0-9_.$-]+|\/\$\{[^}]*\})*)["'`]/g;

function normalizeLiteral(literal: string): string {
  return literal.replace(/\$\{[^}]*\}/g, "[id]");
}

test("RC2 every settings URL literal resolves to a contracted route", () => {
  const callers = [
    ...walk("packages/ui/src/settings"),
    ...walk("components").filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx")),
    ...walk("app").filter((f) => !f.startsWith("app/api/")),
  ];
  const found = new Map<string, string[]>();
  for (const file of callers) {
    const text = source(file);
    for (const match of text.matchAll(LITERAL)) {
      const normalized = normalizeLiteral(match[1]);
      const list = found.get(normalized) ?? [];
      list.push(file);
      found.set(normalized, list);
    }
  }
  const unaccounted = [...found.keys()].filter((literal) => !(literal in CONTRACT));
  assert.deepEqual(
    unaccounted,
    [],
    `settings URL literals without a contracted route: ${unaccounted
      .map((u) => `${u} (in ${found.get(u)?.join(", ")})`)
      .join("; ")} — add the route or an explicit Studio exclusion`,
  );
  // The table must stay complete: every entry is exercised by at least one caller.
  for (const literal of Object.keys(CONTRACT)) {
    assert.ok(found.has(literal), `contract entry ${literal} has no caller — drop it or wire it`);
  }
});

test("RC2 contracted routes exist, export the used methods, and return JSON", () => {
  const lib = source("app/api/settings/_lib/clerk-sessions.ts");
  assert.ok(lib.includes("NextResponse.json"), "the shared settings helper answers JSON");
  for (const [literal, entry] of Object.entries(CONTRACT)) {
    const path = join(ROOT, entry.route);
    assert.ok(existsSync(path), `${literal} → ${entry.route} must exist (never an HTML 404)`);
    const text = readFileSync(path, "utf8");
    for (const method of entry.methods) {
      assert.ok(
        new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(text),
        `${entry.route} must export ${method} for ${literal}`,
      );
    }
    assert.ok(
      text.includes("NextResponse.json") || text.includes("notAvailableInStudioResponse"),
      `${entry.route} must answer JSON for ${literal}`,
    );
  }
});

test("RC2 unsupported capabilities answer honest 501 JSON", () => {
  const lib = source("app/api/settings/_lib/clerk-sessions.ts");
  assert.ok(lib.includes("NOT_AVAILABLE_IN_STUDIO"), "shared 501 code present");
  assert.ok(lib.includes("{ status: 501 }"), "unsupported capabilities use status 501");
  for (const route of [
    "app/api/settings/skills/route.ts",
    "app/api/settings/connectors/route.ts",
    "app/api/settings/connectors/[id]/route.ts",
    "app/api/settings/billing/portal/route.ts",
    "app/api/settings/privacy/export/route.ts",
    "app/api/settings/account/delete/route.ts",
  ]) {
    assert.ok(source(route).includes("notAvailableInStudioResponse"), `${route} answers the honest 501`);
  }
});

// ── RC2: session shape mapping ─────────────────────────────────────────

test("RC2 Clerk sessions map to the Studio session shape", () => {
  const info = toSessionInfo(
    { id: "sess_1", status: "active", createdAt: 1728000000000, updatedAt: 1728000060000, lastActiveAt: 1728000120000 },
    "sess_1",
  );
  assert.deepEqual(info, {
    id: "sess_1",
    status: "active",
    current: true,
    createdAt: "2024-10-04T00:00:00.000Z",
    updatedAt: "2024-10-04T00:01:00.000Z",
    lastActiveAt: "2024-10-04T00:02:00.000Z",
  });
  assert.equal(
    toSessionInfo(
      { id: "sess_2", status: "active", createdAt: 1728000000000, updatedAt: 1728000000000, lastActiveAt: 1728000000000 },
      "sess_1",
    ).current,
    false,
  );
  // Non-finite timestamps degrade to null, never throw or print garbage.
  assert.deepEqual(
    toSessionInfo(
      { id: "sess_3", status: "revoked", createdAt: Number.NaN, updatedAt: Number.POSITIVE_INFINITY, lastActiveAt: -1 },
      null,
    ),
    { id: "sess_3", status: "revoked", current: false, createdAt: null, updatedAt: null, lastActiveAt: "1969-12-31T23:59:59.999Z" },
  );
});

// ── RC2: sign-out + delete-flow tripwires (browser-verified locally) ────

test("RC2 sign-out ends the Clerk session and lands on public /studio", () => {
  const helper = source("components/studio/auth/use-studio-sign-out.ts");
  assert.ok(helper.includes('"/api/settings/sessions/current", { method: "DELETE" }'), "server revoke first");
  assert.ok(helper.includes("clerk?.signOut()"), "Clerk signOut is called (the missing P0-exit call)");
  assert.ok(helper.includes('window.location.assign("/studio")'), "lands on public /studio");
  const chrome = source("components/studio/StudioWorkbenchChrome.tsx");
  assert.ok(chrome.includes("useStudioSignOut"), "rail sign-out uses the shared helper");
  assert.ok(!chrome.includes('window.location.assign("/sign-in")'), "no more /sign-in landing to bounce from");
  const shared = source("packages/ui/src/settings/settings-shared-sections.tsx");
  assert.ok(shared.includes("if (onSignOut)"), "Log-out-this-device uses the Studio sign-out when supplied");
});

test("RC2 delete-account checks eligibility with GET only", () => {
  const shared = source("packages/ui/src/settings/settings-shared-sections.tsx");
  assert.ok(
    shared.includes('fetch("/api/settings/account/delete", { cache: "no-store" })'),
    "eligibility is a GET",
  );
  assert.ok(
    !shared.includes('postJson<DeleteEligibility>("/api/settings/account/delete", {})'),
    "no unconfirmed POST before the eligibility GET",
  );
  assert.ok(shared.includes('"unavailable"'), "delete row renders the not-available state");
  // The confirmed deletion POST survives (explicit two-step confirmation).
  assert.ok(
    shared.includes('postJson("/api/settings/account/delete", { confirm: "DELETE" })'),
    "explicit-confirmation POST is preserved",
  );
});

test("RC2 capability-absent sections render explicit not-available states", () => {
  const product = source("packages/ui/src/settings/settings-product-sections.tsx");
  assert.ok(product.includes('skills.code === "NOT_AVAILABLE_IN_STUDIO"'), "skills renders the not-available state");
  assert.ok(
    product.includes('connectors.code === "NOT_AVAILABLE_IN_STUDIO"'),
    "connectors renders the not-available state",
  );
  const shared = source("packages/ui/src/settings/settings-shared-sections.tsx");
  assert.ok(shared.includes("exportUnavailable"), "privacy export renders the not-available state");
});
