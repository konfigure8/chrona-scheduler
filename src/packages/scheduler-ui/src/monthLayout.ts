import { compareSameStart, type OpenShiftKindOf } from "./solve";
import { englishDateNames, formatDayLabel, type DateNames } from "./dateNames";
import type { SchedulerUiEvent } from "./types";

export interface MonthCell {
  readonly date: Date;
  readonly dayOfMonth: number;
  readonly inMonth: boolean;
  readonly isWeekend: boolean;
}

const millisecondsPerDay = 86_400_000;

/**
 * Month matrix covering the anchor's month, padded to whole weeks with
 * out-of-month cells; each row starts on the week's first day (0 Sunday
 * to 6 Saturday, default Monday). Weekend columns drop when hidden.
 */
export function buildMonthMatrix(
  anchor: Date,
  showWeekends = true,
  weekStartsOn = 1,
): readonly (readonly MonthCell[])[] {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const monthIndex = monthStart.getMonth();
  const gridStart = new Date(monthStart.getTime());
  gridStart.setDate(
    gridStart.getDate() - ((gridStart.getDay() - weekStartsOn + 7) % 7),
  );

  const weeks: MonthCell[][] = [];
  const cursor = new Date(gridStart.getTime());

  do {
    const week: MonthCell[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const date = new Date(cursor.getTime());
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      if (showWeekends || !isWeekend) {
        week.push({
          date,
          dayOfMonth: date.getDate(),
          inMonth: date.getMonth() === monthIndex,
          isWeekend,
        });
      }
      cursor.setTime(cursor.getTime() + millisecondsPerDay);
    }
    weeks.push(week);
  } while (cursor.getTime() < monthEnd.getTime());

  return weeks;
}

/**
 * The events a month cell lists, earliest first: those that start on the
 * day, and an event of a whole day or longer (leave, a course) on every
 * day it covers. A night shift shows on the day it starts only, as on the
 * roster, so the next day does not read as covered.
 */
export function eventsForDay(
  events: readonly SchedulerUiEvent[],
  day: Date,
): readonly SchedulerUiEvent[] {
  const dayStart = new Date(day.getTime());
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + millisecondsPerDay);
  return events
    .filter((event) =>
      event.end.getTime() - event.start.getTime() >= millisecondsPerDay
        ? event.start.getTime() < dayEnd.getTime() && event.end.getTime() > dayStart.getTime()
        : event.start.getTime() >= dayStart.getTime() && event.start.getTime() < dayEnd.getTime(),
    )
    .sort((first, second) => first.start.getTime() - second.start.getTime());
}

export interface AgendaDayGroup {
  readonly date: Date;
  readonly events: readonly SchedulerUiEvent[];
  readonly label: string;
}

/** The minute a shift starts: shifts in the same minute start together. */
const minuteOf = (event: SchedulerUiEvent): number => Math.floor(event.start.getTime() / 60_000);

/** Events grouped by calendar day, both sorted, empty days omitted. */
export function groupEventsByDay(
  events: readonly SchedulerUiEvent[],
  names: DateNames = englishDateNames,
  kindOf?: OpenShiftKindOf,
): readonly AgendaDayGroup[] {
  const byDay = new Map<number, SchedulerUiEvent[]>();
  for (const event of events) {
    const dayStart = new Date(event.start.getTime());
    dayStart.setHours(0, 0, 0, 0);
    const key = dayStart.getTime();
    const bucket = byDay.get(key) ?? [];
    bucket.push(event);
    byDay.set(key, bucket);
  }
  return [...byDay.entries()]
    .sort(([first], [second]) => first - second)
    .map(([key, dayEvents]) => ({
      date: new Date(key),
      events: [...dayEvents].sort(
        (first, second) => minuteOf(first) - minuteOf(second) || compareSameStart(first, second, kindOf),
      ),
      label: formatDayLabel(new Date(key), names),
    }));
}
