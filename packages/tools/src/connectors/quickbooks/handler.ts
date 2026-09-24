import { RuntimeError } from "../../connector-runtime";
import type { UserContext } from "../../connector-runtime";
import { notConfiguredResult } from "../handler-helpers";

const PROVIDER_ID = "quickbooks";
const PROVIDER_LABEL = "QuickBooks";

function failClosed(action: string) {
  const nc = notConfiguredResult(PROVIDER_ID, PROVIDER_LABEL);
  return {
    provider: PROVIDER_ID,
    action,
    configured: false,
    reason: nc.reason,
    records: [],
  };
}

export async function searchCustomers(_input: unknown, _context: UserContext) { return failClosed("search_customers"); }
export async function getCustomer(_input: unknown, _context: UserContext) { return failClosed("get_customer"); }
export async function listInvoices(_input: unknown, _context: UserContext) { return failClosed("list_invoices"); }
export async function getInvoice(_input: unknown, _context: UserContext) { return failClosed("get_invoice"); }

export async function draftInvoiceUpdate(input: unknown, _context: UserContext) {
  const inp = (input ?? {}) as Record<string, unknown>;
  return {
    action: "draft_invoice_update",
    provider: PROVIDER_ID,
    draft: true,
    invoiceId: inp.invoiceId ?? null,
    proposedFields: inp.fields ?? {},
    note: "QuickBooks invoice updates require explicit approval and live token storage.",
    requiresApproval: true,
    approvalReason: "Updating QuickBooks invoices requires approval and live token storage.",
  };
}

export async function createInvoice(_input: unknown, _context: UserContext) {
  throw new RuntimeError("token_storage_not_configured", `${PROVIDER_LABEL} create_invoice requires a live token. The token vault is fail-closed.`);
}
