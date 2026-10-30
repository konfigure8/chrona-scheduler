import {
  englishDateNames,
  formatDateLabel,
  formatDayLabel,
  weekdayShort,
  type DateNames,
} from "./dateNames";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  TimeWindow,
} from "./types";

export interface RosterDay {
  /** "17 Aug": the Roster grid header's second line. */
  readonly date: string;
  readonly end: Date;
  /** "Mon 17 Aug" */
  readonly label: string;
  readonly start: Date;
  /** "Mon": the Roster grid header's first line. */
  readonly weekday: string;
  readonly weekend: boolean;
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
    // The next calendar midnight: a daylight-saving day runs 23 or 25 hours.
    const end = new Date(cursor.getTime());
    end.setDate(end.getDate() + 1);
    const isWeekend = start.getDay() === 0 || start.getDay() === 6;
    if (showWeekends || !isWeekend) {
      days.push({
        date: formatDateLabel(start, names),
        end,
        label: formatDayLabel(start, names),
        start,
        weekday: weekdayShort(start, names),
        weekend: isWeekend,
      });
    }
    cursor.setTime(end.getTime());
  }

  return days;
}

/**
 * Whether the Roster grid shows an item in a day's cell: a shift on the
 * day it starts, so a night shift shows once; an item longer than 24
 * hours on every day it covers (Matt 2026-09-30).
 */
/**
 * Where a host's mark sits in a person's day cell (RosterExtension.dayMarks):
 * its start and width in percent of the cell, the day running from midnight
 * on the left. Undefined when it covers none of the day.
 */
export function rosterMarkPlacement(mark: { readonly from: number; readonly to: number }): { readonly left: string; readonly width: string } | undefined {
  const clamp = (value: number): number => Math.max(0, Math.min(1, value));
  const from = clamp(mark.from);
  const to = clamp(mark.to);
  if (!(to > from)) return undefined;
  const percent = (value: number): string => `${Math.round(value * 10000) / 100}%`;
  return { left: percent(from), width: percent(to - from) };
}

/**
 * The rows a Roster group draws (RosterExtension.groups): its heading, then,
 * unless it is collapsed, its open row (when the grid has one) and its people,
 * then its footer when it has one.
 */
export function rosterGroupRows(
  group: { readonly collapsed?: boolean; readonly footer?: unknown },
  hasOpenRow: boolean,
): { readonly footer: boolean; readonly open: boolean; readonly people: boolean } {
  return { footer: group.footer !== undefined, open: hasOpenRow && group.collapsed !== true, people: group.collapsed !== true };
}

export function showsOnDay(event: SchedulerUiEvent, day: RosterDay): boolean {
  return event.end.getTime() - event.start.getTime() > millisecondsPerDay
    ? event.start.getTime() < day.end.getTime() &&
        event.end.getTime() > day.start.getTime()
    : event.start.getTime() >= day.start.getTime() &&
        event.start.getTime() < day.end.getTime();
}

const byStart = (first: SchedulerUiEvent, second: SchedulerUiEvent): number =>
  first.start.getTime() - second.start.getTime();

/**
 * The open-shifts row (F31 rework, batch 3): the shifts nobody works,
 * by day, ordered by start time.
 */
export function layoutOpenRow(
  events: readonly SchedulerUiEvent[],
  days: readonly RosterDay[],
): readonly (readonly SchedulerUiEvent[])[] {
  return days.map((day) =>
    events.filter((event) => showsOnDay(event, day)).sort(byStart),
  );
}

/**
 * Traditional roster grid: one row per resource, one column per day, events
 * listed inside the day cell ordered by start time (see showsOnDay).
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
          (event) => event.resourceId === resource.id && showsOnDay(event, day),
        )
        .sort(byStart),
    ),
    resource,
  }));
}
