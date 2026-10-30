import { formatDayLabel } from "../src/dateNames";
import { buildNonWorkingDecorations } from "../src/decorations";
import { buildMonthMatrix, eventsForDay } from "../src/monthLayout";
import { buildRosterDays } from "../src/rosterLayout";
import type { SchedulerUiEvent } from "../src/types";
import { resolveWindowForScale } from "../src/viewConfig";

/*
 * A day at a daylight-saving change runs 23 or 25 hours. The board's days
 * follow the calendar, so each one starts at local midnight and the
 * headers never repeat or skip a date. Each case runs with the process
 * in that time zone, as a browser there would be.
 */
interface Change {
  /** The day the clocks change: [year, month (0-based), date]. */
  readonly day: readonly [number, number, number];
  /** "fallBack" (25-hour day) or "springForward" (23-hour day). */
  readonly kind: "fallBack" | "springForward";
}

interface Zone {
  readonly changes: readonly Change[];
  /** getTimezoneOffset() on 1 Jul 2026, to prove the zone took effect. */
  readonly julyOffset: number;
  readonly name: string;
}

const zones: readonly Zone[] = [
  {
    changes: [
      { day: [2026, 2, 8], kind: "springForward" },
      { day: [2026, 10, 1], kind: "fallBack" },
    ],
    julyOffset: 240,
    name: "America/New_York",
  },
  {
    changes: [
      { day: [2026, 2, 29], kind: "springForward" },
      { day: [2026, 9, 25], kind: "fallBack" },
    ],
    julyOffset: -120,
    name: "Europe/Berlin",
  },
  {
    changes: [
      { day: [2026, 3, 5], kind: "fallBack" },
      { day: [2026, 9, 4], kind: "springForward" },
    ],
    julyOffset: -600,
    name: "Australia/Sydney",
  },
];

