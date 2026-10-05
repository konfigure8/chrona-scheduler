import {
  buildRosterDays,
  layoutOpenRow,
  layoutRoster,
} from "../src/rosterLayout";
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
  // The Roster grid header's two lines, and the weekend flag.
  assertEqual(days[0]?.weekday, "Mon");
  assertEqual(days[0]?.date, "17 Aug");
  assertEqual(days[0]?.weekend, false);
  const weekend = buildRosterDays({ end: new Date(2026, 7, 24), start: new Date(2026, 7, 22) });
  assertEqual(weekend.map((day) => day.weekend).join(), "true,true");
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

// A night shift shows once, on the day it starts; an item longer than
// 24 hours shows on every day it covers.
function showsANightShiftOnItsStartDayOnly(): void {
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
  assertEqual(rows[0]?.cells[1]?.length, 0);
  assertEqual(rows[0]?.cells[2]?.length, 0);

  // A two-day job shows on each of the days it covers.
  const job: SchedulerUiEvent = {
    ...overnight,
    end: new Date(2026, 7, 19, 12, 0),
    id: "job",
    title: "Site install",
  };
  const spanning = layoutRoster(resources, [job], days);
  assertEqual(spanning[0]?.cells[0]?.length, 1);
  assertEqual(spanning[0]?.cells[1]?.length, 1);
  assertEqual(spanning[0]?.cells[2]?.length, 1);
}

// The open-shifts row: open shifts by day, whoever they belong to.
function laysOutTheOpenRowByStartDay(): void {
  const days = buildRosterDays(window);
  const open = (id: string, day: number, hour: number): SchedulerUiEvent => ({
    end: new Date(2026, 7, 17 + day, hour + 6, 0),
    id,
    resourceId: "chrona-unassigned",
    start: new Date(2026, 7, 17 + day, hour, 0),
    status: "needsCover",
    title: id,
  });
  const cells = layoutOpenRow([open("late", 0, 16), open("early", 0, 6), open("tue", 1, 9)], days);
  assertEqual(cells[0]?.map((event) => event.id).join(), "early,late");
  assertEqual(cells[1]?.length, 1);
  assertEqual(cells[2]?.length, 0);
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

buildsOneColumnPerDay();
groupsEventsIntoResourceDayCells();
showsANightShiftOnItsStartDayOnly();
laysOutTheOpenRowByStartDay();

console.log("rosterLayout tests passed");
