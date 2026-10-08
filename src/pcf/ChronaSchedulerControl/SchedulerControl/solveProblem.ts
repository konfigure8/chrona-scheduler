import {
  problemFromSchedule,
  type ScheduleProblemV2,
  type SchedulerResource,
  type SchedulerUiEvent,
} from "@chrona/scheduler-ui";

/** How the board's dates, which read the site's clock, become real moments on the wire. */
export interface SolveClock {
  /** The site's zone the solver counts days and paid hours in, at a moment. */
  readonly solverZone: (at: Date) => string;
  /** Turns a board date back into the real moment it stands for. */
  readonly toStored: (display: Date) => Date;
}

export interface SolveProblemInput {
  readonly events: readonly SchedulerUiEvent[];
  /** What had started by this instant travels pinned (F31 rework). */
  readonly now: Date;
  readonly resources: readonly SchedulerResource[];
  readonly window: { readonly end: Date; readonly start: Date };
}

/**
 * The solve problem for a window. A new run and a resumed run both build
 * it here, so an unchanged schedule hashes the same on resume: the wire
 * carries real moments and the site's zone (ruled 2026-10-02).
 */
export function buildSolveProblem(input: SolveProblemInput, clock: SolveClock): ScheduleProblemV2 {
  return problemFromSchedule({
    events: input.events,
    now: input.now,
    resources: input.resources,
    timeZone: clock.solverZone(clock.toStored(input.window.start)),
    toInstant: clock.toStored,
    window: input.window,
  });
}
