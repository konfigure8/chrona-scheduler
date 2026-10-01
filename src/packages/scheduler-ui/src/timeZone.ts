/**
 * Display-timezone support, built on Intl. The package itself is
 * timezone-agnostic: components render whatever wall-clock Dates they
 * are handed. Hosts convert at the boundary - instants become "display
 * dates" whose local getters read the target zone's wall clock, and
 * edited results convert back. Single-display-zone semantics (kept on
 * merits from the harness control's schedulerTimeZone.ts); per-row
 * zones are deliberately out of scope (Docs/scheduler_ui_plan.md).
 */

export const defaultDisplayTimeZone = "Etc/UTC";

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZoneId: string): Intl.DateTimeFormat {
  let formatter = partsFormatterCache.get(timeZoneId);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone: timeZoneId,
      year: "numeric",
    });
    partsFormatterCache.set(timeZoneId, formatter);
  }
  return formatter;
}

function wallClockAsUtcMs(instant: Date, timeZoneId: string): number {
  const parts = partsFormatter(timeZoneId).formatToParts(instant);
  const read = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  // Intl reports midnight as hour 24 in some engines.
  const hour = read("hour") % 24;
  return Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    hour,
    read("minute"),
    read("second"),
    instant.getMilliseconds(),
  );
}

/**
 * The instant re-expressed so LOCAL getters read the target zone's wall
 * clock - the "display date" the components render.
 */
export function toDisplayZone(instant: Date, timeZoneId: string): Date {
  const wall = new Date(wallClockAsUtcMs(instant, timeZoneId));
  return new Date(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
    wall.getUTCHours(),
    wall.getUTCMinutes(),
    wall.getUTCSeconds(),
    instant.getMilliseconds(),
  );
}

/**
 * Inverse of toDisplayZone: the real instant whose wall clock in the
 * zone matches the display date's local reading. Two-pass offset
 * resolution handles DST transitions; wall times inside a skipped or
 * repeated hour resolve deterministically to the post-transition
 * offset - a repeated hour maps to two instants, so exact round-trips
 * are only possible for unambiguous times (the caveat every calendar
 * product carries).
 */
export function fromDisplayZone(display: Date, timeZoneId: string): Date {
  const wallUtc = Date.UTC(
    display.getFullYear(),
    display.getMonth(),
    display.getDate(),
    display.getHours(),
    display.getMinutes(),
    display.getSeconds(),
    display.getMilliseconds(),
  );
  const offsetAt = (candidate: number): number =>
    wallClockAsUtcMs(new Date(candidate), timeZoneId) - candidate;
  let instant = wallUtc - offsetAt(wallUtc);
  instant = wallUtc - offsetAt(instant);
  return new Date(instant);
}

export interface DisplayTimeZoneResolution {
  readonly label: string;
  readonly source: "default" | "event" | "mixed";
  readonly timeZoneId: string;
}

export function isValidTimeZoneId(timeZoneId: string): boolean {
  try {
    partsFormatter(timeZoneId);
    return true;
  } catch {
    partsFormatterCache.delete(timeZoneId);
    return false;
  }
}

export function normalizeTimeZoneId(
  value: string | undefined,
): string | undefined {
  const candidate = value?.trim();
  if (!candidate) {
    return undefined;
  }
  if (candidate.toUpperCase() === "UTC") {
    return defaultDisplayTimeZone;
  }
  return isValidTimeZoneId(candidate) ? candidate : undefined;
}

export function formatTimeZoneLabel(timeZoneId: string): string {
  return timeZoneId === defaultDisplayTimeZone
    ? "UTC"
    : timeZoneId.replace(/_/g, " ");
}

/**
 * One display zone from event data: unanimous zones win, mixed or
 * absent zones fall back to UTC with an explaining label - the honest
 * zero-config default.
 */
export function resolveDisplayTimeZone(
  events: readonly { readonly timeZoneId?: string }[],
): DisplayTimeZoneResolution {
  const zones = new Set(
    events
      .map((event) => normalizeTimeZoneId(event.timeZoneId))
      .filter((value): value is string => Boolean(value)),
  );
  if (zones.size === 1) {
    const [timeZoneId = defaultDisplayTimeZone] = Array.from(zones);
    return {
      label: formatTimeZoneLabel(timeZoneId),
      source: "event",
      timeZoneId,
    };
  }
  if (zones.size > 1) {
    return {
      label: "Mixed time zones; UTC",
      source: "mixed",
      timeZoneId: defaultDisplayTimeZone,
    };
  }
  return { label: "UTC", source: "default", timeZoneId: defaultDisplayTimeZone };
}

/** Minutes east of UTC at an instant: how a host describes its user's zone. */
export type OffsetMinutesAt = (instant: Date) => number;

/**
 * toDisplayZone for a zone the host knows only as an offset function
 * (the Power Apps user's own time zone): local getters read the wall
 * clock at that offset.
 */
export function toOffsetZone(
  instant: Date,
  offsetMinutesAt: OffsetMinutesAt,
): Date {
  const wall = new Date(instant.getTime() + offsetMinutesAt(instant) * 60_000);
  return new Date(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
    wall.getUTCHours(),
    wall.getUTCMinutes(),
    wall.getUTCSeconds(),
    instant.getMilliseconds(),
  );
}

/** Inverse of toOffsetZone; the offset is re-read at the found instant for zones with daylight time. */
export function fromOffsetZone(
  display: Date,
  offsetMinutesAt: OffsetMinutesAt,
): Date {
  const wallUtc = Date.UTC(
    display.getFullYear(),
    display.getMonth(),
    display.getDate(),
    display.getHours(),
    display.getMinutes(),
    display.getSeconds(),
    display.getMilliseconds(),
  );
  let instant = wallUtc - offsetMinutesAt(new Date(wallUtc)) * 60_000;
  instant = wallUtc - offsetMinutesAt(new Date(instant)) * 60_000;
  return new Date(instant);
}

/** "UTC+10:00", "UTC-05:30", "UTC": the label for an offset-described zone. */
export function formatUtcOffsetLabel(offsetMinutes: number): string {
  if (offsetMinutes === 0) {
    return "UTC";
  }
  const sign = offsetMinutes > 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}
