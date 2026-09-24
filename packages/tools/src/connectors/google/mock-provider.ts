import type {
  GoogleCalendarEvent,
  GoogleDocContent,
  GoogleFile,
  GoogleFileList,
  GoogleMessage,
  GoogleResult,
  GoogleSheetsMetadata,
  GoogleSheetsRange,
  GoogleSearchQuery,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function mockMeta(source: "mock" | "setup-required" = "mock"): GoogleResult<unknown>["meta"] {
  return { ok: true, source, generatedAt: nowIso() };
}

function errorMeta(code: string, message: string): GoogleResult<never>["meta"] {
  return { ok: false, error: message, code, source: "setup-required", generatedAt: nowIso() };
}

const MOCK_FILES: GoogleFile[] = [
  {
    id: "drive-file-001",
    name: "Quarterly Report Q2.pdf",
    mimeType: "application/pdf",
    sizeBytes: 245000,
    createdTime: "2026-05-01T10:00:00Z",
    modifiedTime: "2026-05-15T14:30:00Z",
    webViewLink: "https://drive.google.com/file/d/drive-file-001/view",
  },
  {
    id: "drive-file-002",
    name: "Team Meeting Notes",
    mimeType: "application/vnd.google-apps.document",
    sizeBytes: undefined,
    createdTime: "2026-04-20T08:00:00Z",
    modifiedTime: "2026-06-01T09:00:00Z",
    webViewLink: "https://docs.google.com/document/d/drive-file-002/edit",
  },
  {
    id: "drive-file-003",
    name: "Budget 2026",
    mimeType: "application/vnd.google-apps.spreadsheet",
    sizeBytes: undefined,
    createdTime: "2026-01-15T12:00:00Z",
    modifiedTime: "2026-05-30T16:00:00Z",
    webViewLink: "https://docs.google.com/spreadsheets/d/drive-file-003/edit",
  },
  {
    id: "drive-file-004",
    name: "Product Launch Slides",
    mimeType: "application/vnd.google-apps.presentation",
    sizeBytes: undefined,
    createdTime: "2026-03-10T09:00:00Z",
    modifiedTime: "2026-04-25T11:00:00Z",
    webViewLink: "https://docs.google.com/presentation/d/drive-file-004/edit",
  },
];

const MOCK_MESSAGES: GoogleMessage[] = [
  {
    id: "msg-001",
    threadId: "thread-001",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "Just checking in on the Q3 planning session. Are we still on for Thursday?...",
    from: "alice@example.com",
    to: "user@example.com",
    subject: "Q3 Planning Session",
    date: "2026-06-10T10:30:00Z",
    internalDate: "1718010600000",
  },
  {
    id: "msg-002",
    threadId: "thread-002",
    labelIds: ["INBOX"],
    snippet: "Please find attached the updated contract for review. Let me know if any changes...",
    from: "bob@client.com",
    to: "user@example.com",
    subject: "Contract Update - For Review",
    date: "2026-06-09T15:00:00Z",
    internalDate: "1717940400000",
  },
  {
    id: "msg-003",
    threadId: "thread-003",
    labelIds: ["SENT"],
    snippet: "Thanks for the update. I'll review the proposal and get back to you by EOD...",
    from: "user@example.com",
    to: "carol@partner.com",
    subject: "Re: Proposal Feedback",
    date: "2026-06-08T09:00:00Z",
    internalDate: "1717832400000",
  },
];

const MOCK_EVENTS: GoogleCalendarEvent[] = [
  {
    id: "event-001",
    summary: "Team Standup",
    description: "Daily standup meeting for the engineering team.",
    location: "Conference Room A",
    start: { dateTime: "2026-06-20T09:00:00-07:00", timeZone: "America/Los_Angeles" },
    end: { dateTime: "2026-06-20T09:30:00-07:00", timeZone: "America/Los_Angeles" },
    attendees: [
      { email: "alice@example.com", displayName: "Alice" },
      { email: "bob@example.com", displayName: "Bob" },
    ],
    organizer: { email: "pm@example.com", displayName: "Project Manager" },
    created: "2026-06-01T10:00:00Z",
    updated: "2026-06-10T08:00:00Z",
  },
  {
    id: "event-002",
    summary: "Product Review",
    description: "Quarterly product review with stakeholders.",
    start: { dateTime: "2026-06-22T14:00:00-07:00", timeZone: "America/Los_Angeles" },
    end: { dateTime: "2026-06-22T15:30:00-07:00", timeZone: "America/Los_Angeles" },
    organizer: { email: "ceo@example.com", displayName: "CEO" },
    created: "2026-05-20T12:00:00Z",
    updated: "2026-06-05T16:00:00Z",
  },
  {
    id: "event-003",
    summary: "Company Offsite",
    description: "Annual company offsite and team building.",
    location: "Mountain View Resort",
    start: { date: "2026-08-15" },
    end: { date: "2026-08-17" },
    attendees: [
      { email: "alice@example.com", responseStatus: "accepted" },
      { email: "bob@example.com", responseStatus: "needsAction" },
    ],
    organizer: { email: "hr@example.com", displayName: "HR" },
    created: "2026-04-01T00:00:00Z",
    updated: "2026-05-01T00:00:00Z",
  },
];

const MOCK_DOCS: GoogleDocContent[] = [
  {
    id: "drive-file-002",
    title: "Team Meeting Notes",
    body: "# Team Meeting Notes\n\n## June 1, 2026\n\n### Attendees\n- Alice\n- Bob\n- Carol\n\n### Agenda\n1. Sprint review\n2. Q2 planning\n3. Resource allocation\n\n### Notes\n- Sprint 23 completed on schedule\n- Q2 goals aligned with product roadmap\n- Need additional frontend resources for the dashboard project",
    mimeType: "application/vnd.google-apps.document",
  },
];

const MOCK_SHEETS_META: GoogleSheetsMetadata = {
  id: "drive-file-003",
  title: "Budget 2026",
  sheets: [
    { sheetId: 1, title: "Q1" },
    { sheetId: 2, title: "Q2" },
    { sheetId: 3, title: "Summary" },
  ],
  createdTime: "2026-01-15T12:00:00Z",
  modifiedTime: "2026-05-30T16:00:00Z",
};

const MOCK_SHEETS_RANGE: GoogleSheetsRange = {
  sheetId: 1,
  title: "Q1",
  values: [
    ["Category", "Budget", "Actual", "Variance"],
    ["Engineering", "$500,000", "$480,000", "-$20,000"],
    ["Marketing", "$200,000", "$215,000", "+$15,000"],
    ["Sales", "$300,000", "$290,000", "-$10,000"],
    ["Operations", "$150,000", "$145,000", "-$5,000"],
  ],
  range: "Q1!A1:D5",
};

export class MockGoogleProvider {
  async driveSearch(query: GoogleSearchQuery): Promise<GoogleResult<GoogleFileList>> {
    const q = query.query.toLowerCase();
    const filtered = MOCK_FILES.filter(
      (f) => f.name.toLowerCase().includes(q) || f.mimeType.toLowerCase().includes(q),
    );
    return {
      meta: mockMeta(),
      data: {
        files: filtered.length > 0 ? filtered : MOCK_FILES,
        totalResults: filtered.length > 0 ? filtered.length : MOCK_FILES.length,
      },
    };
  }

  async driveGetFile(fileId: string): Promise<GoogleResult<GoogleFile>> {
    const file = MOCK_FILES.find((f) => f.id === fileId);
    if (!file) {
      return { meta: errorMeta("NOT_FOUND", `File ${fileId} not found.`) };
    }
    return { meta: mockMeta(), data: file };
  }

  async driveReadDoc(fileId: string): Promise<GoogleResult<GoogleDocContent>> {
    const doc = MOCK_DOCS.find((d) => d.id === fileId);
    if (!doc) {
      return { meta: errorMeta("NOT_FOUND", `Document ${fileId} not found.`) };
    }
    return { meta: mockMeta(), data: doc };
  }

  async gmailSearch(query: GoogleSearchQuery): Promise<GoogleResult<{ messages: GoogleMessage[]; totalResults: number }>> {
    const q = query.query.toLowerCase();
    const filtered = MOCK_MESSAGES.filter(
      (m) =>
        (m.subject?.toLowerCase().includes(q)) ||
        (m.from?.toLowerCase().includes(q)) ||
        (m.snippet?.toLowerCase().includes(q)),
    );
    const results = filtered.length > 0 ? filtered : MOCK_MESSAGES;
    return {
      meta: mockMeta(),
      data: { messages: results.slice(0, query.maxResults ?? 10), totalResults: results.length },
    };
  }

  async gmailGetMessage(messageId: string): Promise<GoogleResult<GoogleMessage>> {
    const msg = MOCK_MESSAGES.find((m) => m.id === messageId);
    if (!msg) {
      return { meta: errorMeta("NOT_FOUND", `Message ${messageId} not found.`) };
    }
    return { meta: mockMeta(), data: msg };
  }

  async gmailDraftReply(
    messageId: string,
    body: string,
  ): Promise<GoogleResult<{ draftId: string; threadId: string; preview: string }>> {
    const msg = MOCK_MESSAGES.find((m) => m.id === messageId);
    if (!msg) {
      return { meta: errorMeta("NOT_FOUND", `Message ${messageId} not found.`) };
    }
    return {
      meta: mockMeta(),
      data: {
        draftId: `draft-${Date.now()}`,
        threadId: msg.threadId,
        preview: `Re: ${msg.subject ?? ""}\n\n${body}`,
      },
    };
  }

  async calendarListEvents(
    timeMin?: string,
    timeMax?: string,
    maxResults?: number,
  ): Promise<GoogleResult<{ events: GoogleCalendarEvent[] }>> {
    return {
      meta: mockMeta(),
      data: { events: MOCK_EVENTS.slice(0, maxResults ?? 10) },
    };
  }

  async calendarGetEvent(eventId: string): Promise<GoogleResult<GoogleCalendarEvent>> {
    const event = MOCK_EVENTS.find((e) => e.id === eventId);
    if (!event) {
      return { meta: errorMeta("NOT_FOUND", `Event ${eventId} not found.`) };
    }
    return { meta: mockMeta(), data: event };
  }

  async calendarDraftEvent(
    draft: Partial<GoogleCalendarEvent>,
  ): Promise<GoogleResult<{ draft: GoogleCalendarEvent }>> {
    const event: GoogleCalendarEvent = {
      id: `event-draft-${Date.now()}`,
      summary: draft.summary ?? "Draft Event",
      description: draft.description,
      start: draft.start ?? { dateTime: nowIso() },
      end: draft.end ?? { dateTime: nowIso() },
      attendees: draft.attendees,
      organizer: draft.organizer,
      created: nowIso(),
      updated: nowIso(),
    };
    return { meta: mockMeta(), data: { draft: event } };
  }

  async sheetsGetMetadata(spreadsheetId: string): Promise<GoogleResult<GoogleSheetsMetadata>> {
    if (spreadsheetId !== MOCK_SHEETS_META.id) {
      return { meta: errorMeta("NOT_FOUND", `Spreadsheet ${spreadsheetId} not found.`) };
    }
    return { meta: mockMeta(), data: MOCK_SHEETS_META };
  }

  async sheetsGetRange(
    _spreadsheetId: string,
    range?: string,
  ): Promise<GoogleResult<GoogleSheetsRange>> {
    return { meta: mockMeta(), data: MOCK_SHEETS_RANGE };
  }

  async sheetsDraftUpdate(
    spreadsheetId: string,
    range: string,
    values: string[][],
  ): Promise<GoogleResult<{ spreadsheetId: string; range: string; values: string[][]; preview: string }>> {
    return {
      meta: mockMeta(),
      data: {
        spreadsheetId,
        range,
        values,
        preview: `Draft update for ${spreadsheetId} range ${range}: ${values.length} rows.`,
      },
    };
  }
}
