import "server-only";

import type { GoogleCalendarEvent, GoogleResult, GoogleWorkspaceProvider } from "../google/types";

export async function handleCalendarListEvents(
  provider: GoogleWorkspaceProvider,
  timeMin?: string,
  timeMax?: string,
  maxResults?: number,
): Promise<GoogleResult<{ events: GoogleCalendarEvent[] }>> {
  return provider.calendarListEvents(timeMin, timeMax, maxResults);
}

export async function handleCalendarGetEvent(
  provider: GoogleWorkspaceProvider,
  eventId: string,
): Promise<GoogleResult<GoogleCalendarEvent>> {
  return provider.calendarGetEvent(eventId);
}

export async function handleCalendarDraftEvent(
  provider: GoogleWorkspaceProvider,
  draft: Partial<GoogleCalendarEvent>,
): Promise<GoogleResult<{ draft: GoogleCalendarEvent }>> {
  return provider.calendarDraftEvent(draft);
}
