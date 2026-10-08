import { assignedHours, capacityForWindow } from "../src/hours";
import type { SchedulerUiEvent } from "../src/types";

function buildEvent(
  overrides: Partial<SchedulerUiEvent> & { readonly id: string },
): SchedulerUiEvent {
  return {
    end: new Date(2026, 7, 17, 14, 0),
    resourceId: "r-1",
    start: new Date(2026, 7, 17, 6, 0),
    status: "assigned",
    title: overrides.id,
    ...overrides,
  };
}

function sumsAssignedHoursClippedToWindow(): void {
  const window = {
    end: new Date(2026, 7, 18, 0, 0),
    start: new Date(2026, 7, 17, 0, 0),
  };
  const events = [
    buildEvent({ id: "in" }), // 06:00-14:00 = 8h
    buildEvent({
      end: new Date(2026, 7, 18, 6, 0),
      id: "overnight",
      start: new Date(2026, 7, 17, 22, 0),
    }), // clipped to 2h
    buildEvent({ id: "open", status: "needsCover" }), // excluded
    buildEvent({ id: "other", resourceId: "r-2" }), // other resource
  ];
  assertEqual(assignedHours(events, "r-1", window), 10);
  assertEqual(assignedHours(events, "r-2", window), 8);
  assertEqual(assignedHours(events, "r-3", window), 0);
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

/*
 * A row reads "worked/capacity": up to a week against the weekly hours,
 * past a week against the hours scaled to the window, so a month of
 * work is not shown as several times over a week's capacity.
 */
function scalesCapacityPastAWeek(): void {
  const day = { end: new Date(2026, 10, 3), start: new Date(2026, 10, 2) };
  const week = { end: new Date(2026, 10, 9), start: new Date(2026, 10, 2) };
  const fortnight = { end: new Date(2026, 10, 16), start: new Date(2026, 10, 2) };
  const november = { end: new Date(2026, 11, 1), start: new Date(2026, 10, 1) };
  assertEqual(capacityForWindow(38, day), 38);
  assertEqual(capacityForWindow(38, week), 38);
  assertEqual(capacityForWindow(38, fortnight), 76);
  assertEqual(capacityForWindow(38, november), 163);
  assertEqual(capacityForWindow(0, november), 0);
}

sumsAssignedHoursClippedToWindow();
scalesCapacityPastAWeek();

console.log("hours tests passed");
