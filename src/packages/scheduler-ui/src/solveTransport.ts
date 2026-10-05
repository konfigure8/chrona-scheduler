/**
 * The v2 wire for /api/solve (PLAN: solver boundary doctrine). The
 * canonical contract IS the wire: the problem travels verbatim
 * inside the API's routing envelope, and the result is the
 * contract's assignments with the run's outcome (F40: whether a Must
 * rule broke and what is left open). No vendor or solver-mechanics
 * shape appears here - the translation to the Timefold model happens
 * server-side in the solver bridge. The v0 POC wire is retired; its
 * final recordings live in e2e/recordings/v0/ as the equivalence
 * evidence the retirement was proven against.
 */
import type { SolveCapability } from "./capabilities";
import type { ResourceKeyScheme } from "./redaction";
import type { ScheduleProposal, SolveRunStatus } from "./solve";
import { isPinned } from "./locks";
import type {
  ScheduleProblemV2,
  ScheduleSolutionV2,
  SolveSearch,
} from "./schedulingContract";
import type { SchedulerUiEvent, TimeWindow } from "./types";

export interface ChronaSolveRequest {
  /** F39: the calendar's name, for Plan and billing's breakdown by calendar. Display only. */
  readonly calendarName?: string;
  /** Active constraint tiers (F22 deliverable 2, Q4-B): informational
   * envelope metadata - telemetry and a future objective-weight hook,
   * never interpreted against the problem body. The same slot carries
   * F24's mode signal later. */
  readonly capabilities?: readonly SolveCapability[];
  readonly problem: ScheduleProblemV2;
  readonly problemType: "rostering";
  /** F38: stable resource placeholders; a paid plan refuses a request without them. */
  readonly resourceKeyScheme?: ResourceKeyScheme;
  /** F38: the product the calendar names - the free `scheduler` or a paid one. */
  readonly solutionType: string;
  readonly solverSeconds: number;
  readonly tenantId: string;
}

export interface SolveRequestOptions {
  /** F39: the calendar's name (chr_name). */
  readonly calendarName?: string;
  readonly capabilities?: readonly SolveCapability[];
  readonly resourceKeyScheme?: ResourceKeyScheme;
  /** The calendar's product; the recorded wire's `workforce-scheduling` when absent. */
  readonly solutionType?: string;
  readonly solverSeconds: number;
  readonly tenantId: string;
}

/** Wrap a canonical problem in the API's routing envelope. */
export function buildSolveRequest(
  problem: ScheduleProblemV2,
  options: SolveRequestOptions,
): ChronaSolveRequest {
  return {
    ...(options.calendarName ? { calendarName: options.calendarName } : {}),
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    problem,
    problemType: "rostering",
    ...(options.resourceKeyScheme ? { resourceKeyScheme: options.resourceKeyScheme } : {}),
    solutionType: options.solutionType ?? "workforce-scheduling",
    solverSeconds: options.solverSeconds,
    tenantId: options.tenantId,
  };
}

/**
 * The solved result: contract assignments, and from F40 Three-level
 * score whether a Must rule broke and the work left undone. An older
 * API leaves those out.
 */
export interface SolveResultV2 {
  readonly assignments: readonly {
    readonly resourceId: string | null;
    readonly shiftId: string;
  }[];
  readonly contractVersion: "2";
  readonly feasible?: boolean;
  readonly missingDemandHalfHours?: number;
  readonly openShifts?: number;
  /** What the search did; an older API leaves it out. */
  readonly search?: SolveSearch;
}

export interface SolveSubmitResponse {
  readonly pollAfterSeconds?: number;
  readonly runId?: string;
}

export interface SolvePollResponse {
  readonly error?: string;
  readonly result?: SolveResultV2;
  readonly status: "failed" | "queued" | "running" | "succeeded";
}

/** Three counts, each a number the run can have reached. */
function isSearch(search: unknown): search is SolveSearch {
  const record = search as Partial<Record<keyof SolveSearch, unknown>> | undefined;
  return (
    !!record &&
    [record.betterRostersFound, record.rostersChecked, record.solvingMillis].every(
      (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
    )
  );
}

/** Lift a poll result into the canonical solution. */
export function solutionFromPoll(
  runId: string,
  status: SolveRunStatus,
  result: SolveResultV2 | undefined,
  error?: string,
): ScheduleSolutionV2 {
  return {
    assignments: result?.assignments ?? [],
    error,
    ...(result?.feasible !== undefined ? { feasible: result.feasible } : {}),
    ...(result?.missingDemandHalfHours !== undefined
      ? { missingDemandHalfHours: result.missingDemandHalfHours }
      : {}),
    ...(result?.openShifts !== undefined ? { openShifts: result.openShifts } : {}),
    ...(isSearch(result?.search) ? { search: result.search } : {}),
    runId,
    status,
  };
}

export interface ProposalFromSolutionOptions {
  /**
   * The host's resource id for "nobody". With it, an empty assignment
   * takes the person off; without it, an empty assignment leaves the
   * shift as it stands.
   */
  readonly unassignedResourceId?: string;
  /** The period the run solved; the proposal carries it for the scorecard. */
  readonly window?: TimeWindow;
}

/**
 * Turn a solved v2 solution into the UI proposal over current
 * state. Solver runs never move times in this rung, so a proposal
 * event only changes resource and status. An empty assignment takes
 * the person off: under F40 Three-level score the solver leaves a
 * shift open rather than break a Must rule. A locked shift never
 * changes in a run, so an empty assignment leaves it as it stands.
 */
export function proposalFromSolution(
  solution: ScheduleSolutionV2,
  current: readonly SchedulerUiEvent[],
  options: ProposalFromSolutionOptions = {},
): ScheduleProposal {
  const currentById = new Map(current.map((event) => [event.id, event]));
  const events: SchedulerUiEvent[] = [];
  for (const assignment of solution.assignments) {
    const existing = currentById.get(assignment.shiftId);
    if (!existing) {
      continue;
    }
    if (assignment.resourceId) {
      events.push({
        ...existing,
        resourceId: assignment.resourceId,
        status: "assigned",
      });
    } else if (
      options.unassignedResourceId !== undefined &&
      existing.status !== "needsCover" &&
      !isPinned(existing)
    ) {
      events.push({
        ...existing,
        resourceId: options.unassignedResourceId,
        status: "needsCover",
      });
    } else {
      events.push(existing);
    }
  }
  return {
    events,
    ...(solution.feasible !== undefined ? { feasible: solution.feasible } : {}),
    runId: solution.runId,
    ...(solution.search ? { search: solution.search } : {}),
    ...(options.window ? { window: options.window } : {}),
  };
}
