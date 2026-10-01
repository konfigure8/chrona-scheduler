/**
 * F5 Demand levers (ruled 2026-09-01; built 2026-09-06). A template
 * row may carry a lever: M work items per N driver units, a minimum
 * (the floor Generate never goes under), an optional maximum, a
 * distribution, and a rounding rule. A driver is any countable
 * metric - guests, widgets, patients, tickets - with a window kind
 * that says how its values are keyed. Values are planner-entered
 * rows (driver, window start, optional service name, value).
 *
 * Everything here is pure and date-keyed: the reconcile hands in
 * local date keys (YYYY-MM-DD) for the occurrences it is expanding
 * and gets a count per occurrence back. Intra-shift peaks are more
 * templates with their own levers, never a curve.
 */

export type DemandWindowKind = "day" | "namedService" | "week" | "custom";
export type DemandDistribution = "perOccurrence" | "acrossWindow";
export type DemandRounding = "ceiling" | "nearest" | "floor";

export interface DemandDriver {
  readonly driverId: string;
  readonly name: string;
  readonly unitLabel?: string;
  readonly windowKind: DemandWindowKind;
}

/** One planner-entered value. `windowStart` is a local date key. */
export interface DemandDriverValue {
  readonly driverId: string;
  readonly serviceName?: string;
  readonly value: number;
  readonly windowStart: string;
}

export interface DemandLever {
  readonly distribution: DemandDistribution;
  readonly driverId: string;
  /** Optional cap after rounding. */
  readonly maximum?: number;
  /** The floor; also the count when the driver has no value. */
  readonly minimum: number;
  /** N driver units ... */
  readonly perUnits: number;
  /** ... produce M work items. */
  readonly ratioCount: number;
  readonly rounding: DemandRounding;
  /** For a named-service driver: which service this template serves. */
  readonly serviceName?: string;
}

export interface DemandData {
  readonly drivers: readonly DemandDriver[];
  readonly values: readonly DemandDriverValue[];
}

export interface ResolveSlotCountsInput {
  readonly demand: DemandData;
  readonly lever: DemandLever;
  /** Local date keys of the occurrences inside the period, in order. */
  readonly occurrenceDateKeys: readonly string[];
  /** Local date keys bounding the period (end exclusive). */
  readonly periodEndKey: string;
  readonly periodStartKey: string;
}

/** Apply M-per-N, rounding, floor, and cap to a driver quantity. */
export function applyLever(lever: DemandLever, driverUnits: number | undefined): number {
  const minimum = Math.max(0, Math.trunc(lever.minimum));
  if (driverUnits === undefined || !Number.isFinite(driverUnits) || lever.perUnits <= 0) {
    return capped(lever, minimum);
  }
  const raw = (Math.max(0, lever.ratioCount) * Math.max(0, driverUnits)) / lever.perUnits;
  const rounded = roundBy(lever.rounding, raw);
  return capped(lever, Math.max(minimum, rounded));
}

/**
 * The driver quantity a single occurrence reads, by window kind:
 * day - the row for that date; named service - the row for that date
 * and the lever's service; week - the row whose window start is the
 * latest on or before the date and within seven days; custom - the
 * latest row on or before the date. Undefined when nothing applies.
 */
export function resolveOccurrenceUnits(
  driver: DemandDriver,
  values: readonly DemandDriverValue[],
  dateKey: string,
  serviceName: string | undefined,
): number | undefined {
  const rows = values.filter((row) => row.driverId === driver.driverId);
  switch (driver.windowKind) {
    case "day":
      return sum(rows.filter((row) => row.windowStart === dateKey));
    case "namedService": {
      const wanted = normalizeService(serviceName);
      if (!wanted) {
        return undefined;
      }
      return sum(rows.filter((row) => row.windowStart === dateKey && normalizeService(row.serviceName) === wanted));
    }
    case "week":
      return latestOnOrBefore(rows, dateKey, 7)?.value;
    case "custom":
      return latestOnOrBefore(rows, dateKey)?.value;
    default:
      return undefined;
  }
}

/**
 * The driver quantity for the whole period, by window kind: day and
 * named service sum their rows inside the period; week sums the week
 * rows that start inside the period; custom reads the value in force
 * at the period start.
 */
