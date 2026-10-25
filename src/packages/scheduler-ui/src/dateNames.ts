/**
 * Weekday and month names for every date label the package renders.
 * Ruled 2026-09-06: names travel through the string bundle like every
 * other word, so labels read the user's Power Apps language rather
 * than the browser's. The order and punctuation of a label travel the
 * same way, as patterns: English keeps the design's "Mon 17 Aug",
 * German reads "Mo., 17. Aug.". Lists are pipe-separated in the
 * bundle; a malformed list or pattern falls back to English rather
 * than rendering blanks.
 */
import { formatClock } from "./clock";
import type { SchedulerStrings } from "./stringResources";
import type { HourFormat } from "./timeAxis";

export interface DateNames {
  readonly monthsLong: readonly string[];
  readonly monthsShort: readonly string[];
  readonly weekdaysShort: readonly string[];
  readonly weekdaysLong: readonly string[];
  readonly patterns: DatePatterns;
}

/** How a language orders and punctuates a date; placeholders in braces. */
export interface DatePatterns {
  /** "{day} {month}": "17 Aug". */
  readonly date: string;
  /** "{day} {month} {year}", with the long month: "17 August 2026". */
  readonly dateLong: string;
  /** "{weekday} {day} {month}": "Mon 17 Aug". */
  readonly day: string;
  /** "{from}–{to} {month}": "17–23 Aug". */
  readonly dayRange: string;
  /** "{weekday} {day}": "Mon 17", where space is short. */
  readonly dayShort: string;
}

const englishDatePatterns: DatePatterns = {
  date: "{day} {month}",
  dateLong: "{day} {month} {year}",
  day: "{weekday} {day} {month}",
  dayRange: "{from}–{to} {month}",
  dayShort: "{weekday} {day}",
};

export const englishDateNames: DateNames = {
  monthsLong: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  weekdaysLong: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  patterns: englishDatePatterns,
};

type DateNameStrings = Pick<
  SchedulerStrings,
  | "dateLabelPattern"
  | "dateLongPattern"
  | "dayLabelPattern"
  | "dayRangePattern"
  | "dayShortPattern"
  | "monthsLong"
  | "monthsShort"
  | "weekdaysLong"
  | "weekdaysShort"
>;

export function dateNamesFrom(strings: DateNameStrings): DateNames {
  return {
    monthsLong: splitNames(strings.monthsLong, englishDateNames.monthsLong),
    monthsShort: splitNames(strings.monthsShort, englishDateNames.monthsShort),
    weekdaysShort: splitNames(strings.weekdaysShort, englishDateNames.weekdaysShort),
    weekdaysLong: splitNames(strings.weekdaysLong, englishDateNames.weekdaysLong),
    patterns: {
      date: pattern(strings.dateLabelPattern, englishDatePatterns.date),
      dateLong: pattern(strings.dateLongPattern, englishDatePatterns.dateLong),
      day: pattern(strings.dayLabelPattern, englishDatePatterns.day),
      dayRange: pattern(strings.dayRangePattern, englishDatePatterns.dayRange),
      dayShort: pattern(strings.dayShortPattern, englishDatePatterns.dayShort),
    },
  };
}

/** A pattern from the bundle when it names every placeholder English's does; else English's. */
function pattern(value: string | undefined, fallback: string): string {
  const needed = fallback.match(/\{\w+\}/g) ?? [];
  return value !== undefined && needed.every((placeholder) => value.includes(placeholder)) ? value : fallback;
}

function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (values[key] === undefined ? match : String(values[key])));
}

function splitNames(list: string, fallback: readonly string[]): readonly string[] {
  const parts = list.split("|").map((part) => part.trim());
  return parts.length === fallback.length && parts.every((part) => part.length > 0)
    ? parts
    : fallback;
}

export function weekdayShort(date: Date, names: DateNames = englishDateNames): string {
  return names.weekdaysShort[date.getDay()] ?? "";
}

export function monthShort(date: Date, names: DateNames = englishDateNames): string {
  return names.monthsShort[date.getMonth()] ?? "";
}

export function monthLong(date: Date, names: DateNames = englishDateNames): string {
  return names.monthsLong[date.getMonth()] ?? "";
}

/** "Mon 17 Aug"; German "Mo., 17. Aug." */
export function formatDayLabel(date: Date, names: DateNames = englishDateNames): string {
  return fill(names.patterns.day, { day: date.getDate(), month: monthShort(date, names), weekday: weekdayShort(date, names) });
}

/** "Mon 17"; German "Mo. 17." */
export function formatDayShortLabel(date: Date, names: DateNames = englishDateNames): string {
  return fill(names.patterns.dayShort, { day: date.getDate(), weekday: weekdayShort(date, names) });
}

/** "17 Aug"; German "17. Aug." */
export function formatDateLabel(date: Date, names: DateNames = englishDateNames): string {
  return fill(names.patterns.date, { day: date.getDate(), month: monthShort(date, names) });
}

/** "17 August 2026"; German "17. August 2026" */
export function formatDateLongLabel(date: Date, names: DateNames = englishDateNames): string {
  return fill(names.patterns.dateLong, { day: date.getDate(), month: monthLong(date, names), year: date.getFullYear() });
}

/**
 * Days from the first to the last, both included: "17 Aug" for one day, "17–23 Aug" in one month, "29 Aug – 4 Sep"
 * across months; German "17.–23. Aug." and "29. Aug. – 4. Sept.".
 */
export function formatDayRange(first: Date, last: Date, names: DateNames = englishDateNames): string {
  const sameDay = first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth() && first.getDate() === last.getDate();
  if (sameDay) {
    return formatDateLabel(last, names);
  }
  return first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
    ? fill(names.patterns.dayRange, { from: first.getDate(), month: monthShort(last, names), to: last.getDate() })
    : `${formatDateLabel(first, names)} – ${formatDateLabel(last, names)}`;
}

/** "Mon 17 Aug 08:00", or "Mon 17 Aug 8am" in the 12-hour format */
export function formatDayTimeLabel(date: Date, names: DateNames = englishDateNames, format: HourFormat = "24"): string {
  return `${formatDayLabel(date, names)} ${formatClock(date, format)}`;
}
