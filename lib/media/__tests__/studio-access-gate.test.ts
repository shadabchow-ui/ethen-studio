import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStudioAccess } from "../../../components/studio/auth/access-state";
import {
  getStudioV5NavSections,
  resolveStudioV5Entry,
} from "../../../components/studio/v5/shell/navigation-model";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

// ── RC4: access resolver table ─────────────────────────────────────────

test("RC4 identity states take precedence over project scope", () => {
  for (const identityStatus of ["loading", "signed_out", "identity_pending", "identity_unavailable"] as const) {
    for (const requiresProject of [true, false]) {
      for (const projectId of ["p1", null]) {
        const resolved = resolveStudioAccess({ identityStatus, requiresProject, projectId });
        assert.equal(resolved.state, identityStatus, `${identityStatus} must win over project scope`);
      }
    }
  }
});

test("RC4 signed-in callers split on project scope", () => {
  assert.equal(
    resolveStudioAccess({ identityStatus: "signed_in", requiresProject: true, projectId: "p1" }).state,
    "ready",
  );
  assert.equal(
    resolveStudioAccess({ identityStatus: "signed_in", requiresProject: true, projectId: null }).state,
    "no_project",
  );
  // Surfaces that create the project themselves (ProjectContext New) never
  // report no_project.
  assert.equal(
    resolveStudioAccess({ identityStatus: "signed_in", requiresProject: false, projectId: null }).state,
    "ready",
  );
  assert.equal(
    resolveStudioAccess({ identityStatus: "signed_in", requiresProject: false, projectId: "p1" }).state,
    "ready",
  );
});

test("RC4 every blocked state names a reason and exactly one action", () => {
  const blocked = [
    { identityStatus: "signed_out", requiresProject: false, projectId: null },
    { identityStatus: "identity_pending", requiresProject: true, projectId: null },
    { identityStatus: "identity_unavailable", requiresProject: true, projectId: "p1" },
    { identityStatus: "signed_in", requiresProject: true, projectId: null },
  ] as const;
  for (const input of blocked) {
    const resolved = resolveStudioAccess(input);
    assert.ok(resolved.title, `${resolved.state} needs a title`);
    assert.ok(resolved.reason, `${resolved.state} needs a reason`);
    assert.ok(resolved.actionId, `${resolved.state} needs an action id`);
    assert.ok(resolved.actionLabel, `${resolved.state} needs an action label`);
  }
  const ready = resolveStudioAccess({ identityStatus: "signed_in", requiresProject: true, projectId: "p1" });
  assert.equal(ready.reason, null);
  assert.equal(ready.actionId, null);
  const loading = resolveStudioAccess({ identityStatus: "loading", requiresProject: true, projectId: null });
  assert.equal(loading.actionId, null, "loading offers no action (transient)");
});

test("RC4 blocked copy is pinned (title / reason / action)", () => {
  assert.deepEqual(resolveStudioAccess({ identityStatus: "signed_out", requiresProject: true, projectId: null }), {
    state: "signed_out",
    title: "Sign in required",
    reason: "Sign in to continue — everything here stays exactly as you left it.",
    actionId: "signin",
    actionLabel: "Sign in",
  });
  assert.deepEqual(resolveStudioAccess({ identityStatus: "identity_pending", requiresProject: true, projectId: null }), {
    state: "identity_pending",
    title: "Finishing account setup",
    reason: "You are signed in, but Studio is still setting up your account.",
    actionId: "finish-setup",
    actionLabel: "Finish setup",
  });
  assert.deepEqual(
    resolveStudioAccess({ identityStatus: "identity_unavailable", requiresProject: false, projectId: null }),
    {
      state: "identity_unavailable",
      title: "Account check failed",
      reason: "Studio could not verify your account just now.",
      actionId: "retry",
      actionLabel: "Retry",
    },
  );
  assert.deepEqual(resolveStudioAccess({ identityStatus: "signed_in", requiresProject: true, projectId: null }), {
    state: "no_project",
    title: "Select a project",
    reason: "This needs a project. Select one or create a new project to continue.",
    actionId: "open-projects",
    actionLabel: "Open projects",
  });
});

// ── RC4: sidebar Edit matches the Edit Image tab ───────────────────────