export function resolveWindowUnits(
  driver: DemandDriver,
  values: readonly DemandDriverValue[],
  periodStartKey: string,
  periodEndKey: string,
  serviceName: string | undefined,
): number | undefined {
  const rows = values.filter((row) => row.driverId === driver.driverId);
  const inside = rows.filter((row) => row.windowStart >= periodStartKey && row.windowStart < periodEndKey);
  switch (driver.windowKind) {
    case "day":
      return sum(inside);
    case "namedService": {
      const wanted = normalizeService(serviceName);
      if (!wanted) {
        return undefined;
      }
      return sum(inside.filter((row) => normalizeService(row.serviceName) === wanted));
    }
    case "week":
      return sum(inside);
    case "custom":
      return latestOnOrBefore(rows, periodStartKey)?.value;
    default:
      return undefined;
  }
}

/**
 * Count per occurrence date. Per occurrence: each date reads its own
 * quantity. Across window: the period's quantity is spread evenly over
 * the occurrences, then each occurrence is rounded, floored, and capped
 * on its own. A lever whose driver is unknown yields the minimum.
 */
export function resolveSlotCounts(input: ResolveSlotCountsInput): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  const driver = input.demand.drivers.find((candidate) => candidate.driverId === input.lever.driverId);
  if (!driver) {
    for (const key of input.occurrenceDateKeys) {
      counts.set(key, applyLever(input.lever, undefined));
    }
    return counts;
  }
  if (input.lever.distribution === "acrossWindow") {
    const total = resolveWindowUnits(driver, input.demand.values, input.periodStartKey, input.periodEndKey, input.lever.serviceName);
    const share = total === undefined || input.occurrenceDateKeys.length === 0 ? undefined : total / input.occurrenceDateKeys.length;
    for (const key of input.occurrenceDateKeys) {
      counts.set(key, applyLever(input.lever, share));
    }
    return counts;
  }
  for (const key of input.occurrenceDateKeys) {
    counts.set(key, applyLever(input.lever, resolveOccurrenceUnits(driver, input.demand.values, key, input.lever.serviceName)));
  }
  return counts;
}

/** "1 per 10 guests, min 2" - for the bench and the origin snapshot. */
export function describeLever(lever: DemandLever, driver: DemandDriver | undefined): string {
  const unit = driver?.unitLabel ?? driver?.name ?? "units";
  const parts = [`${lever.ratioCount} per ${lever.perUnits} ${unit}`, `min ${lever.minimum}`];
  if (lever.maximum !== undefined) {
    parts.push(`max ${lever.maximum}`);
  }
  if (lever.distribution === "acrossWindow") {
    parts.push("across window");
  }
  if (lever.rounding !== "ceiling") {
    parts.push(lever.rounding);
  }
  return parts.join(", ");
}

function roundBy(rounding: DemandRounding, value: number): number {
  const epsilon = 1e-9;
  switch (rounding) {
    case "floor":
      return Math.floor(value + epsilon);
    case "nearest":
      return Math.round(value);
    case "ceiling":
    default:
      return Math.ceil(value - epsilon);
  }
}

function capped(lever: DemandLever, count: number): number {
  const cap = lever.maximum === undefined ? undefined : Math.max(0, Math.trunc(lever.maximum));
  return cap === undefined ? count : Math.min(count, cap);
}

function sum(rows: readonly DemandDriverValue[]): number | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  return rows.reduce((total, row) => total + (Number.isFinite(row.value) ? row.value : 0), 0);
}

function latestOnOrBefore(rows: readonly DemandDriverValue[], dateKey: string, withinDays?: number): DemandDriverValue | undefined {
  const floorKey = withinDays === undefined ? undefined : shiftDateKey(dateKey, -(withinDays - 1));
  let best: DemandDriverValue | undefined;
  for (const row of rows) {
    if (row.windowStart > dateKey) {
      continue;
    }
    if (floorKey !== undefined && row.windowStart < floorKey) {
      continue;
    }
    if (!best || row.windowStart > best.windowStart) {
      best = row;
    }
  }
  return best;
}

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function normalizeService(name: string | undefined): string | undefined {
  const trimmed = name?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}