function assertEqual<T>(actual: T, expected: T, context: string): void {
  if (actual !== expected) {
    throw new Error(`${context}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function midnight(year: number, month: number, date: number): Date {
  return new Date(year, month, date);
}

function isMidnight(date: Date): boolean {
  return date.getHours() === 0 && date.getMinutes() === 0;
}

function useZone(zone: Zone): void {
  process.env.TZ = zone.name;
  assertEqual(new Date(2026, 6, 1).getTimezoneOffset(), zone.julyOffset, `${zone.name} offset`);
}

// The Cedar Hill board: Sun 1 Nov to Sat 14 Nov 2026 in New York.
function rosterHeadersReadEachDayOnceInNewYork(): void {
  process.env.TZ = "America/New_York";
  const days = buildRosterDays({ end: midnight(2026, 10, 15), start: midnight(2026, 10, 1) });
  assertEqual(
    days.map((day) => day.label).join(", "),
    "Sun 1 Nov, Mon 2 Nov, Tue 3 Nov, Wed 4 Nov, Thu 5 Nov, Fri 6 Nov, Sat 7 Nov, " +
      "Sun 8 Nov, Mon 9 Nov, Tue 10 Nov, Wed 11 Nov, Thu 12 Nov, Fri 13 Nov, Sat 14 Nov",
    "New York fortnight headers",
  );
}

function rosterDaysFollowTheCalendar(zone: Zone, change: Change): void {
  const [year, month, date] = change.day;
  const context = `${zone.name} ${change.kind} roster`;
  // A fortnight with the change on its fourth day.
  const days = buildRosterDays({ end: midnight(year, month, date + 11), start: midnight(year, month, date - 3) });
  assertEqual(days.length, 14, `${context} day count`);
  days.forEach((day, index) => {
    const expected = midnight(year, month, date - 3 + index);
    assertEqual(day.start.getTime(), expected.getTime(), `${context} start of ${formatDayLabel(expected)}`);
    assertEqual(day.end.getTime(), midnight(year, month, date - 2 + index).getTime(), `${context} end of ${formatDayLabel(expected)}`);
    assertEqual(day.label, formatDayLabel(expected), `${context} label ${index}`);
  });
  const changeDay = days[3];
  const hours = changeDay ? (changeDay.end.getTime() - changeDay.start.getTime()) / 3_600_000 : 0;
  assertEqual(hours, change.kind === "fallBack" ? 25 : 23, `${context} length of the change day`);
}

function nonWorkingTimeStartsAndEndsAtMidnight(zone: Zone, change: Change): void {
  const [year, month, date] = change.day;
  const context = `${zone.name} ${change.kind} non-working time`;
  const decorations = buildNonWorkingDecorations(
    { end: midnight(year, month, date + 11), start: midnight(year, month, date - 3) },
    undefined,
    true,
  );
  // Two weekends in a fortnight, four whole days.
  assertEqual(decorations.length, 4, `${context} count`);
  decorations.forEach((decoration) => {
    assertEqual(isMidnight(decoration.start) && isMidnight(decoration.end), true, `${context} ${decoration.start.toString()}`);
    assertEqual(decoration.end.getDate() !== decoration.start.getDate(), true, `${context} whole day ${decoration.start.toString()}`);
  });
}

function windowsEndAtMidnight(zone: Zone, change: Change): void {
  const [year, month, date] = change.day;
  const anchor = new Date(year, month, date, 12, 0);
  const context = `${zone.name} ${change.kind} window`;
  const day = resolveWindowForScale(anchor, { representation: "timeline", timeScale: "day" });
  assertEqual(day.end.getTime(), midnight(year, month, date + 1).getTime(), `${context} day`);
  const span = resolveWindowForScale(anchor, { daySpanDays: 3, representation: "timeline", timeScale: "daySpan" });
  assertEqual(span.end.getTime(), midnight(year, month, date + 3).getTime(), `${context} day span`);
  const week = resolveWindowForScale(anchor, { representation: "timeline", timeScale: "week", weekStartsOn: 0 });
  assertEqual(isMidnight(week.end), true, `${context} week end ${week.end.toString()}`);
  assertEqual(week.end.getDay(), 0, `${context} week end weekday`);
}

function monthCellsReadEachDayOnce(zone: Zone, change: Change): void {
  const [year, month, date] = change.day;
  const context = `${zone.name} ${change.kind} month`;
  const cells = buildMonthMatrix(new Date(year, month, date)).flat();
  cells.forEach((cell, index) => {
    assertEqual(isMidnight(cell.date), true, `${context} cell ${index} at midnight`);
    const first = cells[0];
    if (first) {
      const expected = new Date(first.date.getFullYear(), first.date.getMonth(), first.date.getDate() + index);
      assertEqual(cell.dayOfMonth, expected.getDate(), `${context} cell ${index}`);
    }
  });
}

function monthCellListsItsOwnDaysShifts(zone: Zone, change: Change): void {
  const [year, month, date] = change.day;
  const context = `${zone.name} ${change.kind} month cell`;
  const shift = (id: string, start: Date): SchedulerUiEvent => ({
    end: new Date(start.getTime() + 3_600_000),
    id,
    resourceId: "r-1",
    start,
    status: "assigned",
    title: id,
  });
  const lateOnTheDay = shift("late", new Date(year, month, date, 23, 30));
  const earlyNextDay = shift("early", new Date(year, month, date + 1, 0, 30));
  const listed = eventsForDay([lateOnTheDay, earlyNextDay], new Date(year, month, date));
  assertEqual(listed.map((event) => event.id).join(), "late", context);
}

rosterHeadersReadEachDayOnceInNewYork();
for (const zone of zones) {
  useZone(zone);
  for (const change of zone.changes) {
    rosterDaysFollowTheCalendar(zone, change);
    nonWorkingTimeStartsAndEndsAtMidnight(zone, change);
    windowsEndAtMidnight(zone, change);
    monthCellsReadEachDayOnce(zone, change);
    monthCellListsItsOwnDaysShifts(zone, change);
  }
}

console.log("daylightSaving tests passed");
