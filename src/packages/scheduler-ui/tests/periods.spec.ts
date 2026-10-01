import {
  dayOfPeriod,
  periodBoundariesInRange,
  periodContaining,
  stepPeriod,
} from "../src/periods";

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

const anchor = new Date(2026, 7, 17); // Monday 17 Aug 2026
const fortnight = { anchor, unit: "fortnight" as const };
const week = { anchor, unit: "week" as const };
const month = { anchor, unit: "month" as const };

function fortnightGridHasNoGapsAndCoversAnyDate(): void {
  const inside = periodContaining(fortnight, new Date(2026, 7, 25, 13));
  assertEqual(inside.start.getTime(), new Date(2026, 7, 17).getTime());
  assertEqual(inside.end.getTime(), new Date(2026, 7, 31).getTime());
  // A date long before the anchor still lands in a well-formed block.
  const early = periodContaining(fortnight, new Date(2026, 0, 5));
  assertEqual(
    Math.round((early.end.getTime() - early.start.getTime()) / 86400000),
    14,
  );
  assertEqual(early.start <= new Date(2026, 0, 5), true);
  assertEqual(early.end > new Date(2026, 0, 5), true);
}

function weekAndMonthUnitsFollowTheirCalendars(): void {
  const oneWeek = periodContaining(week, new Date(2026, 7, 23));
  assertEqual(oneWeek.start.getTime(), new Date(2026, 7, 17).getTime());
  assertEqual(oneWeek.end.getTime(), new Date(2026, 7, 24).getTime());
  const aug = periodContaining(month, new Date(2026, 7, 5));
  assertEqual(aug.start.getTime(), new Date(2026, 7, 1).getTime());
  assertEqual(aug.end.getTime(), new Date(2026, 8, 1).getTime());
}

function steppingWalksWholeBlocksBothWays(): void {
  const next = stepPeriod(fortnight, new Date(2026, 7, 20), 1);
  assertEqual(next.start.getTime(), new Date(2026, 7, 31).getTime());
  const previous = stepPeriod(fortnight, new Date(2026, 7, 20), -1);
  assertEqual(previous.start.getTime(), new Date(2026, 7, 3).getTime());
  const nextMonth = stepPeriod(month, new Date(2026, 7, 20), 1);
  assertEqual(nextMonth.start.getTime(), new Date(2026, 8, 1).getTime());
}

function dayCountsReadOneBased(): void {
  const period = periodContaining(fortnight, new Date(2026, 7, 17));
  const first = dayOfPeriod(period, new Date(2026, 7, 17, 9));
  assertEqual(first.day, 1);
  assertEqual(first.days, 14);
  const last = dayOfPeriod(period, new Date(2026, 7, 30, 23));
  assertEqual(last.day, 14);
}

function boundariesInsideARangeAreExactlyTheBlockEdges(): void {
  const boundaries = periodBoundariesInRange(
    week,
    new Date(2026, 7, 17),
    new Date(2026, 8, 1),
  );
  assertEqual(boundaries.length, 2);
  assertEqual(boundaries[0]?.getTime(), new Date(2026, 7, 24).getTime());
  assertEqual(boundaries[1]?.getTime(), new Date(2026, 7, 31).getTime());
  // A range inside one block has no boundaries.
  assertEqual(
    periodBoundariesInRange(fortnight, new Date(2026, 7, 18), new Date(2026, 7, 20)).length,
    0,
  );
}

fortnightGridHasNoGapsAndCoversAnyDate();
weekAndMonthUnitsFollowTheirCalendars();
steppingWalksWholeBlocksBothWays();
dayCountsReadOneBased();
boundariesInsideARangeAreExactlyTheBlockEdges();

console.log("periods tests passed");
