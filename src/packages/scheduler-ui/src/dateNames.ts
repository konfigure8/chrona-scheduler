/**
 * Weekday and month names for every date label the package renders.
 * Ruled 2026-09-06: names travel through the string bundle like every
 * other word, so labels read the user's Power Apps language rather
 * than the browser's, and keep the design's fixed "Mon 17 Aug" shape.
 * Lists are pipe-separated in the bundle; a malformed list falls back
 * to English rather than rendering blanks.
 */
import type { SchedulerStrings } from "./stringResources";

export interface DateNames {
  readonly monthsLong: readonly string[];
  readonly monthsShort: readonly string[];
  readonly weekdaysShort: readonly string[];
  readonly weekdaysLong: readonly string[];
}

export const englishDateNames: DateNames = {
  monthsLong: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  weekdaysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  weekdaysLong: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

type DateNameStrings = Pick<SchedulerStrings, "monthsLong" | "monthsShort" | "weekdaysLong" | "weekdaysShort">;

export function dateNamesFrom(strings: DateNameStrings): DateNames {
  return {
    monthsLong: splitNames(strings.monthsLong, englishDateNames.monthsLong),
    monthsShort: splitNames(strings.monthsShort, englishDateNames.monthsShort),
    weekdaysShort: splitNames(strings.weekdaysShort, englishDateNames.weekdaysShort),
    weekdaysLong: splitNames(strings.weekdaysLong, englishDateNames.weekdaysLong),
  };
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

/** "Mon 17 Aug" */
export function formatDayLabel(date: Date, names: DateNames = englishDateNames): string {
  return `${weekdayShort(date, names)} ${date.getDate()} ${monthShort(date, names)}`;
}

/** "17 Aug" */
export function formatDateLabel(date: Date, names: DateNames = englishDateNames): string {
  return `${date.getDate()} ${monthShort(date, names)}`;
}

/** "Mon 17 Aug 08:00" */
export function formatDayTimeLabel(date: Date, names: DateNames = englishDateNames): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${formatDayLabel(date, names)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
