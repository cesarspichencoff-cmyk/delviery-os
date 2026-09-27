/**
 * Google Calendar -> Context Kernel schedule boundary.
 *
 * This adapter accepts normalized, minimal calendar metadata only.
 * Event title, description, location, attendee emails and attachments are
 * intentionally absent.
 *
 * Domain classification is explicit configuration. It is never inferred from
 * event title/content.
 */
import type { ScheduleEvent } from "../schedule";

export interface GoogleCalendarSafeEvent {
  event_ref: string;
  calendar_code: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  cancelled: boolean;
}

export interface GoogleCalendarSourcePolicy {
  calendar_code: string;
  source_ref: string;
  domain: "WORK" | "PERSONAL";
}

export function googleCalendarToScheduleEvent(
  event: GoogleCalendarSafeEvent,
  policies: readonly GoogleCalendarSourcePolicy[],
): ScheduleEvent {
  const policy = policies.find(
    (candidate) => candidate.calendar_code === event.calendar_code,
  );

  if (!policy) {
    throw new Error("calendar_domain_unconfigured");
  }

  return {
    event_id: event.event_ref,
    source_ref: policy.source_ref,
    domain: policy.domain,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    status: event.cancelled ? "CANCELLED" : "CONFIRMED",
    all_day: event.all_day,
  };
}
