import type { ApprovalProposal } from "@ethen/contracts/approvals/types";

async function getServiceClient() {
  try {
    const mod = await import(`@ethen/database/service`);
    return mod.createServiceClient();
  } catch {
    return null;
  }
}

export async function persistApprovalProposal(
  proposal: ApprovalProposal,
): Promise<boolean> {
  const supabase = await getServiceClient();
  if (!supabase) return false;

  const { error } = await supabase.from("agent_approvals").upsert(
    {
      id: proposal.id,
      tool_id: proposal.toolId,
      provider_id: proposal.providerId,
      risk_level: proposal.riskLevel,
      risk_label: proposal.riskLabel,
      proposed_input: proposal.proposedInput as Record<string, unknown>,
      human_readable_summary: proposal.humanReadableSummary,
      expected_effect: proposal.expectedEffect,
      status: proposal.status,
      payload_hash: proposal.payloadHash,
      session_id: proposal.sessionId,
      user_id: proposal.userId,
      created_at: proposal.createdAt,
      updated_at: proposal.updatedAt,
      expires_at: proposal.expiresAt,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[persist] persistApprovalProposal failed:", error.message);
    return false;
  }
  return true;
}

export async function persistApprovalStatus(
  id: string,
  status: string,
  updatedAt: string,
): Promise<boolean> {
  const supabase = await getServiceClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from("agent_approvals")
    .update({ status, updated_at: updatedAt })
    .eq("id", id);

  if (error) {
    console.error("[persist] persistApprovalStatus failed:", error.message);
    return false;
  }
  return true;
}

export async function loadProposal(id: string): Promise<ApprovalProposal | null> {
  const supabase = await getServiceClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("agent_approvals")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return dbRowToProposal(data);
}

export async function loadProposalsForSession(
  sessionId: string,
): Promise<ApprovalProposal[]> {
  const supabase = await getServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agent_approvals")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map(dbRowToProposal);
}

export async function loadPendingProposalsForSession(
  sessionId: string,
): Promise<ApprovalProposal[]> {
  const supabase = await getServiceClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agent_approvals")
    .select("*")
    .eq("session_id", sessionId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map(dbRowToProposal);
}

function dbRowToProposal(row: Record<string, unknown>): ApprovalProposal {
  return {
    id: row.id as string,
    toolId: row.tool_id as ApprovalProposal["toolId"],
    providerId: (row.provider_id as string) ?? null,
    riskLevel: row.risk_level as ApprovalProposal["riskLevel"],
    riskLabel: row.risk_label as ApprovalProposal["riskLabel"],
    proposedInput: row.proposed_input as Record<string, unknown>,
    humanReadableSummary: row.human_readable_summary as string,
    expectedEffect: row.expected_effect as string,
    status: row.status as ApprovalProposal["status"],
    payloadHash: (row.payload_hash as string) ?? null,
    actionDigest: (row.action_digest as string) ?? (row.payload_hash as string) ?? "",
    category: (row.category as ApprovalProposal["category"]) ?? "external_tool",
    scope: (row.scope as string) ?? (row.session_id as string) ?? null,
    requestedBy: (row.requested_by as string) ?? (row.user_id as string) ?? null,
    decidedBy: (row.decided_by as string) ?? null,
    decidedAt: (row.decided_at as string) ?? null,
    consumedAt: (row.consumed_at as string) ?? null,
    outcome: (row.outcome as ApprovalProposal["outcome"]) ?? null,
    evidenceRefs: Array.isArray(row.evidence_refs) ? (row.evidence_refs as string[]) : [],
    sessionId: (row.session_id as string) ?? null,
    userId: (row.user_id as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    expiresAt: (row.expires_at as string) ?? null,
  };
}
