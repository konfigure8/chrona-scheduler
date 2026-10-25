/**
 * The v2 wire (PLAN: solver boundary doctrine). The canonical contract
 * IS the wire: the problem travels verbatim, and the result is the
 * contract's assignments with the run's outcome (F40: whether a Must
 * rule broke and what is left open). No vendor or solver-mechanics
 * shape appears here - the translation to the Timefold model happens
 * server-side in the solver bridge.
 *
 * Runs go through each product's API, version 1 (F61 Product APIs,
 * R2.15): Timefold's run lifecycle - submit, read, stop - with the
 * problem as `modelInput` and the run's length as
 * `config.run.termination.spentLimit`. /api/solve stays for controls
 * released before it.
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
import { boardRules, type ExtensionMatchKinds } from "./ruleRegistry";
import {
  isMustRule,
  isShouldRule,
  type CandidateFit,
  type MustBreachCounts,
  type NightRuleKind,
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

/** F61 Product APIs: each product's API, version 1. */
const PRODUCT_API_PATHS: Readonly<Record<string, string>> = {
  scheduler: "/api/scheduler/v1",
  "workforce-scheduling": "/api/workforce-scheduling/v1",
};

/**
 * The path of the product's v1 API. A calendar that names no product is
 * the recorded wire's `workforce-scheduling`, as `buildSolveRequest`
 * reads it; a product without its own API is the free scheduler's.
 */
export function productApiPath(solutionType: string | undefined): string {
  return PRODUCT_API_PATHS[solutionType ?? "workforce-scheduling"] ?? "/api/scheduler/v1";
}

/** A run as a product's v1 API takes it: Timefold's model request on Chrona's contract. */
export interface ProductRunRequest {
  readonly config: {
    /** F39 and F38: the calendar's name and how its people are keyed. */
    readonly context: { readonly calendarName?: string; readonly resourceKeyScheme?: ResourceKeyScheme };
    /** The run's length, as an ISO-8601 duration. */
    readonly run: { readonly termination: { readonly spentLimit: string } };
  };
  readonly modelInput: ScheduleProblemV2;
}

export interface ProductRunOptions {
  readonly calendarName?: string;
  readonly resourceKeyScheme?: ResourceKeyScheme;
  readonly solverSeconds: number;
}

/** Wrap a canonical problem as a product API's run request. */
export function buildProductRunRequest(problem: ScheduleProblemV2, options: ProductRunOptions): ProductRunRequest {
  return {
    config: {
      context: {
        ...(options.calendarName ? { calendarName: options.calendarName } : {}),
        ...(options.resourceKeyScheme ? { resourceKeyScheme: options.resourceKeyScheme } : {}),
      },
      run: { termination: { spentLimit: `PT${Math.max(1, Math.trunc(options.solverSeconds))}S` } },
    },
    modelInput: problem,
  };
}

/** Timefold's run states, as a product's v1 API reports them. */
export type ProductRunStatus =
  | "SOLVING_ACTIVE"
  | "SOLVING_COMPLETED"
  | "SOLVING_FAILED"
  | "SOLVING_INCOMPLETE"
  | "SOLVING_SCHEDULED";

/** A run's lifecycle, as Timefold's metadata. */
export interface ProductRunMetadata {
  readonly failureMessage?: string;
  readonly id: string;
  readonly solverStatus: ProductRunStatus;
}

/**
 * A run and its roster: the result once the run has one. A stopped run
 * (SOLVING_INCOMPLETE) carries the best roster found so far, or none.
 */
export interface ProductRunResponse {
  readonly metadata: ProductRunMetadata;
  readonly modelOutput?: SolveResultV2 | null;
}

export interface ChronaSolveRequest {
  /** F39: the calendar's name, for Plan and billing's breakdown by calendar. Display only. */
  readonly calendarName?: string;
  /** Active constraint tiers (F22 deliverable 2, Q4-B): informational
   * envelope metadata - telemetry and a future objective-weight hook,
   * never interpreted against the problem body. F24's repair intent
   * changes what the solver does, so it travels in the problem
   * (ScheduleProblemV2.repair), not here. */
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

const OTHER_NAMED = ["overlap", "splitParts"] as const;

/**
 * Must counts, whole or not at all. An "other" Must rule this board
 * does not name yet counts as unlisted, so the total stays whole. An
 * API from before the site rule (F63 Person sites) sends no site
 * count, and one from before the Nights rules no nights count: none.
 */
function readMustBreaches(value: unknown): MustBreachCounts | undefined {
  const record = asRecord(value);
  const other = asRecord(record?.other);
  if (!record || !other) {
    return undefined;
  }
  const { daysInARow, onLeaveOrUnavailable, restBetweenShifts, skills } = record;
  const site = record.site ?? 0;
  // R2.18: an API from before the agreement rows sends maximum hours under "other" and the
  // agreement rules' other breaches as other rules; its total stays whole either way.
  const before = record.maximumHours === undefined;
  const maximumHours = before ? (other.maximumHours ?? 0) : record.maximumHours;
  const daysOff = record.daysOff ?? 0;
  const weeklyRest = record.weeklyRest ?? 0;
  const averageHours = record.averageHours ?? 0;
  const nights = record.nights ?? 0;
  // A package's own rows (ruleRegistry.ts), by name; an API from before a row sends none: 0.
  const extensionCounts: Record<string, number> = {};
  for (const entry of boardRules().mustRows ?? []) {
    const count = (record as Readonly<Record<string, unknown>>)[entry.row] ?? 0;
    if (!isCount(count)) {
      return undefined;
    }
    extensionCounts[entry.row] = count;
  }
  const { overlap, splitParts } = other;
  if (
    !isCount(daysInARow) ||
    !isCount(onLeaveOrUnavailable) ||
    !isCount(restBetweenShifts) ||
    !isCount(skills) ||
    !isCount(site) ||
    !isCount(maximumHours) ||
    !isCount(daysOff) ||
    !isCount(weeklyRest) ||
    !isCount(averageHours) ||
    !isCount(nights) ||
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
    if (!(OTHER_NAMED as readonly string[]).includes(rule) && !(before && rule === "maximumHours")) {
      unlisted += count;
    }
  }
  return {
    ...extensionCounts,
    averageHours,
    daysInARow,
    daysOff,
    maximumHours,
    nights,
    onLeaveOrUnavailable,
    other: { overlap, splitParts, unlisted },
    restBetweenShifts,
    site,
    skills,
    weeklyRest,
  };
}

/** The Nights rules a match can name. */
const NIGHT_KINDS: ReadonlySet<string> = new Set<NightRuleKind>([
  "nightShiftHours",
  "nightShifts",
  "nightShiftsInARow",
  "restAfterNight",
  "restAfterNights",
]);


/** One readable match of a rule this board names; anything else is left out. */
function readMatch(value: unknown): ScheduleRuleMatch | undefined {
  const record = asRecord(value);
  const rule = record?.rule;
  const shiftIds = record?.shiftIds;
  const resourceId = record?.resourceId;
  const days = record?.days;
  const kind = record?.kind;
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
    ...(rule === "nights" && isText(kind) && NIGHT_KINDS.has(kind) ? { kind: kind as NightRuleKind } : {}),
    // A package's own rule names its kinds (ruleRegistry.ts).
    ...(rule !== "nights" && isText(kind) && boardRules().matchKinds?.[rule]?.includes(kind)
      ? { kind: kind as keyof ExtensionMatchKinds }
      : {}),
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
