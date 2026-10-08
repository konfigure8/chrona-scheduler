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
 *
 * /api/solve/analyze answers "Why not…?" at once: the same envelope
 * with one candidate (a person on a shift) in place of a run, and the
 * rule matches the move adds and removes in place of a roster. It
 * queues nothing and starts no run.
 */
import type { SolveCapability } from "./capabilities";
import type { ResourceKeyScheme } from "./redaction";
import type { ScheduleProposal, SolveRunStatus } from "./solve";
import { isPinned } from "./locks";
import {
  isMustRule,
  isShouldRule,
  type CandidateFit,
  type MustBreachCounts,
  type ScheduleCandidate,
  type ScheduleCandidateCheck,
  type ScheduleProblemV2,
  type ScheduleRosterCheck,
  type ScheduleRuleMatch,
  type ScheduleSolutionV2,
  type ScheduleSolveAnalysis,
  type SolveSearch,
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
 * score whether a Must rule broke and the work left undone, with the
 * rule checks before and after. An older API leaves those out.
 */
export interface SolveResultV2 {
  /** Read through solutionFromPoll, which drops an unreadable one whole. */
  readonly analysis?: ScheduleSolveAnalysis;
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

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isText = (value: unknown): value is string => typeof value === "string";

const isTextList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(isText);

const OTHER_NAMED = ["maximumHours", "overlap", "splitParts"] as const;

/**
 * Must counts, whole or not at all. An "other" Must rule this board
 * does not name yet counts as unlisted, so the total stays whole.
 */
function readMustBreaches(value: unknown): MustBreachCounts | undefined {
  const record = asRecord(value);
  const other = asRecord(record?.other);
  if (!record || !other) {
    return undefined;
  }
  const { daysInARow, onLeaveOrUnavailable, restBetweenShifts, skills } = record;
  const { maximumHours, overlap, splitParts } = other;
  if (
    !isCount(daysInARow) ||
    !isCount(onLeaveOrUnavailable) ||
    !isCount(restBetweenShifts) ||
    !isCount(skills) ||
    !isCount(maximumHours) ||
    !isCount(overlap) ||
    !isCount(splitParts)
  ) {
    return undefined;
  }
  let unlisted = 0;
  for (const [rule, count] of Object.entries(other)) {
    if (!isCount(count)) {
      return undefined;
    }
    if (!(OTHER_NAMED as readonly string[]).includes(rule)) {
      unlisted += count;
    }
  }
  return {
    daysInARow,
    onLeaveOrUnavailable,
    other: { maximumHours, overlap, splitParts, unlisted },
    restBetweenShifts,
    skills,
  };
}

/** One readable match of a rule this board names; anything else is left out. */
function readMatch(value: unknown): ScheduleRuleMatch | undefined {
  const record = asRecord(value);
  const rule = record?.rule;
  const shiftIds = record?.shiftIds;
  const resourceId = record?.resourceId;
  const days = record?.days;
  if (
    !isText(rule) ||
    !(isMustRule(rule) || isShouldRule(rule)) ||
    !isTextList(shiftIds) ||
    (resourceId !== undefined && !isText(resourceId)) ||
    (days !== undefined && !isTextList(days))
  ) {
    return undefined;
  }
  return {
    ...(isTextList(days) ? { days } : {}),
    ...(isText(resourceId) ? { resourceId } : {}),
    rule,
    shiftIds,
  };
}

function readMatches(value: unknown): readonly ScheduleRuleMatch[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map(readMatch)
    .filter((match): match is ScheduleRuleMatch => match !== undefined);
}

function readRosterCheck(value: unknown, countsOnly: boolean): ScheduleRosterCheck | undefined {
  const record = asRecord(value);
  const mustBreaches = readMustBreaches(record?.mustBreaches);
  if (!record || !mustBreaches || !isCount(record.openShifts)) {
    return undefined;
  }
  // Counts only: no roster carries matches, whatever came with it.
  const matches = countsOnly ? undefined : readMatches(record.matches);
  return { ...(matches ? { matches } : {}), mustBreaches, openShifts: record.openShifts };
}

/**
 * A run's rule checks, whole or not at all: a missing or unreadable
 * count drops the analysis, so the board shows no counts rather than
 * a wrong one, and never a zero for a count it did not get.
 */
export function readSolveAnalysis(value: unknown): ScheduleSolveAnalysis | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const countsOnly = record.countsOnly === true;
  const current = readRosterCheck(record.current, countsOnly);
  const proposed = readRosterCheck(record.proposed, countsOnly);
  if (!current || !proposed) {
    return undefined;
  }
  return { ...(countsOnly ? { countsOnly: true } : {}), current, proposed };
}

/** Lift a poll result into the canonical solution. */
export function solutionFromPoll(
  runId: string,
  status: SolveRunStatus,
  result: SolveResultV2 | undefined,
  error?: string,
): ScheduleSolutionV2 {
  const analysis = readSolveAnalysis(result?.analysis);
  return {
    ...(analysis ? { analysis } : {}),
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
    ...(solution.analysis ? { analysis: solution.analysis } : {}),
    events,
    ...(solution.feasible !== undefined ? { feasible: solution.feasible } : {}),
    runId: solution.runId,
    ...(solution.search ? { search: solution.search } : {}),
    ...(options.window ? { window: options.window } : {}),
  };
}

/** The "Why not…?" request: the solve envelope with one candidate. */
export interface ChronaCandidateRequest {
  /** F39: the calendar's name. Display only. */
  readonly calendarName?: string;
  /** The person and the shift to check, in the problem's ids. */
  readonly candidate: ScheduleCandidate;
  /** The roster as it would be applied: the current one plus the kept changes. */
  readonly problem: ScheduleProblemV2;
  readonly problemType: "rostering";
  /** F38: stable resource placeholders, as on a solve. */
  readonly resourceKeyScheme?: ResourceKeyScheme;
  /** F38: the calendar's product. */
  readonly solutionType: string;
  readonly tenantId: string;
}

export interface CandidateRequestOptions {
  readonly calendarName?: string;
  readonly resourceKeyScheme?: ResourceKeyScheme;
  /** The calendar's product; `workforce-scheduling` when absent. */
  readonly solutionType?: string;
  readonly tenantId: string;
}

/** Wrap a canonical problem and its candidate in the API's routing envelope. */
export function buildCandidateRequest(
  problem: ScheduleProblemV2,
  candidate: ScheduleCandidate,
  options: CandidateRequestOptions,
): ChronaCandidateRequest {
  return {
    ...(options.calendarName ? { calendarName: options.calendarName } : {}),
    candidate,
    problem,
    problemType: "rostering",
    ...(options.resourceKeyScheme ? { resourceKeyScheme: options.resourceKeyScheme } : {}),
    solutionType: options.solutionType ?? "workforce-scheduling",
    tenantId: options.tenantId,
  };
}

/** The /api/solve/analyze answer: a candidate check in the problem's ids. */
export interface CandidateResponseV2 extends ScheduleCandidateCheck {
  readonly contractVersion: "2";
}

const FITS: ReadonlySet<string> = new Set<CandidateFit>(["better", "equal", "worse"]);

const isFit = (value: unknown): value is CandidateFit => isText(value) && FITS.has(value);

/**
 * A candidate check, or undefined when the answer cannot be read.
 * Matches of rules this board does not name are left out.
 */
export function readCandidateCheck(value: unknown): ScheduleCandidateCheck | undefined {
  const record = asRecord(value);
  const fit = record?.fit;
  const added = readMatches(record?.added);
  const removed = readMatches(record?.removed);
  if (!isFit(fit) || !added || !removed) {
    return undefined;
  }
  return { added, fit, removed };
}
