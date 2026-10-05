/**
 * Roster periods (domain model section 6): the planning blocks a
 * roster is organized, solved, and later published in. Periods
 * DERIVE from maker configuration - a block unit plus an anchor -
 * so gaps, overlaps, and out-of-range blocks are impossible by
 * construction (the alternative, hand-made period rows, is the
 * PowerRoster failure mode). This module is pure mechanism; hosts
 * store the config (harness panel today, a chr_ column with the
 * rule-set design). Statuses, publishing, and versions are later
 * rungs on the same concept.
 */

export type PeriodUnit = "fortnight" | "month" | "week";

export interface SchedulerPeriodConfig {
  /**
   * A date inside any block, fixing the grid's phase: for weeks and
   * fortnights, blocks run in whole units from this date's midnight;
   * months ignore it and follow the calendar.
   */
  readonly anchor: Date;
  readonly unit: PeriodUnit;
}

export interface RosterPeriod {
  /** Exclusive end (the next block's first midnight). */
  readonly end: Date;
  readonly start: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** The period containing `date` under the configured grid. */
export function periodContaining(
  config: SchedulerPeriodConfig,
  date: Date,
): RosterPeriod {
  if (config.unit === "month") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return { end, start };
  }
  const lengthDays = config.unit === "fortnight" ? 14 : 7;
  const anchor = startOfDay(config.anchor);
  const target = startOfDay(date);
  // Whole days between anchor and target, robust across DST because
  // both are local midnights.
  const daysFromAnchor = Math.round(
    (target.getTime() - anchor.getTime()) / DAY_MS,
  );
  const blockIndex = Math.floor(daysFromAnchor / lengthDays);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() + blockIndex * lengthDays);
  const end = new Date(start);
  end.setDate(start.getDate() + lengthDays);
  return { end, start };
}

/**
 * The days the Roster grid shows (F31 rework, batch 2): the whole
 * roster period holding the anchor when the board has one - a week,
 * a fortnight or a month - else undefined, and the toolbar's interval
 * decides. Both hosts use it, so the grid and its navigation agree.
 */
export function rosterPeriodWindow(
  view: string | undefined,
  config: SchedulerPeriodConfig | undefined,
  anchor: Date,
): RosterPeriod | undefined {
  if (view !== "roster" || !config) {
    return undefined;
  }
  const period = periodContaining(config, anchor);
  return { end: period.end, start: period.start };
}

/** The block after (+1) or before (-1) the one containing `date`. */
export function stepPeriod(
  config: SchedulerPeriodConfig,
  date: Date,
  direction: -1 | 1,
): RosterPeriod {
  const current = periodContaining(config, date);
  const probe = new Date(
    direction === 1
      ? current.end.getTime() + DAY_MS / 2
      : current.start.getTime() - DAY_MS / 2,
  );
  return periodContaining(config, probe);
}

/** 1-based day number of `date` inside its period, and the length. */
export function dayOfPeriod(
  period: RosterPeriod,
  date: Date,
): { readonly day: number; readonly days: number } {
  const start = startOfDay(period.start);
  const days = Math.round(
    (startOfDay(new Date(period.end.getTime() - 1)).getTime() -
      start.getTime()) /
      DAY_MS,
  ) + 1;
  const day =
    Math.round((startOfDay(date).getTime() - start.getTime()) / DAY_MS) + 1;
  return { day: Math.min(Math.max(day, 1), days), days };
}

/** Period starts that fall strictly inside the given range. */
export function periodBoundariesInRange(
  config: SchedulerPeriodConfig,
  rangeStart: Date,
  rangeEnd: Date,
): readonly Date[] {
  const boundaries: Date[] = [];
  let cursor = periodContaining(config, rangeStart);
  for (let guard = 0; guard < 120; guard += 1) {
    const boundary = cursor.end;
    if (boundary.getTime() >= rangeEnd.getTime()) {
      break;
    }
    if (boundary.getTime() > rangeStart.getTime()) {
      boundaries.push(boundary);
    }
    cursor = periodContaining(
      config,
      new Date(boundary.getTime() + DAY_MS / 2),
    );
  }
  return boundaries;
}
