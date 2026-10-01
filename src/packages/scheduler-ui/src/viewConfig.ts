import type { WorkingWindow } from "./decorations";
import { englishDateNames, formatDayLabel, monthLong, type DateNames } from "./dateNames";
import type { HourFormat } from "./timeAxis";
import type { SchedulerUiEvent, TimeWindow } from "./types";

export type { HourFormat } from "./timeAxis";

export type SchedulerRepresentation =
  | "agenda"
  | "day"
  | "month"
  | "roster"
  | "timeline"
  | "topDown"
  | "week";

export type SchedulerTimeScale = "day" | "daySpan" | "month" | "week";

/**
 * Calendar 365-style color rule. `field` undefined matches the built-in
 * status; otherwise the rule matches a mapped display field by label.
 */
export interface StatusColorRule {
  readonly color: string;
  readonly field?: string;
  readonly value: string;
}

/**
 * Serializable view configuration. The PCF adapter builds this from the
 * existing Dataverse mapping rows (chr_chronaschedulercalendar,
 * chr_chronaschedulerfield, chr_chronaschedulerview) - no new schema.
 */
export interface SchedulerViewConfig {
  /** Maker lock: false hides the user-facing time-scale menu. */
  readonly allowUserTimeScale?: boolean;
  readonly daySpanDays?: number;
  readonly hourFormat?: HourFormat;
  /** Finest slot granularity the maker permits (e.g. 15 forbids 5/6/10). */
  readonly minSlotMinutes?: number;
  readonly representation: SchedulerRepresentation;
  readonly showWeekends?: boolean;
  /** Default time scale (Teams-style slot granularity), user-overridable. */
  readonly slotMinutes?: number;
  readonly statusColorRules?: readonly StatusColorRule[];
  readonly timeScale?: SchedulerTimeScale;
  readonly workingWindow?: WorkingWindow;
}

export const defaultViewConfig: SchedulerViewConfig = {
  hourFormat: "24",
  representation: "timeline",
  showWeekends: true,
  slotMinutes: 30,
  timeScale: "daySpan",
};

/** Teams-parity time scales, coarse to fine. */
export const timeScaleMinutesOptions: readonly number[] = [
  60, 30, 15, 10, 6, 5,
];

export interface TimeScalePolicy {
  readonly allowUserTimeScale?: boolean;
  readonly minSlotMinutes?: number;
}

export interface TimeScaleOption {
  readonly enabled: boolean;
  readonly minutes: number;
}

export interface ResolvedTimeScale {
  /** The scale actually in force after every clamp. */
  readonly effective: number;
  readonly options: readonly TimeScaleOption[];
  /** False when the representation has no sub-day axis or the maker locked it. */
  readonly visible: boolean;
}

/**
 * Which time scales the current view supports, and the one in force.
 * Long timeline spans render one cell per day, so sub-hour granularity
 * is clamped to 60 there; day-cell views (roster, month, agenda) have
 * no menu at all. Clamps apply at resolution time only - the requested
 * (stored) preference is never rewritten, so a 5-minute preference
 * survives a trip through the month interval.
 */
export function resolveTimeScaleOptions(
  representation: SchedulerRepresentation,
  windowDays: number,
  policy?: TimeScalePolicy,
  requested?: number,
): ResolvedTimeScale {
  const hasSubDayAxis =
    representation === "timeline" ||
    representation === "topDown" ||
    representation === "day" ||
    representation === "week";
  // Guard nonsense maker input: 60 must always stay offerable.
  const minSlotMinutes = Math.min(policy?.minSlotMinutes ?? 5, 60);
  const hourlyOnly = representation === "timeline" && windowDays > 10;

  const options = timeScaleMinutesOptions.map((minutes) => ({
    enabled:
      minutes >= minSlotMinutes && (!hourlyOnly || minutes === 60),
    minutes,
  }));

  const wanted = requested ?? 30;
  const exact = options.find(
    (option) => option.enabled && option.minutes === wanted,
  );
  // Nearest coarser enabled option; 60 is always enabled as the floor.
  const fallback = options
    .filter((option) => option.enabled && option.minutes > wanted)
    .reduce(
      (best, option) =>
        best === undefined || option.minutes < best.minutes ? option : best,
      undefined as TimeScaleOption | undefined,
    );
  return {
    effective: exact?.minutes ?? fallback?.minutes ?? 60,
    options,
    visible: hasSubDayAxis && policy?.allowUserTimeScale !== false,
  };
}

const millisecondsPerDay = 86_400_000;

/** Window covering the scale anchored at (the day of) `anchor`. */
export function resolveWindowForScale(
  anchor: Date,
  config: SchedulerViewConfig,
): TimeWindow {
  const dayStart = new Date(anchor.getTime());
  dayStart.setHours(0, 0, 0, 0);

  const scale = config.timeScale ?? "day";
  if (scale === "day") {
    return {
      end: new Date(dayStart.getTime() + millisecondsPerDay),
      start: dayStart,
    };
  }
  if (scale === "daySpan") {
    const days = Math.max(1, config.daySpanDays ?? 3);
    return {
      end: new Date(dayStart.getTime() + days * millisecondsPerDay),
      start: dayStart,
    };
  }
  if (scale === "week") {
    const weekStart = new Date(dayStart.getTime());
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    return {
      end: new Date(weekStart.getTime() + 7 * millisecondsPerDay),
      start: weekStart,
    };
  }
  const monthStart = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  const monthEnd = new Date(
    dayStart.getFullYear(),
    dayStart.getMonth() + 1,
    1,
    0,
    0,
    0,
    0,
  );
  return { end: monthEnd, start: monthStart };
}

