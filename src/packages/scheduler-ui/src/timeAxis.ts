import { englishDateNames, formatDayLabel, weekdayShort, type DateNames } from "./dateNames";
import type { TimeWindow } from "./types";

export { formatDayLabel };

export interface TimeTick {
  readonly date: Date;
  readonly isDayStart: boolean;
  readonly label: string;
  readonly left: number;
}

const millisecondsPerHour = 3_600_000;

export function dateToOffset(
  date: Date,
  window: TimeWindow,
  pxPerHour: number,
): number {
  return (
    ((date.getTime() - window.start.getTime()) / millisecondsPerHour) *
    pxPerHour
  );
}

export function offsetToDate(
  left: number,
  window: TimeWindow,
  pxPerHour: number,
): Date {
  return new Date(
    window.start.getTime() + (left / pxPerHour) * millisecondsPerHour,
  );
}

/** Snap on the local clock, so hour and day steps land on local hours and midnights. */
export function snapDate(date: Date, snapMinutes: number): Date {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (snapMinutes >= 1440) {
    const nextMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const pastHalf = date.getTime() - midnight.getTime() >= (nextMidnight.getTime() - midnight.getTime()) / 2;
    return pastHalf ? nextMidnight : midnight;
  }
  const snapMs = snapMinutes * 60_000;
  return new Date(midnight.getTime() + Math.round((date.getTime() - midnight.getTime()) / snapMs) * snapMs);
}

export function windowWidth(window: TimeWindow, pxPerHour: number): number {
  return dateToOffset(window.end, window, pxPerHour);
}

export type HourFormat = "12" | "24";


