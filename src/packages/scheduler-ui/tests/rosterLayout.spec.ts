import { buildRosterDays, layoutRoster } from "../src/rosterLayout";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  TimeWindow,
} from "../src/types";

const window: TimeWindow = {
  end: new Date(2026, 7, 20, 0, 0),
  start: new Date(2026, 7, 17, 0, 0),
};

const resources: readonly SchedulerResource[] = [
  { id: "r-1", name: "Alex Chen" },
  { id: "r-2", name: "Riley Patel" },
];

function buildEvent(
  id: string,
  resourceId: string,
  dayOffset: number,
  startHour: number,
  endHour: number,
): SchedulerUiEvent {
  return {
    end: new Date(2026, 7, 17 + dayOffset, endHour, 0),
    id,
    resourceId,
    start: new Date(2026, 7, 17 + dayOffset, startHour, 0),
    status: "assigned",
    title: id,
  };
}

function buildsOneColumnPerDay(): void {
  const days = buildRosterDays(window);
  assertEqual(days.length, 3);
  assertEqual(days[0]?.label.includes("17"), true);
  assertEqual(days[2]?.label.includes("19"), true);
}

function groupsEventsIntoResourceDayCells(): void {
  const days = buildRosterDays(window);
  const rows = layoutRoster(
    resources,
    [
      buildEvent("a", "r-1", 0, 6, 14),
      buildEvent("b", "r-1", 0, 15, 22),
      buildEvent("c", "r-1", 2, 6, 14),
      buildEvent("d", "r-2", 1, 9, 17),
    ],
    days,
  );

  assertEqual(rows[0]?.cells[0]?.length, 2);
  assertEqual(rows[0]?.cells[0]?.[0]?.id, "a");
  assertEqual(rows[0]?.cells[1]?.length, 0);
  assertEqual(rows[0]?.cells[2]?.[0]?.id, "c");
  assertEqual(rows[1]?.cells[1]?.[0]?.id, "d");
}

function includesOvernightEventsInBothDays(): void {
  const days = buildRosterDays(window);
  const overnight: SchedulerUiEvent = {
    end: new Date(2026, 7, 18, 6, 0),
    id: "overnight",
    resourceId: "r-1",
    start: new Date(2026, 7, 17, 22, 0),
    status: "assigned",
    title: "Night shift",
  };

  const rows = layoutRoster(resources, [overnight], days);
  assertEqual(rows[0]?.cells[0]?.length, 1);
  assertEqual(rows[0]?.cells[1]?.length, 1);
  assertEqual(rows[0]?.cells[2]?.length, 0);
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

buildsOneColumnPerDay();
groupsEventsIntoResourceDayCells();
includesOvernightEventsInBothDays();

console.log("rosterLayout tests passed");
