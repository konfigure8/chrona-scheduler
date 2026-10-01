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
 * boundary.
 */
import { isResourceLocked } from "./locks";
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
  readonly unavailability: readonly ScheduleContractUnavailability[];
  /** The planning window this problem covers (roster period scope). */
  readonly window: { readonly end: string; readonly start: string };
}

export type ScheduleRunStatus = "failed" | "queued" | "running" | "succeeded";

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
  readonly status: ScheduleRunStatus;
}

export interface ProblemFromScheduleInput {
  readonly events: readonly SchedulerUiEvent[];
  /** Override: pin EVERY existing assignment. Absent = the ruled
   * default (F22 deliverable 2, Q1-A): pinning is a choice, not a
   * default - only an item whose lock forbids reassignment is pinned;
   * everything else is movable. */
  readonly pinAssigned?: boolean;
  readonly resources: readonly SchedulerResource[];
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
    shifts: input.events.map((event) => ({
      assignment:
        event.status === "needsCover"
          ? undefined
          : {
              // Context outside the window (the day before and after, sent so rest
              // rules see across its edges) is pinned: nothing outside the window changes.
              pinned:
                event.start < input.window.start ||
                event.start >= input.window.end ||
                (input.pinAssigned ?? isResourceLocked(event)),
              resourceId: event.resourceId,
            },
      end: event.end.toISOString(),
      id: event.id,
      requiredSkills: event.requiredTags ?? [],
      start: event.start.toISOString(),
      title: event.title,
    })),
    unavailability: (input.unavailability ?? [])
      .filter((band) => band.kind === "unavailable")
      .map((band) => ({
        end: band.end.toISOString(),
        resourceId: band.resourceId,
        start: band.start.toISOString(),
      })),
    window: {
      end: input.window.end.toISOString(),
      start: input.window.start.toISOString(),
    },
  };
}
