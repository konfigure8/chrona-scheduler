import { assignedHours } from "../src/hours";
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

sumsAssignedHoursClippedToWindow();

console.log("hours tests passed");
