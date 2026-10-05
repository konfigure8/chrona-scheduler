import type { SchedulerRulesConfig } from "./scheduleRules";
import type { SchedulerResource, SchedulerUiEvent, TimeWindow } from "./types";

/** A fixture dataset: the board's people and items in a window. */
export interface FixtureSchedule {
  readonly events: readonly SchedulerUiEvent[];
  readonly now: Date;
  readonly resources: readonly SchedulerResource[];
  readonly window: TimeWindow;
}

/**
 * The demo's rules: the harness config panel edits a copy of this; e2e
 * drives it. The 05:00-24:00 window preserves the original demo's
 * site-hours block.
 */
export const demoRulesConfig: SchedulerRulesConfig = {
  crossGroupPolicy: "warn",
  minimumBreakMinutes: 60,
  minimumBreakPolicy: "warn",
  overlapPolicy: "warn",
  workingEndHour: 24,
  workingHoursPolicy: "block",
  workingStartHour: 5,
};

/**
 * Straight-from-the-gallery data: the minimal mapping a builder
 * starts with - resources with names, events with title/times/
 * status. No tags, groups, capacity, demand, bands, locks,
 * templates, or lifecycle: every Chrona layer absent, so the
 * harness shows exactly how the unconfigured control behaves.
 */
export function buildPlainFixture(): FixtureSchedule {
  const day = (dayOffset: number, hour: number): Date =>
    new Date(2026, 7, 17 + dayOffset, hour, 0, 0, 0);

  const resources: readonly SchedulerResource[] = [
    { id: "p-1", name: "Alex Chen" },
    { id: "p-2", name: "Riley Patel" },
    { id: "p-3", name: "Jordan Lee" },
    { id: "p-4", name: "Morgan Diaz" },
    { id: "p-5", name: "Sam Ortiz" },
  ];

  const shift = (
    id: string,
    resourceId: string,
    dayOffset: number,
    startHour: number,
    endHour: number,
    title: string,
  ): SchedulerUiEvent => ({
    end: day(dayOffset, endHour),
    id,
    resourceId,
    start: day(dayOffset, startHour),
    status: "assigned",
    title,
  });

  return {
    events: [
      shift("pl-01", "p-1", 0, 9, 17, "Morning shift"),
      shift("pl-02", "p-2", 0, 12, 20, "Afternoon shift"),
      shift("pl-03", "p-3", 0, 8, 12, "Site visit"),
      shift("pl-04", "p-4", 1, 9, 17, "Morning shift"),
      shift("pl-05", "p-5", 1, 13, 21, "Late shift"),
      shift("pl-06", "p-1", 2, 9, 17, "Morning shift"),
      {
        end: day(0, 22),
        id: "pl-open-1",
        resourceId: "open",
        start: day(0, 18),
        status: "needsCover",
        title: "Evening cover",
      },
      {
        end: day(1, 12),
        id: "pl-open-2",
        resourceId: "open",
        start: day(1, 8),
        status: "needsCover",
        title: "Morning cover",
      },
    ],
    now: day(0, 9),
    resources,
    window: { end: day(3, 0), start: day(0, 0) },
  };
}
