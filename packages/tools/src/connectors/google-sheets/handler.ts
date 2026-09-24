import "server-only";

import type { GoogleResult, GoogleSheetsMetadata, GoogleSheetsRange, GoogleWorkspaceProvider } from "../google/types";

export async function handleSheetsGetMetadata(
  provider: GoogleWorkspaceProvider,
  spreadsheetId: string,
): Promise<GoogleResult<GoogleSheetsMetadata>> {
  return provider.sheetsGetMetadata(spreadsheetId);
}

export async function handleSheetsGetRange(
  provider: GoogleWorkspaceProvider,
  spreadsheetId: string,
  range?: string,
): Promise<GoogleResult<GoogleSheetsRange>> {
  return provider.sheetsGetRange(spreadsheetId, range);
}

export async function handleSheetsDraftUpdate(
  provider: GoogleWorkspaceProvider,
  spreadsheetId: string,
  range: string,
  values: string[][],
): Promise<GoogleResult<{ spreadsheetId: string; range: string; values: string[][]; preview: string }>> {
  return provider.sheetsDraftUpdate(spreadsheetId, range, values);
}
