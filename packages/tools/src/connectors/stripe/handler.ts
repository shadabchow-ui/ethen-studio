import { RuntimeError } from "../../connector-runtime";
import type { UserContext } from "../../connector-runtime";
import { notConfiguredResult } from "../handler-helpers";

const PROVIDER_ID = "stripe";
const PROVIDER_LABEL = "Stripe";

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
export async function listPayments(_input: unknown, _context: UserContext) { return failClosed("list_payments"); }
export async function getPayment(_input: unknown, _context: UserContext) { return failClosed("get_payment"); }
export async function listInvoices(_input: unknown, _context: UserContext) { return failClosed("list_invoices"); }
export async function getInvoice(_input: unknown, _context: UserContext) { return failClosed("get_invoice"); }

export async function draftCustomerUpdate(input: unknown, _context: UserContext) {
  const inp = (input ?? {}) as Record<string, unknown>;
  return {
    action: "draft_customer_update",
    provider: PROVIDER_ID,
    draft: true,
    customerId: inp.customerId ?? null,
    proposedFields: inp.fields ?? {},
    note: "Stripe does not support direct customer updates through this connector in the current phase. Customer mutations require explicit provider approval and durable token storage.",
    requiresApproval: true,
    approvalReason: "Updating Stripe customer data requires approval and live token storage.",
  };
}
