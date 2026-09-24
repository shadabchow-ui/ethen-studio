import { describe, expect, it } from "vitest";
import { approveResearchPlan, baselinePlan, createResearchPlan, isApprovedResearchPlan, updateResearchPlan } from "../plan-service";

describe("research plan approval boundary", () => {
  it("creates a deterministic baseline with truthful unavailable cost", () => {
    const plan = createResearchPlan("actor-a", baselinePlan("Compare sources"));
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    expect(plan.cost).toEqual({ status: "unavailable", amountUsd: null, authority: null });
    expect(plan.keyQuestions).toContain("What is known about Compare sources?");
  });

  it("binds approval to exact id, version, hash, actor, and scope", () => {
    const created = createResearchPlan("actor-b", baselinePlan("Audit policy"));
    if ("error" in created) throw new Error(created.error);
    const approved = approveResearchPlan("actor-b", created.id, created.version, created.hash);
    expect(approved && !("error" in approved)).toBe(true);
    expect(isApprovedResearchPlan("actor-b", created.id, created.version, created.hash)).toBe(true);
    expect(isApprovedResearchPlan("other-actor", created.id, created.version, created.hash)).toBe(false);
  });

  it("creates a new version and invalidates prior approval after editing", () => {
    const created = createResearchPlan("actor-c", baselinePlan("Review evidence"));
    if ("error" in created) throw new Error(created.error);
    const approved = approveResearchPlan("actor-c", created.id, created.version, created.hash);
    if (!approved || "error" in approved) throw new Error("approval failed");
    const updated = updateResearchPlan("actor-c", created.id, { ...baselinePlan("Review evidence"), depth: "deep" });
    if (!updated || "error" in updated) throw new Error("update failed");
    expect(updated.version).toBe(2);
    expect(updated.approval).toBeNull();
    expect(isApprovedResearchPlan("actor-c", created.id, created.version, created.hash)).toBe(false);
  });
});
