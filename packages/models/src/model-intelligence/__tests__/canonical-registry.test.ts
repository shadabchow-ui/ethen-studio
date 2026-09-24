import { describe, expect, it } from "vitest";
import { loadCanonicalModelRegistry, projectLegacyProfile } from "../canonical-registry";

describe("canonical Model Intelligence registry", () => {
  it("projects known document facts and preserves unavailable facts as unknown", () => {
    const profile = projectLegacyProfile({
      slug: "example-1", name: "Example 1", provider: "Example AI", release_date: "2026-01-01",
      technical_specs: [
        { key: "context_window", value: "128K tokens" },
        { key: "input_modalities", value: "text and image" },
      ],
      summary_cards: [{ id: "input_price", value: "$2.50", unit: "/ 1M tokens" }],
      source: { canonical_url: "https://example.test/model", source_name: "Example", normalized_at: "2026-01-01T00:00:00.000Z" },
    });
    expect(profile?.identity.providerId).toBe("example-ai");
    expect(profile?.context.maxTokens).toBe(128_000);
    expect(profile?.capabilities.vision).toBe(true);
    expect(profile?.capabilities.functionCalling).toBeNull();
    expect(profile?.pricing).toHaveLength(1);
    expect(profile?.pricing[0]?.status).toBe("unknown");
  });

  it("accounts for aggregate records without fabricating model identities", () => {
    const registry = loadCanonicalModelRegistry();
    expect(registry.records).toHaveLength(548);
    expect(registry.sourceRecordCount).toBe(550);
    expect(registry.issues).toEqual([]);
    expect(registry.intentionalExclusions.map((entry) => entry.slug).sort()).toEqual(["caching", "multilingual"]);
    expect(registry.unresolvedInvalidRecords).toEqual([]);
    expect(registry.records.every((record) => record.integrity.allFieldsKnownOrExplicitUnknown)).toBe(true);
  });
});
