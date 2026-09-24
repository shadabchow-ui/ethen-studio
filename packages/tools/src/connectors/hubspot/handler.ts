import { RuntimeError } from "../../connector-runtime";
import type { UserContext } from "../../connector-runtime";
import { notConfiguredResult } from "../handler-helpers";

const PROVIDER_ID = "hubspot";
const PROVIDER_LABEL = "HubSpot";

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

export async function searchContacts(_input: unknown, _context: UserContext) { return failClosed("search_contacts"); }
export async function getContact(_input: unknown, _context: UserContext) { return failClosed("get_contact"); }
export async function searchCompanies(_input: unknown, _context: UserContext) { return failClosed("search_companies"); }
export async function getCompany(_input: unknown, _context: UserContext) { return failClosed("get_company"); }
export async function searchDeals(_input: unknown, _context: UserContext) { return failClosed("search_deals"); }
export async function getDeal(_input: unknown, _context: UserContext) { return failClosed("get_deal"); }

export async function draftNote(input: unknown, _context: UserContext) {
  const inp = (input ?? {}) as Record<string, unknown>;
  return {
    action: "draft_note",
    provider: PROVIDER_ID,
    draft: true,
    targetId: inp.targetId ?? null,
    targetType: inp.targetType ?? "contact",
    content: typeof inp.content === "string" ? inp.content : "",
    requiresApproval: true,
    approvalReason: "Creating a note on a HubSpot record is a state-changing action and requires approval.",
  };
}

export async function createNote(_input: unknown, _context: UserContext) {
  throw new RuntimeError("token_storage_not_configured", `${PROVIDER_LABEL} create_note requires a live token. The token vault is fail-closed.`);
}

export async function updateRecord(_input: unknown, _context: UserContext) {
  throw new RuntimeError("token_storage_not_configured", `${PROVIDER_LABEL} update_record requires a live token. The token vault is fail-closed.`);
}
