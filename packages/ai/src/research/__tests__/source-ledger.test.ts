import { describe, expect, it } from "vitest";
import { buildSourceLedger, canonicalizeSourceUrl, recordSourceDecision, validateSourceLedger } from "../source-ledger";

const base = { id: "provider-a", title: "A source", url: "https://Example.com:443/article?b=2&utm_source=x&a=1#section", domain: "example.com", retrievedAt: "2026-08-01T12:00:00.000Z", publishedDate: "2026-07-31T00:00:00.000Z", provider: "exa" as const, query: "test" };

describe("source ledger", () => {
  it("canonicalizes only known tracking fields and preserves semantic query values", () => {
    expect(canonicalizeSourceUrl(base.url)).toBe("https://example.com/article?a=1&b=2");
  });
  it("creates deterministic duplicate evidence without mutating raw records", () => {
    const ledger = buildSourceLedger([base, { ...base, id: "provider-b", url: "https://example.com/article?a=1&b=2" }]);
    expect(ledger[0].id).not.toBe(ledger[1].id);
    expect(ledger[1].duplicateOf).toBe(ledger[0].id);
    expect(ledger[0].raw.url).toBe(base.url);
    expect(validateSourceLedger(ledger)).toEqual([]);
  });
  it("records inclusion decisions additively", () => {
    const entry = buildSourceLedger([base])[0];
    const updated = recordSourceDecision(entry, { type: "inclusion_decision", at: "2026-08-01T12:01:00.000Z", actorId: "actor", decision: "excluded", note: "Out of scope" });
    expect(entry.inclusion.decision).toBe("undecided");
    expect(updated.inclusion).toMatchObject({ decision: "excluded" });
    expect(updated.inclusion.events).toHaveLength(1);
  });
});
