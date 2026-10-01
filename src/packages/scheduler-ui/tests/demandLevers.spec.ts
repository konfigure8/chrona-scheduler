/**
 * F5 Demand levers: M per N driver units, minimum floor, optional
 * maximum, per-occurrence or across-window distribution, rounding.
 */
import {
  applyLever,
  describeLever,
  resolveOccurrenceUnits,
  resolveSlotCounts,
  resolveWindowUnits,
  type DemandData,
  type DemandDriver,
  type DemandLever,
} from "../src/demandLevers";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const guests: DemandDriver = { driverId: "guests", name: "Guests", unitLabel: "guests", windowKind: "day" };
const services: DemandDriver = { driverId: "covers", name: "Covers", unitLabel: "covers", windowKind: "namedService" };
const weekly: DemandDriver = { driverId: "widgets", name: "Widgets", unitLabel: "widgets", windowKind: "week" };
const custom: DemandDriver = { driverId: "season", name: "Season", unitLabel: "index", windowKind: "custom" };

const waiters: DemandLever = {
  distribution: "perOccurrence",
  driverId: "guests",
  minimum: 2,
  perUnits: 10,
  ratioCount: 1,
  rounding: "ceiling",
};

// "Waiters: 1 per 10 guests, min 2"
assertEqual(applyLever(waiters, 35), 4, "35 guests -> ceil(3.5)");
assertEqual(applyLever(waiters, 30), 3, "30 guests -> 3");
assertEqual(applyLever(waiters, 5), 2, "5 guests floors at min 2");
assertEqual(applyLever(waiters, 0), 2, "0 guests floors at min 2");
assertEqual(applyLever(waiters, undefined), 2, "no value -> min");
assertEqual(applyLever({ ...waiters, rounding: "floor" }, 35), 3, "floor 3.5 -> 3");
assertEqual(applyLever({ ...waiters, rounding: "nearest" }, 35), 4, "nearest 3.5 -> 4");
assertEqual(applyLever({ ...waiters, rounding: "nearest" }, 34), 3, "nearest 3.4 -> 3");
assertEqual(applyLever({ ...waiters, maximum: 3 }, 90), 3, "max caps");
assertEqual(applyLever({ ...waiters, maximum: 1 }, 0), 1, "max caps below min too");
assertEqual(applyLever({ ...waiters, perUnits: 0 }, 50), 2, "per 0 units -> min");
// "Mechanics: 5 per widget"
assertEqual(applyLever({ ...waiters, driverId: "widgets", minimum: 0, perUnits: 1, ratioCount: 5 }, 3), 15, "5 per widget x3");

const demand: DemandData = {
  drivers: [guests, services, weekly, custom],
  values: [
    { driverId: "guests", value: 35, windowStart: "2026-09-07" },
    { driverId: "guests", value: 80, windowStart: "2026-09-11" },
    { driverId: "covers", serviceName: "Dinner", value: 120, windowStart: "2026-09-11" },
    { driverId: "covers", serviceName: "Lunch", value: 40, windowStart: "2026-09-11" },
    { driverId: "widgets", value: 14, windowStart: "2026-09-07" },
    { driverId: "widgets", value: 21, windowStart: "2026-09-14" },
    { driverId: "season", value: 100, windowStart: "2026-06-01" },
    { driverId: "season", value: 200, windowStart: "2026-09-10" },
  ],
};

// Occurrence reads by window kind.
assertEqual(resolveOccurrenceUnits(guests, demand.values, "2026-09-07", undefined), 35, "day exact");
assertEqual(resolveOccurrenceUnits(guests, demand.values, "2026-09-08", undefined), undefined, "day missing");
assertEqual(resolveOccurrenceUnits(services, demand.values, "2026-09-11", "dinner"), 120, "service case-insensitive");
assertEqual(resolveOccurrenceUnits(services, demand.values, "2026-09-11", undefined), undefined, "service needs a name");
assertEqual(resolveOccurrenceUnits(weekly, demand.values, "2026-09-10", undefined), 14, "week row within 7 days");
assertEqual(resolveOccurrenceUnits(weekly, demand.values, "2026-09-14", undefined), 21, "week row on its start");
assertEqual(resolveOccurrenceUnits(weekly, demand.values, "2026-09-25", undefined), undefined, "week row too old");
assertEqual(resolveOccurrenceUnits(custom, demand.values, "2026-09-09", undefined), 100, "custom latest on or before");
assertEqual(resolveOccurrenceUnits(custom, demand.values, "2026-09-10", undefined), 200, "custom step");
assertEqual(resolveOccurrenceUnits(custom, demand.values, "2026-05-01", undefined), undefined, "custom before first row");

// Window totals.
assertEqual(resolveWindowUnits(guests, demand.values, "2026-09-07", "2026-09-14", undefined), 115, "day sum in period");
assertEqual(resolveWindowUnits(services, demand.values, "2026-09-07", "2026-09-14", "Dinner"), 120, "service sum");
assertEqual(resolveWindowUnits(weekly, demand.values, "2026-09-07", "2026-09-21", undefined), 35, "week rows in fortnight");
assertEqual(resolveWindowUnits(custom, demand.values, "2026-09-07", "2026-09-14", undefined), 100, "custom at period start");

// Per occurrence: each date its own count.
const perDay = resolveSlotCounts({
  demand,
  lever: waiters,
  occurrenceDateKeys: ["2026-09-07", "2026-09-08", "2026-09-11"],
  periodEndKey: "2026-09-14",
  periodStartKey: "2026-09-07",
});
assertEqual(perDay.get("2026-09-07"), 4, "Mon 35 guests -> 4");
assertEqual(perDay.get("2026-09-08"), 2, "Tue no value -> min 2");
assertEqual(perDay.get("2026-09-11"), 8, "Fri 80 guests -> 8");

// Across window: the period's total spread over occurrences, then each rounded/floored/capped.
const spread = resolveSlotCounts({
  demand,
  lever: { ...waiters, distribution: "acrossWindow" },
  occurrenceDateKeys: ["2026-09-07", "2026-09-08", "2026-09-09"],
  periodEndKey: "2026-09-14",
  periodStartKey: "2026-09-07",
});
assertEqual(spread.get("2026-09-07"), 4, "115 guests / 3 days = 38.3 -> ceil(3.83) = 4");
assertEqual(spread.get("2026-09-09"), 4, "same share each day");

const spreadWeekly = resolveSlotCounts({
  demand,
  lever: { distribution: "acrossWindow", driverId: "widgets", minimum: 0, perUnits: 1, ratioCount: 5, rounding: "floor" },
  occurrenceDateKeys: ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"],
  periodEndKey: "2026-09-14",
  periodStartKey: "2026-09-07",
});
assertEqual(spreadWeekly.get("2026-09-07"), 17, "14 widgets x5 / 4 days = 17.5 -> floor 17");

// Unknown driver: the minimum everywhere.
const orphan = resolveSlotCounts({
  demand,
  lever: { ...waiters, driverId: "missing" },
  occurrenceDateKeys: ["2026-09-07"],
  periodEndKey: "2026-09-14",
  periodStartKey: "2026-09-07",
});
assertEqual(orphan.get("2026-09-07"), 2, "unknown driver -> min");

assertEqual(describeLever(waiters, guests), "1 per 10 guests, min 2", "describe");
assertEqual(describeLever({ ...waiters, distribution: "acrossWindow", maximum: 6, rounding: "floor" }, undefined), "1 per 10 units, min 2, max 6, across window, floor", "describe full");

console.log("demandLevers tests passed");
