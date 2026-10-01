import { englishDateNames, formatDayLabel, type DateNames } from "./dateNames";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  TimeWindow,
} from "./types";

export interface RosterDay {
  readonly end: Date;
  readonly label: string;
  readonly start: Date;
}

export interface RosterRowLayout {
  readonly cells: readonly (readonly SchedulerUiEvent[])[];
  readonly resource: SchedulerResource;
}

const millisecondsPerDay = 86_400_000;

export function buildRosterDays(
  window: TimeWindow,
  showWeekends = true,
  names: DateNames = englishDateNames,
): readonly RosterDay[] {
  const days: RosterDay[] = [];
  const cursor = new Date(window.start.getTime());
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < window.end.getTime()) {
    const start = new Date(cursor.getTime());
    const end = new Date(cursor.getTime() + millisecondsPerDay);
    const isWeekend = start.getDay() === 0 || start.getDay() === 6;
    if (showWeekends || !isWeekend) {
      days.push({
        end,
        label: formatDayLabel(start, names),
        start,
      });
    }
    cursor.setTime(end.getTime());
  }

  return days;
}

/**
 * Traditional roster grid: one row per resource, one column per day, events
 * listed inside the day cell ordered by start time.
 */
export function layoutRoster(
  resources: readonly SchedulerResource[],
  events: readonly SchedulerUiEvent[],
  days: readonly RosterDay[],
): readonly RosterRowLayout[] {
  return resources.map((resource) => ({
    cells: days.map((day) =>
      events
        .filter(
          (event) =>
            event.resourceId === resource.id &&
            event.start.getTime() < day.end.getTime() &&
            event.end.getTime() > day.start.getTime(),
        )
        .sort(
          (first, second) => first.start.getTime() - second.start.getTime(),
        ),
    ),
    resource,
  }));
}
