import { describe, expect, it } from "vitest";
import { exaSearchWithReceipt, ExaProviderError } from "../exa-provider";

const form = { query: "test", searchType: "auto" as const, numResults: 1, category: "general" as const, highlights: false, fullText: false, structuredOutputs: false };

describe("Exa transport", () => {
  it("returns a receipt with request ID and never invents usage or cost", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "x-request-id": "req-1" } });
    const call = await exaSearchWithReceipt("secret", form, { fetchImpl: fetchImpl as typeof fetch });
    expect(call.receipt).toMatchObject({ endpoint: "/search", status: 200, requestId: "req-1", usage: null, cost: null });
  });

  it("redacts authentication failures", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ error: "do not expose this" }), { status: 401 });
    await expect(exaSearchWithReceipt("secret", form, { fetchImpl: fetchImpl as typeof fetch })).rejects.toMatchObject({ kind: "authentication", status: 401, message: "Exa authentication failed." } satisfies Partial<ExaProviderError>);
  });
});
