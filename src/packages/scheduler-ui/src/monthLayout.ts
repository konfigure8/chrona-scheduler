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
 * Monday-first month matrix covering the anchor's month, padded to whole
 * weeks with out-of-month cells. Weekend columns drop when hidden.
 */
export function buildMonthMatrix(
  anchor: Date,
  showWeekends = true,
): readonly (readonly MonthCell[])[] {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const monthIndex = monthStart.getMonth();
  const gridStart = new Date(monthStart.getTime());
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));

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

export function eventsForDay(
  events: readonly SchedulerUiEvent[],
  day: Date,
): readonly SchedulerUiEvent[] {
  const dayStart = new Date(day.getTime());
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + millisecondsPerDay);
  return events
    .filter(
      (event) =>
        event.start.getTime() < dayEnd.getTime() &&
        event.end.getTime() > dayStart.getTime(),
    )
    .sort((first, second) => first.start.getTime() - second.start.getTime());
}

export interface AgendaDayGroup {
  readonly date: Date;
  readonly events: readonly SchedulerUiEvent[];
  readonly label: string;
}

/** Events grouped by calendar day, both sorted, empty days omitted. */
export function groupEventsByDay(
  events: readonly SchedulerUiEvent[],
  names: DateNames = englishDateNames,
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
        (first, second) => first.start.getTime() - second.start.getTime(),
      ),
      label: formatDayLabel(new Date(key), names),
    }));
}
