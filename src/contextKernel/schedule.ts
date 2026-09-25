/**
 * Calendar / schedule projection for the Context Kernel.
 *
 * Read-only. No calendar mutation is exposed here.
 */

import type { ContextDomain, ContextSignal } from "./modeCompiler";

export type ScheduleEventStatus = "CONFIRMED" | "CANCELLED";

export interface ScheduleEvent {
  event_id: string;
  source_ref: string;
  domain: Exclude<ContextDomain, "SYSTEM">;
  starts_at: string;
  ends_at: string;
  status: ScheduleEventStatus;
  all_day: boolean;
}

export interface ScheduleSnapshot {
  generated_at: string;
  active_event?: ScheduleEvent;
  next_event?: ScheduleEvent;
  active_count: number;
  upcoming_count: number;
}

export function buildScheduleSnapshot(
  events: readonly ScheduleEvent[],
  now: string,
): ScheduleSnapshot {
  assertTimestamp(now, "now");

  const valid = events
    .filter((event) => event.status === "CONFIRMED")
    .map(validateEvent)
    .sort(
      (a, b) =>
        a.starts_at.localeCompare(b.starts_at) ||
        a.event_id.localeCompare(b.event_id),
    );

  const nowMs = Date.parse(now);
  const active = valid.filter(
    (event) =>
      !event.all_day &&
      Date.parse(event.starts_at) <= nowMs &&
      nowMs < Date.parse(event.ends_at),
  );
  const upcoming = valid.filter((event) => Date.parse(event.starts_at) > nowMs);

  return {
    generated_at: now,
    active_event: active[0],
    next_event: upcoming[0],
    active_count: active.length,
    upcoming_count: upcoming.length,
  };
}

export function scheduleToContextSignals(
  snapshot: ScheduleSnapshot,
): ContextSignal[] {
  const signals: ContextSignal[] = [];

  if (snapshot.active_event) {
    signals.push({
      signal_id: `calendar-active:${snapshot.active_event.event_id}`,
      source: snapshot.active_event.source_ref,
      domain: snapshot.active_event.domain,
      kind: "meeting_active",
      observed_at: snapshot.generated_at,
      active: true,
    });
  }

  return signals;
}

function validateEvent(event: ScheduleEvent): ScheduleEvent {
  assertSafe(event.event_id, "event_id");
  assertSafe(event.source_ref, "source_ref");
  assertTimestamp(event.starts_at, "starts_at");
  assertTimestamp(event.ends_at, "ends_at");
  if (Date.parse(event.ends_at) <= Date.parse(event.starts_at)) {
    throw new Error("invalid_schedule_range");
  }
  return { ...event };
}

const SAFE_REF = /^[A-Za-z0-9._:-]{1,160}$/;

function assertSafe(value: string, field: string): void {
  if (!SAFE_REF.test(value)) throw new Error(`unsafe_schedule_${field}`);
}

function assertTimestamp(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`invalid_schedule_${field}`);
  }
}