export function formatHourLabel(date: Date, format: HourFormat = "24"): string {
  if (format === "24") {
    return `${date.getHours().toString().padStart(2, "0")}:00`;
  }
  const hours = date.getHours();
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelveHour}${hours < 12 ? "am" : "pm"}`;
}

/** ISO-8601 week number (the week containing the year's first Thursday is W1). */
export function isoWeekNumber(date: Date): number {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayOfWeek + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayOfWeek = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayOfWeek + 3);
  return (
    1 +
    Math.round(
      (target.getTime() - firstThursday.getTime()) / 604_800_000,
    )
  );
}

export interface WeekSpan {
  readonly label: string;
  readonly left: number;
  readonly width: number;
}

/** ISO-week header cells clipped to the window (Monday boundaries). */
export function buildWeekSpans(
  window: TimeWindow,
  pxPerHour: number,
): readonly WeekSpan[] {
  const spans: WeekSpan[] = [];
  let cursor = new Date(window.start.getTime());
  while (cursor.getTime() < window.end.getTime()) {
    const nextMonday = new Date(cursor.getTime());
    nextMonday.setHours(0, 0, 0, 0);
    nextMonday.setDate(
      nextMonday.getDate() + (7 - ((nextMonday.getDay() + 6) % 7)),
    );
    const spanEnd = new Date(
      Math.min(nextMonday.getTime(), window.end.getTime()),
    );
    const left = dateToOffset(cursor, window, pxPerHour);
    spans.push({
      label: `W${isoWeekNumber(cursor)}`,
      left,
      width: dateToOffset(spanEnd, window, pxPerHour) - left,
    });
    cursor = spanEnd;
  }
  return spans;
}

export function buildTimeTicks(
  window: TimeWindow,
  pxPerHour: number,
  stepHours = 1,
  hourFormat: HourFormat = "24",
  names: DateNames = englishDateNames,
): readonly TimeTick[] {
  return buildTimeTicksEvery(window, pxPerHour, stepHours * 60, hourFormat, names);
}

/** Ticks every `stepMinutes`, aligned to local midnight so 3h and 6h steps land on 03:00, 06:00. */
export function buildTimeTicksEvery(
  window: TimeWindow,
  pxPerHour: number,
  stepMinutes: number,
  hourFormat: HourFormat = "24",
  names: DateNames = englishDateNames,
): readonly TimeTick[] {
  const ticks: TimeTick[] = [];
  const stepMs = Math.max(1, stepMinutes) * 60_000;
  const cursor = new Date(window.start.getTime());
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < window.start.getTime()) {
    cursor.setTime(cursor.getTime() + stepMs);
  }

  while (cursor.getTime() < window.end.getTime()) {
    const isDayStart = cursor.getHours() === 0 && cursor.getMinutes() === 0;
    ticks.push({
      date: new Date(cursor.getTime()),
      isDayStart,
      label: isDayStart
        ? formatDayLabel(cursor, names)
        : formatHourLabel(cursor, hourFormat),
      left: dateToOffset(cursor, window, pxPerHour),
    });
    const next = new Date(cursor.getTime() + stepMs);
    // Day-sized steps follow the calendar, so a daylight-saving change keeps midnights.
    if (stepMinutes >= 1440) {
      next.setTime(cursor.getTime());
      next.setDate(next.getDate() + Math.round(stepMinutes / 1440));
    }
    cursor.setTime(next.getTime());
  }

  return ticks;
}

/** The closest the timeline zooms in. */
export const MAX_PX_PER_HOUR = 240;
/** The furthest out the timeline zooms before it has measured its width. */
export const MIN_PX_PER_HOUR = 12;

/** The zoom at which the whole window fills `canvasWidth`, never closer than the maximum. */
export function fitPxPerHour(window: TimeWindow, canvasWidth: number): number {
  const hours = Math.max(1, (window.end.getTime() - window.start.getTime()) / 3_600_000);
  return Math.min(MAX_PX_PER_HOUR, Math.max(0.1, canvasWidth / hours));
}

/**
 * One wheel step of zoom within [floor, MAX_PX_PER_HOUR]. Fine zooms keep a
 * decimal so a fitted month (about 2 px/h) can still step in.
 */
export function stepZoom(pxPerHour: number, direction: "in" | "out", floor: number): number {
  const next = direction === "in" ? pxPerHour * 1.2 : pxPerHour / 1.2;
  const rounded = next < MIN_PX_PER_HOUR ? Math.round(next * 10) / 10 : Math.round(next);
  return Math.min(MAX_PX_PER_HOUR, Math.max(Math.min(floor, MAX_PX_PER_HOUR), rounded));
}

/** A day label that fits its cell: "Tue 18 Aug", then "Tue 18", then "18". */
export function formatDayLabelToFit(date: Date, widthPx: number, names: DateNames = englishDateNames): string {
  if (widthPx >= 88) {
    return formatDayLabel(date, names);
  }
  if (widthPx >= 48) {
    return `${weekdayShort(date, names)} ${date.getDate()}`;
  }
  return `${date.getDate()}`;
}

/**
 * The time resolution ladder. Zooming out steps the grid up it, so the
 * header stays readable and dragging stays hittable at every zoom.
 */
export const TIME_RESOLUTION_LADDER: readonly number[] = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];

export interface TimeResolution {
  /** Grid slot and drag snap, in minutes: never finer than the maker's slot. */
  readonly slotMinutes: number;
  /** Where the time labels sit, in minutes: at least an hour. 1440 means day labels only. */
  readonly labelMinutes: number;
}

export interface TimeResolutionLimits {
  /** Narrowest slot worth drawing and hitting. */
  readonly minSlotPx: number;
  /** Narrowest cell a time label fits in. */
  readonly minLabelPx: number;
}

/** Across a timeline: a slot of 16 px, a label cell of 44 px ("12:00" at 12 px). */
export const HORIZONTAL_RESOLUTION_LIMITS: TimeResolutionLimits = { minLabelPx: 44, minSlotPx: 16 };
/** Down a day column: a slot of 12 px, a label row of 20 px. */
export const VERTICAL_RESOLUTION_LIMITS: TimeResolutionLimits = { minLabelPx: 20, minSlotPx: 12 };

/**
 * The finest resolution the zoom can show. The slot is the maker's slot,
 * or the next ladder step up, that is at least `minSlotPx` wide. Labels
 * take the finest step of an hour or more that holds whole slots and is
 * at least `minLabelPx` wide.
 */
export function resolveTimeResolution(
  pxPerHour: number,
  finestSlotMinutes = 30,
  limits: TimeResolutionLimits = HORIZONTAL_RESOLUTION_LIMITS,
): TimeResolution {
  const pxPerMinute = Math.max(pxPerHour, 0) / 60;
  const finest = Math.min(Math.max(1, Math.round(finestSlotMinutes)), 1440);
  const slotRungs = [finest, ...TIME_RESOLUTION_LADDER.filter((minutes) => minutes > finest)];
  const slotMinutes = slotRungs.find((minutes) => minutes * pxPerMinute >= limits.minSlotPx) ?? 1440;
  const labelMinutes =
    TIME_RESOLUTION_LADDER.find(
      (minutes) =>
        minutes >= Math.max(slotMinutes, 60) &&
        minutes % slotMinutes === 0 &&
        minutes * pxPerMinute >= limits.minLabelPx,
    ) ?? 1440;
  return { labelMinutes, slotMinutes };
}
