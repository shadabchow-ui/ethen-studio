export type GoogleProviderMode = "mock" | "live" | "setup-required";

export type GoogleProviderId = "google" | "mock";

export interface GoogleWorkspaceStatus {
  mode: GoogleProviderMode;
  providerId: GoogleProviderId;
  providerLabel: string;
  configured: Record<string, boolean>;
  requiresSetup: boolean;
  isMock: boolean;
  source: "provider" | "mock";
  disclaimer: string;
  note: string;
  missingEnv?: string[];
}

export interface GoogleSearchQuery {
  query: string;
  maxResults?: number;
  pageToken?: string;
}

export interface GoogleResultMeta {
  ok: boolean;
  error?: string;
  code?: string;
  source: GoogleProviderMode;
  generatedAt: string;
}

export interface GoogleResult<T> {
  meta: GoogleResultMeta;
  data?: T;
}

export interface GoogleFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  parents?: string[];
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface GoogleFileList {
  files: GoogleFile[];
  nextPageToken?: string;
  totalResults: number;
}

export interface GoogleEmailAddress {
  name?: string;
  email: string;
}

export interface GoogleEmailHeader {
  name: string;
  value: string;
}

export interface GoogleMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload?: {
    headers: GoogleEmailHeader[];
    mimeType: string;
    body?: { size: number };
  };
  internalDate?: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  organizer?: { email: string; displayName?: string };
  created?: string;
  updated?: string;
}

export interface GoogleDocContent {
  id: string;
  title: string;
  body: string;
  mimeType?: string;
}

export interface GoogleSheetsRange {
  sheetId: number;
  title: string;
  values: string[][];
  range: string;
}

export interface GoogleSheetsMetadata {
  id: string;
  title: string;
  sheets: { sheetId: number; title: string }[];
  createdTime?: string;
  modifiedTime?: string;
}

/**
 * Server-side provider contract used by the native Google Workspace handlers.
 * Implementations may be a deterministic test fixture or a future managed-vault
 * backed Google API adapter; handlers must never depend on a bridge response.
 */
export interface GoogleWorkspaceProvider {
  driveSearch(query: GoogleSearchQuery): Promise<GoogleResult<GoogleFileList>>;
  driveGetFile(fileId: string): Promise<GoogleResult<GoogleFile>>;
  driveReadDoc(fileId: string): Promise<GoogleResult<GoogleDocContent>>;
  gmailSearch(query: GoogleSearchQuery): Promise<GoogleResult<{ messages: GoogleMessage[]; totalResults: number }>>;
  gmailGetMessage(messageId: string): Promise<GoogleResult<GoogleMessage>>;
  gmailDraftReply(messageId: string, body: string): Promise<GoogleResult<{ draftId: string; threadId: string; preview: string }>>;
  sheetsGetMetadata(spreadsheetId: string): Promise<GoogleResult<GoogleSheetsMetadata>>;
  sheetsGetRange(spreadsheetId: string, range?: string): Promise<GoogleResult<GoogleSheetsRange>>;
  sheetsDraftUpdate(spreadsheetId: string, range: string, values: string[][]): Promise<GoogleResult<{ spreadsheetId: string; range: string; values: string[][]; preview: string }>>;
  calendarListEvents(timeMin?: string, timeMax?: string, maxResults?: number): Promise<GoogleResult<{ events: GoogleCalendarEvent[] }>>;
  calendarGetEvent(eventId: string): Promise<GoogleResult<GoogleCalendarEvent>>;
  calendarDraftEvent(draft: Partial<GoogleCalendarEvent>): Promise<GoogleResult<{ draft: GoogleCalendarEvent }>>;
}
