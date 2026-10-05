/**
 * The Chrona canonical scheduling contract, v2 (PLAN: solver
 * boundary doctrine). It models scheduling FACTS AND INTENT in our
 * names - never solver mechanics, vendor field names, constraint
 * names, or score levels. Adapters translate it to whatever a
 * solver backend speaks (today: the v0 POC payload in
 * solveTransport.ts); vendor JSON stops at those adapters.
 *
 * v2 is scoped STRICTLY to capabilities already present or
 * independently ratified: window, resources with skills and the
 * implemented contract/cost facts, unavailability, shifts with
 * times/required skills/assignment/pinned, and the run result we
 * already expose. Generation, hourly demand, disruption policies,
 * recommendations, and richer award rules are additive later, when
 * their product rungs are designed independently.
 *
 * Dates are ISO-8601 strings with explicit offsets: the contract is
 * a wire format, and hosts own timezone conversion at their
 * boundary. They are real moments: a host converts its board's
 * display dates back before they go on the wire (toInstant), and
 * names the site's time zone so the solver counts days, nights and
 * paid hours as the site's clock does.
 */
import { isPinned } from "./locks";
import type { AvailabilityBand, SchedulerResource, SchedulerUiEvent } from "./types";

/** Contract polarity per Docs/domain_model.md section 1. */
export type ResourceContractType = "casual" | "fixed" | "minMax";

export interface ScheduleContractResource {
  /** Hours bounds apply per solve window; omit to disable a bound. */
  readonly contract?: {
    readonly maxHoursPerWindow?: number;
    readonly minHoursPerWindow?: number;
    readonly type: ResourceContractType;
  };
  /** Employer cost in cents per hour; omitted = unknown, cost skipped. */
  readonly costCentsPerHour?: number;
  readonly id: string;
  readonly name: string;
  readonly skills: readonly string[];
}

export interface ScheduleContractShift {
  /** Present = an existing assignment (a fact); pinned = intent that
   * the solver must not change it. Absent = the shift is open. */
  readonly assignment?: {
    readonly pinned: boolean;
    readonly resourceId: string;
  };
  readonly end: string;
  readonly id: string;
  readonly requiredSkills: readonly string[];
  readonly start: string;
  readonly title: string;
}

export interface ScheduleContractUnavailability {
  readonly end: string;
  readonly resourceId: string;
  readonly start: string;
}

export interface ScheduleProblemV2 {
  readonly contractVersion: "2";
  readonly resources: readonly ScheduleContractResource[];
  readonly shifts: readonly ScheduleContractShift[];
  /**
   * The site's time zone: an IANA name such as "Australia/Perth", or a
   * fixed offset such as "+10:00" when the host knows only that. The
   * solver counts days, nights and paid hours on this clock. Absent =
   * UTC.
   */
  readonly timeZone?: string;
  readonly unavailability: readonly ScheduleContractUnavailability[];
  /** The planning window this problem covers (roster period scope). */
  readonly window: { readonly end: string; readonly start: string };
}

export type ScheduleRunStatus = "failed" | "queued" | "running" | "succeeded";

/**
 * What the search did to find the roster (the review's scorecard): the
 * rosters it checked, how many times it found a better one, and how long
 * it searched. A fact about the run, never the solver's score.
 */
export interface SolveSearch {
  readonly betterRostersFound: number;
  readonly rostersChecked: number;
  readonly solvingMillis: number;
}

export interface ScheduleSolutionV2 {
  /** One entry per shift; null = the solver left it unassigned. */
  readonly assignments: readonly {
    readonly resourceId: string | null;
    readonly shiftId: string;
  }[];
  readonly error?: string;
  /** No Must rule broken (F40). Absent when the answer does not say. */
  readonly feasible?: boolean;
  /** Missing people per half-hour below a time-of-day minimum. */
  readonly missingDemandHalfHours?: number;
  /** Required shifts the run left open. */
  readonly openShifts?: number;
  readonly runId: string;
  /** What the search did. Absent when the answer does not say. */
  readonly search?: SolveSearch;
  readonly status: ScheduleRunStatus;
}

