import { clockMinutesBetween } from "./timeZone";
import type { SchedulerUiEvent } from "./types";

/** Whole hours assigned to a resource within the window (clipped), by the clock. */
export function assignedHours(
  events: readonly SchedulerUiEvent[],
  resourceId: string,
  window: { readonly end: Date; readonly start: Date },
): number {
  let minutes = 0;
  for (const event of events) {
    if (event.resourceId !== resourceId || event.status === "needsCover") {
      continue;
    }
    const start = event.start > window.start ? event.start : window.start;
    const end = event.end < window.end ? event.end : window.end;
    if (end > start) {
      minutes += clockMinutesBetween(start, end);
    }
  }
  return Math.round(minutes / 60);
}

/**
 * The capacity a row's hours are set against. Up to a week the weekly
 * hours stand as they are; past a week they scale to the window's days,
 * so a fortnight or a month of work does not read as overbooked.
 */
export function capacityForWindow(
  weeklyHours: number,
  window: { readonly end: Date; readonly start: Date },
): number {
  const days = Math.round(clockMinutesBetween(window.start, window.end) / (24 * 60));
  return days <= 7 ? weeklyHours : Math.round((weeklyHours * days) / 7);
}
