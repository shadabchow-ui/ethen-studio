import "server-only";

import { isVaultConfigured } from "../vault";
import { microsoftGraphGet } from "./graph-client";
import type {
  MicrosoftResult,
  MicrosoftError,
  CalendarEventSummary,
  CalendarEventDetail,
  CalendarEventDraft,
  CalendarEventProposal,
  CalendarAttendee,
} from "./types";

const NOT_CONFIGURED: MicrosoftError = {
  code: "NOT_CONFIGURED",
  message: "Microsoft Calendar connector is not configured. Token vault is unavailable.",
  status: 503,
};

const APPROVAL_REQUIRED: MicrosoftError = {
  code: "APPROVAL_REQUIRED",
  message: "Calendar create/update actions require user approval.",
  status: 403,
};

function notConfigured<T>(): MicrosoftResult<T> {
  return { ok: false, error: NOT_CONFIGURED };
}

/**
 * List calendar events for a date range.
 * Read-only — no approval required.
 */
export async function listCalendarEvents(
  connectionId: string,
  startAt: string,
  endAt: string,
  maxResults = 50
): Promise<MicrosoftResult<CalendarEventSummary[]>> {
  if (!isVaultConfigured()) return notConfigured();

  const result = await microsoftGraphGet<{ value: Record<string, unknown>[] }>(
    connectionId,
    "/me/calendar/calendarView",
    {
      startDateTime: startAt,
      endDateTime: endAt,
      $top: String(maxResults),
      $select: "id,subject,start,end,isAllDay,organizer,location,isOnlineMeeting",
      $orderby: "start/dateTime",
    }
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  const events = (result.data.value || []).map(normalizeCalendarSummary);
  return { ok: true, data: events };
}

/**
 * Get full detail for a single calendar event.
 * Read-only — no approval required.
 */
export async function getCalendarEvent(
  connectionId: string,
  eventId: string
): Promise<MicrosoftResult<CalendarEventDetail>> {
  if (!isVaultConfigured()) return notConfigured();

  const result = await microsoftGraphGet<Record<string, unknown>>(
    connectionId,
    `/me/events/${eventId}`,
    {
      $select: "id,subject,start,end,isAllDay,organizer,location,isOnlineMeeting,body,attendees,recurrence,sensitivity,showAs,categories",
    }
  );

  if (!result.ok || !result.data) {
    return { ok: false, error: result.error! };
  }

  return { ok: true, data: normalizeCalendarDetail(result.data) };
}

/**
 * Build a draft event proposal including potential conflicts.
 * Read-only in practice — the caller must pass the result through approval.
 */
export async function draftCalendarEvent(
  connectionId: string,
  draft: CalendarEventDraft
): Promise<MicrosoftResult<CalendarEventProposal>> {
  if (!isVaultConfigured()) return notConfigured();

  const conflicts = await listCalendarEvents(connectionId, draft.startAt, draft.endAt, 10);

  const conflictList = conflicts.data || [];
  const suggestion = conflictList.length > 0
    ? `Potential conflict: ${conflictList.length} existing event(s) in this time range. Review before confirming.`
    : "No conflicts detected in this time range. Ready to schedule.";

  return {
    ok: true,
    data: {
      event: draft,
      conflicts: conflictList,
      suggestion,
    },
  };
}

/**
 * Create a calendar event — approval-gated.
 * Always fails closed with APPROVAL_REQUIRED until approval layer is fully wired.
 */
export async function createCalendarEvent(
  connectionId: string,
  draft: CalendarEventDraft
): Promise<MicrosoftResult<{ eventId: string }>> {
  void connectionId;
  void draft;
  return { ok: false, error: APPROVAL_REQUIRED };
}

/**
 * Update a calendar event — approval-gated.
 * Always fails closed with APPROVAL_REQUIRED until approval layer is fully wired.
 */
export async function updateCalendarEvent(
  connectionId: string,
  eventId: string,
  draft: Partial<CalendarEventDraft>
): Promise<MicrosoftResult<{ eventId: string }>> {
  void connectionId;
  void eventId;
  void draft;
  return { ok: false, error: APPROVAL_REQUIRED };
}

// ── Normalizers ────────────────────────────────────────────────────────────

function normalizeCalendarSummary(raw: Record<string, unknown>): CalendarEventSummary {
  const organizer = raw.organizer as Record<string, unknown> | undefined;
  return {
    id: String(raw.id || ""),
    subject: String(raw.subject || "(no subject)"),
    startAt: extractDateTime(raw.start),
    endAt: extractDateTime(raw.end),
    isAllDay: Boolean(raw.isAllDay),
    organizer: organizer?.emailAddress
      ? String(((organizer.emailAddress as Record<string, unknown> | null) ?? {}).name ?? "")
      : String(((organizer?.emailAddress as Record<string, unknown> | null) ?? {}).address ?? ""),
    location: String((raw.location as Record<string, unknown> | null)?.displayName ?? ""),
    isOnlineMeeting: Boolean(raw.isOnlineMeeting),
  };
}

function normalizeCalendarDetail(raw: Record<string, unknown>): CalendarEventDetail {
  const summary = normalizeCalendarSummary(raw);
  return {
    ...summary,
    body: String((raw.body as Record<string, unknown> | null)?.content ?? ""),
    attendees: normalizeAttendees(raw.attendees as Array<Record<string, unknown>> | undefined),
    recurrence: raw.recurrence ? JSON.stringify(raw.recurrence) : null,
    sensitivity: String(raw.sensitivity || "normal") as CalendarEventDetail["sensitivity"],
    showAs: String(raw.showAs || "free") as CalendarEventDetail["showAs"],
    categories: Array.isArray(raw.categories) ? raw.categories.map(String) : [],
  };
}

function normalizeAttendees(attendees?: Array<Record<string, unknown>>): CalendarAttendee[] {
  if (!Array.isArray(attendees)) return [];
  return attendees.map((a): CalendarAttendee => {
    const address = a.emailAddress as Record<string, unknown> | undefined;
    return {
      name: String(address?.name || ""),
      email: String(address?.address || ""),
      status: String((a.status as Record<string, unknown> | null)?.response ?? "none") as CalendarAttendee["status"],
      type: String(a.type || "required") as CalendarAttendee["type"],
    };
  });
}

function extractDateTime(field: unknown): string {
  if (!field || typeof field !== "object") return "";
  const f = field as Record<string, unknown>;
  return String(f.dateTime || "");
}
