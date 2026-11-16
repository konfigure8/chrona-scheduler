import {
  englishDateNames,
  formatDateLabel,
  formatDayLabel,
  weekdayShort,
  type DateNames,
} from "./dateNames";
import type { CreateRequest } from "./interactions";
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

/** A Roster day cell a new item can be made in: a worker's day, or a day on an open row. */
export interface RosterCell {
  readonly day: RosterDay;
  /** The row's person; absent on an open row (nobody). */
  readonly resource?: SchedulerResource;
  /** The row's band (RosterGroup.groups); absent when the grid shows no bands. */
  readonly groups?: Readonly<Record<string, string>>;
  /** The row's band's required tags (RosterGroup.requiredTags); absent when it has none. */
  readonly requiredTags?: readonly string[];
}

/**
 * Where a new item made in a Roster day cell goes, as a range drawn on the Timeline goes (drawnRangeTarget): an
 * extension's own form (`hasCreate`) gets the day with no times (dayOnly), the row's person (none on an open row) and the
 * row's band (its groups and required tags); with none, the board's own dialog gets the cell's range, the day from midnight to midnight, on the row's
 * person or, on an open row, the host's nobody (`openResourceId`). Undefined = no item can be made there: an open row
 * when the host has no nobody, or a day whose bounds are not real times (nothing is made from a time it cannot read).
 */
export function rosterCellTarget(
  cell: RosterCell,
  hasCreate: boolean,
  openResourceId: string | undefined,
): { readonly range: { readonly end: Date; readonly resourceId: string; readonly start: Date } } | { readonly request: CreateRequest } | undefined {
  const { day } = cell;
  if (Number.isNaN(day.start.getTime()) || Number.isNaN(day.end.getTime()) || !(day.end.getTime() > day.start.getTime())) {
    return undefined;
  }
  if (hasCreate) {
    return {
      request: {
        dayOnly: true,
        end: day.end,
        ...(cell.groups && Object.keys(cell.groups).length > 0 ? { groups: cell.groups } : {}),
        ...(cell.requiredTags && cell.requiredTags.length > 0 ? { requiredTags: cell.requiredTags } : {}),
        ...(cell.resource ? { resource: cell.resource } : {}),
        start: day.start,
      },
    };
  }
  const resourceId = cell.resource?.id ?? openResourceId;
  return resourceId === undefined ? undefined : { range: { end: day.end, resourceId, start: day.start } };
}

/** Where the Roster grid's keyboard focus rests: a day cell (no `chip`), or the shift at that place in the cell. */
export interface RosterFocus {
  readonly row: number;
  readonly col: number;
  readonly chip?: number;
}

/**
 * Where a key moves the Roster grid's focus (the ARIA grid pattern: the grid is one tab stop, the keys move inside it).
 * `chips[row][col]` is the number of shifts in each cell, the rows in the grid's order (open rows and people's rows).
 * Left and Right go to the row's day before or after; Down goes through the cell's shifts top to bottom, then to the cell
 * below; Up goes back the same way; Home and End go to the row's first and last day; Ctrl+Home and Ctrl+End to the
 * grid's first and last cell. Undefined = the key moves nothing (another key, or the grid's edge).
 */
export function moveRosterFocus(
  at: RosterFocus,
  key: { readonly key: string; readonly ctrlKey?: boolean },
  chips: readonly (readonly number[])[],
): RosterFocus | undefined {
  const rows = chips.length;
  const cols = chips[at.row]?.length ?? 0;
  if (rows === 0 || cols === 0) return undefined;
  const count = (row: number, col: number): number => chips[row]?.[col] ?? 0;
  const lastRow = rows - 1;
  const lastCol = (row: number): number => (chips[row]?.length ?? 1) - 1;
  switch (key.key) {
    case "ArrowLeft":
      return at.col > 0 ? { col: at.col - 1, row: at.row } : undefined;
    case "ArrowRight":
      return at.col < lastCol(at.row) ? { col: at.col + 1, row: at.row } : undefined;
    case "ArrowDown": {
      const next = at.chip === undefined ? 0 : at.chip + 1;
      if (next < count(at.row, at.col)) return { chip: next, col: at.col, row: at.row };
      return at.row < lastRow ? { col: Math.min(at.col, lastCol(at.row + 1)), row: at.row + 1 } : undefined;
    }
    case "ArrowUp": {
      if (at.chip !== undefined) return at.chip > 0 ? { chip: at.chip - 1, col: at.col, row: at.row } : { col: at.col, row: at.row };
      if (at.row === 0) return undefined;
      const col = Math.min(at.col, lastCol(at.row - 1));
      const above = count(at.row - 1, col);
      return above > 0 ? { chip: above - 1, col, row: at.row - 1 } : { col, row: at.row - 1 };
    }
    case "Home":
      return key.ctrlKey ? { col: 0, row: 0 } : { col: 0, row: at.row };
    case "End":
      return key.ctrlKey ? { col: lastCol(lastRow), row: lastRow } : { col: lastCol(at.row), row: at.row };
    default:
      return undefined;
  }
}
