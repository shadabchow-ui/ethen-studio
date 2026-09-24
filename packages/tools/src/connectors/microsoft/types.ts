import "server-only";

/** Microsoft 365 service identifiers used within the connector suite. */
export type MicrosoftServiceId =
  | "outlook"
  | "calendar"
  | "onedrive"
  | "sharepoint"
  | "teams";

/** Microsoft Graph API base URL. */
export const MICROSOFT_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

/** OAuth scopes required for each Microsoft service. */
export const MICROSOFT_SERVICE_SCOPES: Record<MicrosoftServiceId, string[]> = {
  outlook: ["Mail.Read", "Mail.ReadWrite", "Mail.Send"],
  calendar: ["Calendars.Read", "Calendars.ReadWrite"],
  onedrive: ["Files.Read", "Files.ReadWrite"],
  sharepoint: ["Sites.Read.All", "Sites.ReadWrite.All"],
  teams: ["ChannelMessage.Read.All", "ChannelMessage.Send", "Team.ReadBasic.All", "Chat.Read", "Chat.ReadWrite"],
};

/** Combined scope set needed for the full Microsoft 365 connector suite. */
export const MICROSOFT_ALL_SCOPES: string[] = Array.from(
  new Set(Object.values(MICROSOFT_SERVICE_SCOPES).flat())
);

/** Error codes returned by the Microsoft connector layer. */
export type MicrosoftErrorCode =
  | "NOT_CONFIGURED"
  | "MISSING_TOKEN"
  | "INSUFFICIENT_SCOPES"
  | "GRAPH_ERROR"
  | "RATE_LIMITED"
  | "UNSUPPORTED_ACTION"
  | "APPROVAL_REQUIRED"
  | "VALIDATION_ERROR"
  | "PROVIDER_ERROR";

export interface MicrosoftError {
  code: MicrosoftErrorCode;
  message: string;
  status: number;
  details?: Record<string, unknown>;
}

/** Standard envelope for all Microsoft connector results — never exposes raw Graph payloads. */
export interface MicrosoftResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: MicrosoftError;
}

/** Configuration status for a single Microsoft 365 service. */
export type MicrosoftServiceStatus =
  | "not_configured"
  | "missing_scopes"
  | "configured"
  | "error";

export interface MicrosoftServiceHealth {
  serviceId: MicrosoftServiceId;
  label: string;
  status: MicrosoftServiceStatus;
  requiredScopes: string[];
  grantedScopes: string[];
  missingScopes: string[];
  detail: string;
}

// ── Outlook types ──────────────────────────────────────────────────────────

export interface OutlookMessageSummary {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  receivedAt: string;
  hasAttachments: boolean;
  importance: "low" | "normal" | "high";
  isRead: boolean;
  preview: string;
}

export interface OutlookMessageDetail extends OutlookMessageSummary {
  body: string;
  contentType: "text" | "html";
  toRecipients: string[];
  ccRecipients: string[];
  attachments: OutlookAttachmentMeta[];
  conversationId: string;
}

export interface OutlookAttachmentMeta {
  id: string;
  name: string;
  size: number;
  contentType: string;
}

export interface OutlookDraftReply {
  subject: string;
  toRecipients: string[];
  ccRecipients: string[];
  body: string;
  referencesMessageId: string;
}

export interface OutlookSearchParams {
  query?: string;
  folder?: string;
  from?: string;
  maxResults?: number;
}

// ── Calendar types ─────────────────────────────────────────────────────────

export interface CalendarEventSummary {
  id: string;
  subject: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  organizer: string;
  location: string;
  isOnlineMeeting: boolean;
}

export interface CalendarEventDetail extends CalendarEventSummary {
  body: string;
  attendees: CalendarAttendee[];
  recurrence: string | null;
  sensitivity: "normal" | "private" | "confidential";
  showAs: "free" | "tentative" | "busy" | "oof" | "workingElsewhere";
  categories: string[];
}

export interface CalendarAttendee {
  name: string;
  email: string;
  status: "none" | "organizer" | "tentativelyAccepted" | "accepted" | "declined" | "notResponded";
  type: "required" | "optional" | "resource";
}

export interface CalendarEventDraft {
  subject: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  location: string;
  body: string;
  attendees: { name: string; email: string; type: "required" | "optional" }[];
  isOnlineMeeting: boolean;
}

export interface CalendarEventProposal {
  event: CalendarEventDraft;
  conflicts: CalendarEventSummary[];
  suggestion: string;
}

// ── OneDrive / SharePoint types ────────────────────────────────────────────

export interface DriveFileSummary {
  id: string;
  name: string;
  path: string;
  size: number;
  lastModifiedAt: string;
  createdBy: string;
  fileType: string;
  isFolder: boolean;
  webUrl: string;
}

export interface DriveFileDetail extends DriveFileSummary {
  mimeType: string;
  etag: string;
  parentPath: string;
  children?: DriveFileSummary[];
  shareLink: string | null;
}

export interface DriveSearchParams {
  query?: string;
  folder?: string;
  maxResults?: number;
  fileTypes?: string[];
}

export interface DocumentExport {
  id: string;
  name: string;
  format: "text" | "markdown" | "json";
  content: string;
  exportedAt: string;
}

// ── Teams types ────────────────────────────────────────────────────────────

export interface TeamsChannelSummary {
  id: string;
  name: string;
  description: string;
  membershipType: "standard" | "private" | "shared";
}

export interface TeamsMessageSummary {
  id: string;
  channelId: string;
  channelName: string;
  teamId: string;
  teamName: string;
  sender: string;
  senderEmail: string;
  sentAt: string;
  body: string;
  messageType: "message" | "systemEvent";
  hasAttachments: boolean;
  replyCount: number;
}

export interface TeamsMessageDetail extends TeamsMessageSummary {
  mentions: { name: string; email: string }[];
  reactions: { type: string; count: number }[];
  attachments: { name: string; contentType: string; url: string }[];
  replies: TeamsMessageSummary[];
}

export interface TeamsDraftMessage {
  teamId: string;
  channelId: string;
  body: string;
  replyToId?: string;
}