test("RC4 nav entries with href+hrefFor fall back to the public href", () => {
  const entry = {
    id: "x",
    label: "X",
    href: "/studio/create/edit",
    hrefFor: (projectId: string) => `/studio/projects/${projectId}/edit/image`,
    activePrefixes: [] as readonly string[],
    icon: "edit",
  };
  assert.equal(resolveStudioV5Entry(entry, { projectId: "p1" }).resolvedHref, "/studio/projects/p1/edit/image");
  assert.equal(resolveStudioV5Entry(entry, { projectId: "p1" }).disabledReason, null);
  assert.equal(resolveStudioV5Entry(entry, { projectId: null }).resolvedHref, "/studio/create/edit");
  assert.equal(resolveStudioV5Entry(entry, { projectId: null }).disabledReason, null);
});

test("RC4 hrefFor-only entries keep the historical disabled behavior", () => {
  const entry = {
    id: "x",
    label: "X",
    hrefFor: (projectId: string) => `/studio/projects/${projectId}/x`,
    disabledWithoutProjectReason: "Pick one.",
    activePrefixes: [] as readonly string[],
    icon: "x",
  };
  const resolved = resolveStudioV5Entry(entry, { projectId: null });
  assert.equal(resolved.resolvedHref, null);
  assert.equal(resolved.disabledReason, "Pick one.");
});

test("RC4 sidebar Edit resolves like the Edit Image tab", () => {
  const edit = getStudioV5NavSections()
    .flatMap((section) => section.entries)
    .find((entry) => entry.id === "create-edit");
  assert.ok(edit, "create-edit entry exists");
  assert.equal(resolveStudioV5Entry(edit, { projectId: null }).resolvedHref, "/studio/create/edit");
  assert.equal(resolveStudioV5Entry(edit, { projectId: null }).disabledReason, null);
  assert.equal(
    resolveStudioV5Entry(edit, { projectId: "p1" }).resolvedHref,
    "/studio/projects/p1/edit/image",
  );
});

// ── RC4: wiring tripwires (browser-verified locally) ───────────────────

test("RC4 voice submit routes through the gate instead of disabling", () => {
  const forms = source("components/studio/v5/identity/CloneDesignForms.tsx");
  assert.ok(!forms.includes("disabled={submitting || !projectId}"), "submit must not disable on missing project");
  assert.ok(forms.includes("useStudioAccess"), "submit routes through useStudioAccess");
  assert.ok(forms.includes("StudioAccessGate"), "blocked submits show the inline gate");
  assert.ok(forms.includes("runWhenReady"), "submit runs only when the gate is ready");
});

test("RC4 project creation fires only when the gate is ready", () => {
  const context = source("components/studio/v5/shell/ProjectContext.tsx");
  assert.ok(context.includes("useStudioAccess"), "ProjectContext uses the shared gate");
  assert.ok(!context.includes("authGate.runAuthed"), "creation no longer pre-gates on Clerk alone");
  assert.ok(context.includes("runWhenReady"), "creation fires only when ready");
  assert.ok(context.includes("noticeAction"), "blocked creation shows the reason + action inline");
});

test("RC4 workbench no-project states use the gate action, errors keep Retry", () => {
  const workspace = source("components/studio/v5/workbench/WorkbenchWorkspace.tsx");
  assert.ok(
    !workspace.includes('title="Project setup needed" description={uiState.message} actionLabel="Retry"'),
    "the no-project setup branch must not offer Retry (re-fetch cannot change it)",
  );
  assert.ok(workspace.includes("access?.primaryAction"), "no-project branch renders the gate action");
  // The real fetch-error branch keeps its Retry.
  assert.ok(workspace.includes('retryLabel="Retry" onRetry={onRetry}'), "fetch errors keep Retry");
  // The "No timeline selected" empty branch (timelines exist, the detail has
  // no revision yet) keeps its refetch Retry: unlike the no-project branch,
  // re-fetching can resolve it when data changes.
  const cinema = source("components/studio/v5/workbench/CinemaRouteAdapter.tsx");
  assert.ok(!cinema.includes('actionLabel="Retry" onAction={() => setLoaded(true)}'), "cinema no-project Retry is gone");
  assert.ok(cinema.includes("useStudioAccess"), "cinema no-project renders the gate");
  assert.ok(cinema.includes("reloadToken"), "cinema error Retry re-fetches");
});

test("RC4 changer copy is plain language with a next step", () => {
  const bindings = source("components/studio/v5/create/audio/audio-tool-bindings.ts");
  assert.ok(!bindings.includes("Available only when a qualified capability exists."), "jargon copy is gone");
  assert.ok(bindings.includes("Needs an approved voice model to run"), "plain-language reason present");
  assert.ok(bindings.includes("browse Models"), "next step present");
});
