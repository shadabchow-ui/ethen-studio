import { RuntimeError } from "../../connector-runtime";
import type { UserContext } from "../../connector-runtime";
import { notConfiguredResult } from "../handler-helpers";

const PROVIDER_ID = "shopify";
const PROVIDER_LABEL = "Shopify";

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

export async function searchOrders(_input: unknown, _context: UserContext) { return failClosed("search_orders"); }
export async function getOrder(_input: unknown, _context: UserContext) { return failClosed("get_order"); }
export async function searchCustomers(_input: unknown, _context: UserContext) { return failClosed("search_customers"); }
export async function getCustomer(_input: unknown, _context: UserContext) { return failClosed("get_customer"); }
export async function searchProducts(_input: unknown, _context: UserContext) { return failClosed("search_products"); }
export async function getProduct(_input: unknown, _context: UserContext) { return failClosed("get_product"); }

export async function draftOrderUpdate(input: unknown, _context: UserContext) {
  const inp = (input ?? {}) as Record<string, unknown>;
  return {
    action: "draft_order_update",
    provider: PROVIDER_ID,
    draft: true,
    orderId: inp.orderId ?? null,
    proposedFields: inp.fields ?? {},
    note: "Shopify order updates require explicit approval and live token storage.",
    requiresApproval: true,
    approvalReason: "Updating Shopify orders requires approval and live token storage.",
  };
}