export interface ProblemFromScheduleInput {
  readonly events: readonly SchedulerUiEvent[];
  /**
   * A planner plans ahead and does not change history (F31 rework):
   * an assigned shift that started before this instant travels
   * pinned, and still counts toward the window's totals; an open one
   * that started before it stays out. Absent = no history.
   */
  readonly now?: Date;
  /** Override: pin EVERY existing assignment. Absent = the ruled
   * default (F22 deliverable 2, Q1-A): pinning is a choice, not a
   * default - only an item whose lock forbids reassignment is pinned;
   * everything else is movable. */
  readonly pinAssigned?: boolean;
  readonly resources: readonly SchedulerResource[];
  /** The site's time zone, passed on to the solver (ScheduleProblemV2.timeZone). */
  readonly timeZone?: string;
  /**
   * Turns a board date back into the real moment it stands for. The
   * board works in display dates, whose local reading is the site's
   * clock; the wire carries moments. Absent = the dates already are
   * moments.
   */
  readonly toInstant?: (display: Date) => Date;
  readonly unavailability?: readonly AvailabilityBand[];
  readonly window: { readonly end: Date; readonly start: Date };
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Build a v2 problem from the UI's schedule state (host boundary). */
export function problemFromSchedule(
  input: ProblemFromScheduleInput,
): ScheduleProblemV2 {
  // Hours tier: weekly capacity scales to the solve window.
  const windowWeeks = Math.max(
    1,
    Math.round(
      (input.window.end.getTime() - input.window.start.getTime()) / MS_PER_WEEK,
    ),
  );
  const now = input.now;
  const wire = (date: Date): string => (input.toInstant ? input.toInstant(date) : date).toISOString();
  // An open shift that has started is history nobody worked: it stays out.
  // So does a pinned open shift: the solver leaves a pin alone, so it stays open.
  const shifts = input.events.filter(
    (event) =>
      !(now && event.status === "needsCover" && event.start < now) &&
      !(event.status === "needsCover" && isPinned(event)),
  );
  return {
    contractVersion: "2",
    resources: input.resources.map((resource) => ({
      ...(resource.capacityHours !== undefined
        ? {
            // A weekly capacity is a MAXIMUM on an available-unless-excepted
            // person (domain model section 1: fixed / min-max polarity).
            // "casual" would flip the polarity to unavailable-unless-declared
            // and, with no declared availability, nothing could be assigned -
            // found in the F26 stage 3 real-grid pass.
            contract: {
              maxHoursPerWindow: resource.capacityHours * windowWeeks,
              type: "fixed" as const,
            },
          }
        : {}),
      ...(resource.costCentsPerHour !== undefined
        ? { costCentsPerHour: resource.costCentsPerHour }
        : {}),
      id: resource.id,
      name: resource.name,
      skills: resource.tags ?? [],
    })),
    shifts: shifts.map((event) => ({
      assignment:
        event.status === "needsCover"
          ? undefined
          : {
              // Context outside the window (the day before and after, sent so rest
              // rules see across its edges) is pinned: nothing outside the window changes.
              // So is history: a shift that has started.
              pinned:
                event.start < input.window.start ||
                event.start >= input.window.end ||
                (now !== undefined && event.start < now) ||
                // The override adds pins; it never takes one away.
                input.pinAssigned === true ||
                isPinned(event),
              resourceId: event.resourceId,
            },
      end: wire(event.end),
      id: event.id,
      requiredSkills: event.requiredTags ?? [],
      start: wire(event.start),
      title: event.title,
    })),
    unavailability: (input.unavailability ?? [])
      .filter((band) => band.kind === "unavailable")
      .map((band) => ({
        end: wire(band.end),
        resourceId: band.resourceId,
        start: wire(band.start),
      })),
    ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    window: {
      end: wire(input.window.end),
      start: wire(input.window.start),
    },
  };
}
