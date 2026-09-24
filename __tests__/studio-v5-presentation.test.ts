import assert from "node:assert/strict";
import test from "node:test";
import { LAB_APPS, LAB_MENUS, LAB_RECIPES } from "../lib/studio-v5/workflows";
import { STUDIO_V4_LAB_MEDIA_ITEMS } from "../lib/studio-v5/media-manifest";
import { studioAppHref, studioWorkflowHref } from "../lib/studio-v5/live-destinations";

const projectId = "00000000-0000-4000-8000-000000000001";

test("every editorial workflow resolves to a live Studio route", () => {
  const workflows = new Set([
    ...STUDIO_V4_LAB_MEDIA_ITEMS.map((item) => item.workflow),
    ...LAB_MENUS.flatMap((menu) => menu.columns.flatMap((column) => column.tasks.map((task) => task.workflow))),
    ...LAB_RECIPES.map((recipe) => recipe.workflow),
  ]);
  for (const workflow of workflows) {
    const href = studioWorkflowHref(workflow, projectId);
    assert.match(href, /^\/studio(?:\/|$)/);
    assert.doesNotMatch(href, /^\/dev\//);
  }
});

test("project-dependent creation is scoped, and missing scope goes to projects", () => {
  assert.equal(studioWorkflowHref("text-to-image", null), "/studio/projects");
  assert.equal(studioWorkflowHref("text-to-video", projectId), `/studio/projects/${projectId}/create/video`);
  assert.equal(studioWorkflowHref("edit-image", projectId), `/studio/projects/${projectId}/edit/image`);
});

test("every app card resolves to a live Studio destination", () => {
  for (const app of LAB_APPS) {
    const href = studioAppHref(app.id, projectId);
    assert.match(href, /^\/studio\//);
    assert.doesNotMatch(href, /\/dev\//);
  }
});