export function isWeekend(date: Date): boolean {
  return date.getDay() === 0 || date.getDay() === 6;
}

/** The zoom a timeline opens with in an interval. */
export interface IntervalZoom {
  /** True: the window fills the board until the planner zooms. */
  readonly fitToWidth: boolean;
  readonly pxPerHour: number;
}

/**
 * Ruled 2026-09-26: Day opens at the day zoom; Week, Month and spans open
 * fitted to the board. Once the planner zooms an interval, it keeps that
 * zoom.
 */
export function zoomForInterval(
  interval: SchedulerTimeScale,
  zoomByInterval: Readonly<Record<string, number>> | undefined,
  dayZoom: number,
): IntervalZoom {
  const chosen = zoomByInterval?.[interval];
  if (chosen !== undefined) {
    return { fitToWidth: false, pxPerHour: chosen };
  }
  return { fitToWidth: interval !== "day", pxPerHour: dayZoom };
}

/**
 * Moves the navigation anchor one step of the active time interval: a day,
 * a week, a calendar month, or `stepDays` for a custom day span. The
 * representation never affects stepping - only the interval does.
 */
export function stepAnchor(
  anchor: Date,
  interval: SchedulerTimeScale,
  direction: -1 | 1,
  stepDays = 1,
): Date {
  const next = new Date(anchor.getTime());
  if (interval === "month") {
    next.setMonth(next.getMonth() + direction);
    return next;
  }
  if (interval === "week") {
    next.setDate(next.getDate() + direction * 7);
    return next;
  }
  if (interval === "day") {
    next.setDate(next.getDate() + direction);
    return next;
  }
  next.setDate(next.getDate() + direction * Math.max(1, stepDays));
  return next;
}

/** Human label for the visible window, month-aware for the month interval. */
export function formatWindowLabel(
  window: TimeWindow,
  interval: SchedulerTimeScale,
  names: DateNames = englishDateNames,
): string {
  const start = window.start;
  const lastDay = new Date(window.end.getTime() - 1);
  if (interval === "month") {
    return `${monthLong(start, names)} ${start.getFullYear()}`;
  }
  const startLabel = formatDayLabel(start, names);
  if (
    start.getFullYear() === lastDay.getFullYear() &&
    start.getMonth() === lastDay.getMonth() &&
    start.getDate() === lastDay.getDate()
  ) {
    return `${startLabel} ${start.getFullYear()}`;
  }
  const endLabel = formatDayLabel(lastDay, names);
  return `${startLabel} - ${endLabel} ${lastDay.getFullYear()}`;
}

/**
 * Hour range worth rendering in vertical views: the span of the supplied
 * events padded by an hour each side, defaulting to 06:00-22:00 when empty.
 * Rendering all 24 hours squashes real shifts into a band of dead space.
 */
export function resolveVerticalHourRange(
  events: readonly SchedulerUiEvent[],
): { readonly endHour: number; readonly startHour: number } {
  let earliest = 24;
  let latest = 0;
  for (const event of events) {
    const sameDay =
      event.start.getFullYear() === event.end.getFullYear() &&
      event.start.getMonth() === event.end.getMonth() &&
      event.start.getDate() === event.end.getDate();
    earliest = Math.min(earliest, event.start.getHours());
    latest = Math.max(
      latest,
      sameDay
        ? event.end.getHours() + (event.end.getMinutes() > 0 ? 1 : 0)
        : 24,
    );
  }
  if (earliest >= latest) {
    return { endHour: 22, startHour: 6 };
  }
  return {
    endHour: Math.min(24, latest + 1),
    startHour: Math.max(0, earliest - 1),
  };
}

export function isSameDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

/**
 * Hour of day a timeline should open scrolled to (Bryntum opens at
 * the working day, not 00:00). An explicit host hour wins; otherwise one
 * hour before the earliest visible event, defaulting to 08:00 when the
 * window is empty.
 */
export function resolveInitialScrollHour(
  events: readonly SchedulerUiEvent[],
  window: TimeWindow,
  configuredHour?: number,
): number {
  if (configuredHour !== undefined) {
    return Math.min(23, Math.max(0, configuredHour));
  }
  let earliest = 24;
  for (const event of events) {
    if (event.start < window.end && event.end > window.start) {
      earliest = Math.min(earliest, event.start.getHours());
    }
  }
  if (earliest === 24) {
    return 8;
  }
  return Math.max(0, earliest - 1);
}

/** Resolves an event's display color: explicit color, then first matching rule. */
export function resolveEventColor(
  event: SchedulerUiEvent,
  rules: readonly StatusColorRule[] | undefined,
): string | undefined {
  if (event.color) {
    return event.color;
  }
  if (!rules) {
    return undefined;
  }
  for (const rule of rules) {
    if (rule.field === undefined) {
      if (event.status === rule.value) {
        return rule.color;
      }
      continue;
    }
    const field = event.fields?.find(
      (candidate) => candidate.label === rule.field,
    );
    if (field && field.value === rule.value) {
      return rule.color;
    }
  }
  return undefined;
}

