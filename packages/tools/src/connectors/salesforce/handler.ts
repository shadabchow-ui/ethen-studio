import { RuntimeError } from "../../connector-runtime";
import type { UserContext } from "../../connector-runtime";
import { notConfiguredResult, minimiseEmail, minimisePhone } from "../handler-helpers";
import type {
  NormalizedAccount,
  NormalizedContact,
  NormalizedDeal,
} from "../business-ops-types";

const PROVIDER_ID = "salesforce";
const PROVIDER_LABEL = "Salesforce";

// ── Not-configured response builder ───────────────────────────────────────

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

// ── Read handlers (all fail-closed stubs) ─────────────────────────────────

export async function searchAccounts(
  _input: unknown,
  _context: UserContext,
): Promise<unknown> {
  return failClosed("search_accounts");
}

export async function getAccount(
  _input: unknown,
  _context: UserContext,
): Promise<unknown> {
  return failClosed("get_account");
}

export async function searchContacts(
  _input: unknown,
  _context: UserContext,
): Promise<unknown> {
  return failClosed("search_contacts");
}

export async function getContact(
  _input: unknown,
  _context: UserContext,
): Promise<unknown> {
  return failClosed("get_contact");
}

export async function searchOpportunities(
  _input: unknown,
  _context: UserContext,
): Promise<unknown> {
  return failClosed("search_opportunities");
}

export async function getOpportunity(
  _input: unknown,
  _context: UserContext,
): Promise<unknown> {
  return failClosed("get_opportunity");
}

// ── Draft helpers (read-only, always safe) ─────────────────────────────────

export async function draftNote(
  input: unknown,
  _context: UserContext,
): Promise<unknown> {
  const inp = (input ?? {}) as Record<string, unknown>;
  return {
    action: "draft_note",
    provider: PROVIDER_ID,
    draft: true,
    targetId: inp.targetId ?? null,
    targetType: inp.targetType ?? "account",
    content: typeof inp.content === "string" ? inp.content : "",
    requiresApproval: true,
    approvalReason: "Creating a note on a Salesforce record is a state-changing action and requires approval.",
  };
}

// ── Write handlers (approval-gated — dispatcher blocks these) ───────────────

export async function createNote(
  _input: unknown,
  _context: UserContext,
): Promise<unknown> {
  throw new RuntimeError(
    "token_storage_not_configured",
    `${PROVIDER_LABEL} create_note requires a live token. The token vault is fail-closed.`,
  );
}

export async function updateRecord(
  _input: unknown,
  _context: UserContext,
): Promise<unknown> {
  throw new RuntimeError(
    "token_storage_not_configured",
    `${PROVIDER_LABEL} update_record requires a live token. The token vault is fail-closed.`,
  );
}
