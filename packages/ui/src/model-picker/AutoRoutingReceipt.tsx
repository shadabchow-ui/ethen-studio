import type { AutoRoutingReceipt as AutoRoutingReceiptValue } from "@ethen/ai/model-picker";

export function AutoRoutingReceipt({ receipt }: { receipt: AutoRoutingReceiptValue }) {
  return (
    <section aria-label="Ethen routing receipt" className="rounded-xl border border-[var(--border-subtle)] p-4">
      <h2 className="text-sm font-semibold">Ethen selection</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        <dt>Model</dt><dd>{receipt.selectedModelId}</dd>
        <dt>Provider</dt><dd>{receipt.selectedProviderId}</dd>
        <dt>Reason</dt><dd>{receipt.reason}</dd>
        <dt>Policy</dt><dd>{receipt.policy}</dd>
      </dl>
    </section>
  );
}
