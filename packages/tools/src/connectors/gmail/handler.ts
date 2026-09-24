import "server-only";

import type { GoogleMessage, GoogleResult, GoogleSearchQuery, GoogleWorkspaceProvider } from "../google/types";

export async function handleGmailSearch(
  provider: GoogleWorkspaceProvider,
  query: GoogleSearchQuery,
): Promise<GoogleResult<{ messages: GoogleMessage[]; totalResults: number }>> {
  return provider.gmailSearch(query);
}

export async function handleGmailGetMessage(
  provider: GoogleWorkspaceProvider,
  messageId: string,
): Promise<GoogleResult<GoogleMessage>> {
  return provider.gmailGetMessage(messageId);
}

export async function handleGmailDraftReply(
  provider: GoogleWorkspaceProvider,
  messageId: string,
  body: string,
): Promise<GoogleResult<{ draftId: string; threadId: string; preview: string }>> {
  return provider.gmailDraftReply(messageId, body);
}
