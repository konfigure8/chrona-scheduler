/**
 * The maximum-hours bound for one planning window: a person's weekly
 * capacity scaled to the window's whole weeks. One rule, two callers:
 * problemFromSchedule sends it to the solver as maxHoursPerWindow, and
 * the board's own maximum-hours check judges a roster against it, so
 * the two can never read different limits.
 */

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** The window's length in whole weeks, at least 1. */
export function windowWeeks(window: { readonly end: Date; readonly start: Date }): number {
  return Math.max(1, Math.round((window.end.getTime() - window.start.getTime()) / MS_PER_WEEK));
}

/** The most hours a person with this weekly capacity may work in the window. */
export function maxHoursPerWindow(
  capacityHours: number,
  window: { readonly end: Date; readonly start: Date },
): number {
  return capacityHours * windowWeeks(window);
}
