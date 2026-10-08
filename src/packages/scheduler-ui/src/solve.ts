/**
 * Solve/proposal lifecycle, copied from the real exchange (the
 * solver-api /api/solve endpoint and the POC client that consumes
 * it): submit returns a run id and a poll hint; polling returns
 * queued | running | succeeded | failed; a succeeded result carries
 * the COMPLETE solved schedule. The solver never sends a change
 * list - the diff against current state is computed here.
 * scripts/smoke-sql-backed-solve.ps1 is the level-0 proof of the
 * local path.
 */
import type { RulePolicy } from "./scheduleRules";
import {
  isMustRule,
  type MustBreachCounts,
  type MustRuleName,
  type ScheduleRuleMatch,
  type ScheduleSolveAnalysis,
  type SolveSearch,
} from "./schedulingContract";
import { clockMinutesBetween } from "./timeZone";
import type { SchedulerUiEvent, TimeWindow } from "./types";

export type SolveRunStatus = "failed" | "queued" | "running" | "succeeded";

/** What the surface renders about an in-flight or failed solve. */
export interface SolveState {
  readonly message?: string;
  /** "quota" = the server refused with 402 quota_exceeded (F19: the
   * daily free solve limit). The surface renders the calm quota
   * notice for this instead of the red failure line. "read" = the host
   * could not read what the solve needs, so nothing was sent (design
   * R14, D22): the surface renders `message` as a warning notice with
   * Try again, which asks for the solve again. */
  readonly reason?: "quota" | "read";
  readonly status: "failed" | "idle" | "queued" | "running";
}

/** Server-reported free-tier solve allowance (F19: the client only
 * displays these numbers - it never computes quota itself). */
export interface SolveQuotaDisplay {
  readonly dailySolveLimit: number;
  readonly onUpgrade?: () => void;
  /** F26: "Open Chrona account" deep link from the session; absent = no link. */
  readonly portalUrl?: string;
  readonly remainingSolves: number;
}

/** F26 stage 3: a run the session reported for this calendar that the
 * planner has not dealt with - finished unreviewed, still running, or
 * finished against a schedule that has changed since. */
export interface ResumeRunDisplay {
  readonly kind: "changed" | "finished" | "running";
  readonly onDiscard: () => void;
  /** Review a finished run, or follow a running one. Absent for "changed". */
  readonly onReview?: () => void;
  readonly runId: string;
}

export const idleSolveState: SolveState = { status: "idle" };

/** A solver answer mapped into UI events (complete schedule slice). */
export interface ScheduleProposal {
  /**
   * The run's rule checks, on the real ids: counts and matches for the
   * roster before and after. Absent when the run was not analysed.
   */
  readonly analysis?: ScheduleSolveAnalysis;
  readonly events: readonly SchedulerUiEvent[];
  /** F40 Three-level score: the whole proposal breaks no Must rule. Absent when the answer does not say. */
  readonly feasible?: boolean;
  readonly runId: string;
  /** What the search did to find it; absent when the answer does not say. */
  readonly search?: SolveSearch;
  /**
   * The period the run solved. The scorecard counts the shifts that
   * start in it, so its figures match the change list and Apply.
   * Absent when the host does not say; the board's window stands in.
   */
  readonly window?: TimeWindow;
}

/** One difference between the current schedule and the proposal. */
export interface ProposalChange {
  /** The current event, matched by id. */
  readonly current: SchedulerUiEvent;
  /**
   * "assign" fills an uncovered item; "unassign" takes the person off
   * and leaves it open (F40); "move" changes person/times.
   */
  readonly kind: "assign" | "move" | "unassign";
  readonly proposed: SchedulerUiEvent;
}

/**
 * Compare the proposal against current state by event id. Items the
 * solver returned unchanged produce no entry; items it does not know
 * stay untouched.
 */
export function diffProposal(
  current: readonly SchedulerUiEvent[],
  proposal: ScheduleProposal,
): readonly ProposalChange[] {
  const byId = new Map(current.map((event) => [event.id, event]));
  const changes: ProposalChange[] = [];
  for (const proposed of proposal.events) {
    const existing = byId.get(proposed.id);
    if (!existing) {
      continue;
    }
    const moved =
      existing.resourceId !== proposed.resourceId ||
      existing.start.getTime() !== proposed.start.getTime() ||
      existing.end.getTime() !== proposed.end.getTime();
    const assigned =
      existing.status === "needsCover" && proposed.status !== "needsCover";
    const unassigned =
      existing.status !== "needsCover" && proposed.status === "needsCover";
    if (!moved && !assigned && !unassigned) {
      continue;
    }
    changes.push({
      current: existing,
      kind: assigned ? "assign" : unassigned ? "unassign" : "move",
      proposed,
    });
  }
  return changes;
}

/** Pure apply for hosts and tests: current state plus the changes. */
export function applyProposalChanges(
  current: readonly SchedulerUiEvent[],
  changes: readonly ProposalChange[],
): readonly SchedulerUiEvent[] {
  const byId = new Map(changes.map((change) => [change.current.id, change]));
  return current.map((event) => {
    const change = byId.get(event.id);
    return change ? change.proposed : event;
  });
}

/** A ghost's id carries a prefix, so it never collides with a host's ids. */
export function ghostIdOf(id: string): string {
  return `ghost:${id}`;
}

export function isGhostEvent(event: SchedulerUiEvent): boolean {
  return event.review === "ghost";
}

export interface ProposalPreviewOptions {
  /** Changes the planner dropped, by the current event's id. */
  readonly dropped?: ReadonlySet<string>;
  /**
   * Changes Apply leaves out for another reason, by the current
   * event's id: out of date, or a double booking the maker blocks.
   */
  readonly withheld?: ReadonlySet<string>;
}

export interface ProposalPreview {
  /** Placed items in the proposed state, then the ghosts of moved items. */
  readonly scheduled: readonly SchedulerUiEvent[];
  /** Items still uncovered in the proposed state. */
  readonly unscheduled: readonly SchedulerUiEvent[];
}

/**
 * The board as it would be after Apply (F31): every kept change shows
 * at its proposed place marked "proposed", a moved or unassigned item
 * also leaves a "ghost" at its current place, and a dropped or withheld
 * change shows the current item unchanged. Pure, so hosts and tests
 * can read it.
 */
export function previewProposal(
  current: readonly SchedulerUiEvent[],
  changes: readonly ProposalChange[],
  options: ProposalPreviewOptions = {},
): ProposalPreview {
  const active = new Map<string, ProposalChange>();
  for (const change of changes) {
    const id = change.current.id;
    if (options.dropped?.has(id) || options.withheld?.has(id)) {
      continue;
    }
    active.set(id, change);
  }
  const scheduled: SchedulerUiEvent[] = [];
  const unscheduled: SchedulerUiEvent[] = [];
  const ghosts: SchedulerUiEvent[] = [];
  for (const event of current) {
    const change = active.get(event.id);
    const shown: SchedulerUiEvent = change
      ? { ...change.proposed, review: "proposed" }
      : event;
    if (shown.status === "needsCover") {
      unscheduled.push(shown);
    } else {
      scheduled.push(shown);
    }
    if (
      change &&
      (change.kind === "move" || change.kind === "unassign") &&
      event.status !== "needsCover"
    ) {
      ghosts.push({ ...event, id: ghostIdOf(event.id), review: "ghost" });
    }
  }
  return { scheduled: scheduled.concat(ghosts), unscheduled };
}

/**
 * The shifts left open if the planner applies the proposal as it
 * stands now (F40 Three-level score): a kept change counts as proposed,
 * a dropped or withheld one as it is today, so the list follows Drop
 * and Keep. Earliest first.
 */
export function openShiftsAfter(
  proposal: ScheduleProposal,
  changes: readonly ProposalChange[],
  options: ProposalPreviewOptions = {},
): readonly SchedulerUiEvent[] {
  const changeById = new Map(changes.map((change) => [change.current.id, change]));
  const open: SchedulerUiEvent[] = [];
  for (const event of proposal.events) {
    const change = changeById.get(event.id);
    const kept =
      change !== undefined &&
      !options.dropped?.has(event.id) &&
      !options.withheld?.has(event.id);
    const shown = change ? (kept ? change.proposed : change.current) : event;
    if (shown.status === "needsCover") {
      open.push(shown);
    }
  }
  return open.sort((first, second) => first.start.getTime() - second.start.getTime());
}

/** How many shifts openShiftsAfter leaves open. */
export function openShiftCount(
  proposal: ScheduleProposal,
  changes: readonly ProposalChange[],
  options: ProposalPreviewOptions = {},
): number {
  return openShiftsAfter(proposal, changes, options).length;
}

/**
 * What the review says about Must rules (F40 Three-level score). The
 * solver checked the whole proposal, so once a change is dropped or
 * withheld it says nothing rather than something it cannot vouch for.
 */
export function proposalMustRules(
  proposal: ScheduleProposal,
  options: ProposalPreviewOptions = {},
): "broken" | "kept" | undefined {
  if (proposal.feasible === undefined) {
    return undefined;
  }
  if ((options.dropped?.size ?? 0) > 0 || (options.withheld?.size ?? 0) > 0) {
    return undefined;
  }
  return proposal.feasible ? "kept" : "broken";
}

/** The Must report's rows, top to bottom (design DR2 call 6). */
export type MustRow = "daysInARow" | "onLeaveOrUnavailable" | "other" | "restBetweenShifts" | "skills";

export const MUST_ROWS: readonly MustRow[] = [
  "restBetweenShifts",
  "daysInARow",
  "skills",
  "onLeaveOrUnavailable",
  "other",
];

/** The row a Must rule's matches count in: the four named rows, else "Other Must rules". */
export function mustRowOf(rule: MustRuleName): MustRow {
  return rule === "restBetweenShifts" ||
    rule === "daysInARow" ||
    rule === "skills" ||
    rule === "onLeaveOrUnavailable"
    ? rule
    : "other";
}

/** A row's count in one roster's counts. */
export function mustRowCount(counts: MustBreachCounts, row: MustRow): number {
  if (row === "other") {
    const { other } = counts;
    return other.overlap + other.maximumHours + other.splitParts + other.unlisted;
  }
  return counts[row];
}

/**
 * The Must tile and its breakdown (design Pass 1 calls 2 and 6, A11,
 * DR2-Q1, RR3-D1): the counts for the roster as it stands and as Apply
 * would leave it, with the rule matches behind them. Right after an
 * Optimize they are the solver's; once the planner drops or holds back
 * a change, the board's own count of the roster as it would be applied
 * replaces the proposed side, at once and with no call.
 */
export interface MustReport {
  /** The run was too large to explain: counts only, no matches to open. */
  readonly countsOnly: boolean;
  /** The roster as it stands; absent when the run was not analysed. */
  readonly now?: MustBreachCounts;
  readonly nowMatches?: readonly ScheduleRuleMatch[];
  /** The roster as Apply would leave it; absent = not counted. */
  readonly proposed?: MustBreachCounts;
  readonly proposedMatches?: readonly ScheduleRuleMatch[];
  /** "board": counted on the board after a hold-back. */
  readonly source: "board" | "solver";
}

export function proposalMustReport(
  proposal: ScheduleProposal,
  options: ProposalPreviewOptions = {},
  recount?: () => { readonly matches: readonly ScheduleRuleMatch[]; readonly mustBreaches: MustBreachCounts },
): MustReport {
  const { analysis } = proposal;
  const countsOnly = analysis?.countsOnly === true;
  const now = analysis?.current.mustBreaches;
  const nowMatches = countsOnly ? undefined : analysis?.current.matches;
  const heldBack = (options.dropped?.size ?? 0) > 0 || (options.withheld?.size ?? 0) > 0;
  if (!heldBack) {
    return {
      countsOnly,
      ...(now ? { now } : {}),
      ...(nowMatches ? { nowMatches } : {}),
      ...(analysis ? { proposed: analysis.proposed.mustBreaches } : {}),
      ...(!countsOnly && analysis?.proposed.matches ? { proposedMatches: analysis.proposed.matches } : {}),
      source: "solver",
    };
  }
  const board = recount?.();
  return {
    countsOnly,
    ...(now ? { now } : {}),
    ...(nowMatches ? { nowMatches } : {}),
    ...(board ? { proposed: board.mustBreaches } : {}),
    ...(board && !countsOnly ? { proposedMatches: board.matches } : {}),
    source: "board",
  };
}

/**
 * The matches a breakdown row opens to: what Apply would leave broken,
 * or, when the proposal leaves the row clean, what it fixes. Undefined
 * when the row has nothing to open (zero, counts only, or no matches).
 */
export function mustRowMatches(
  report: MustReport,
  row: MustRow,
): { readonly matches: readonly ScheduleRuleMatch[]; readonly roster: "now" | "proposed" } | undefined {
  if (report.countsOnly) {
    return undefined;
  }
  const pick = (
    counts: MustBreachCounts | undefined,
    matches: readonly ScheduleRuleMatch[] | undefined,
    roster: "now" | "proposed",
  ) => {
    if (!counts || mustRowCount(counts, row) === 0 || !matches) {
      return undefined;
    }
    const own = matches.filter((match) => isMustRule(match.rule) && mustRowOf(match.rule) === row);
    return own.length > 0 ? { matches: own, roster } : undefined;
  };
  const proposed = report.proposed;
  if (proposed && mustRowCount(proposed, row) > 0) {
    return pick(proposed, report.proposedMatches, "proposed");
  }
  return pick(report.now, report.nowMatches, "now");
}

/** The proposal's figures against today's roster (F31 rework scorecard). */
export interface ProposalScore {
  /** Shifts with a person today, of `total`. */
  readonly filledNow: number;
  /** Shifts with a person if the planner applies now, of `total`. */
  readonly filledProposed: number;
  /** Changes Apply would write: the proposal less drops and withheld changes. */
  readonly kept: number;
  /** People whose shifts the kept changes touch. */
  readonly peopleAffected: number;
  /** Shifts the solver answered for in the period. */
  readonly total: number;
}

/**
 * The scorecard's figures, as Apply would leave the roster: a kept
 * change counts as proposed, a dropped or withheld one as it is today.
 * Only shifts that start in the period count; the solver also sees
 * pinned context on either side of it.
 */
export function proposalScore(
  proposal: ScheduleProposal,
  changes: readonly ProposalChange[],
  options: ProposalPreviewOptions = {},
  period?: { readonly end: Date; readonly start: Date },
): ProposalScore {
  const inPeriod = (event: SchedulerUiEvent): boolean =>
    !period || (event.start >= period.start && event.start < period.end);
  const scoped: ScheduleProposal = { ...proposal, events: proposal.events.filter(inPeriod) };
  const scopedChanges = changes.filter((change) => inPeriod(change.current));
  const allDropped = new Set(scopedChanges.map((change) => change.current.id));
  const kept = scopedChanges.filter(
    (change) =>
      !options.dropped?.has(change.current.id) && !options.withheld?.has(change.current.id),
  );
  const people = new Set<string>();
  for (const change of kept) {
    for (const side of [change.current, change.proposed]) {
      if (side.status !== "needsCover") {
        people.add(side.resourceId);
      }
    }
  }
  const total = scoped.events.length;
  return {
    filledNow: total - openShiftCount(scoped, scopedChanges, { dropped: allDropped }),
    filledProposed: total - openShiftCount(scoped, scopedChanges, options),
    kept: kept.length,
    peopleAffected: people.size,
    total,
  };
}

/** The change list's line for one person in a long proposal. */
export interface ProposalPersonLine {
  readonly changes: number;
  /** The changed shifts' hours, on the site's clock (F20 Site time zone). */
  readonly minutes: number;
  readonly resourceId: string;
}

/**
 * A long proposal summarised per person (F31 rework: above 24 changes
 * the change list is one line per person, with their shifts and
 * hours). A change counts for the person it gives the shift to, or for
 * the person it takes the shift from when it leaves it open. Most
 * changes first, then by name.
 */
export function proposalPeople(
  changes: readonly ProposalChange[],
  nameOf: (resourceId: string) => string,
): readonly ProposalPersonLine[] {
  const byPerson = new Map<string, { changes: number; minutes: number }>();
  for (const change of changes) {
    const side = change.proposed.status === "needsCover" ? change.current : change.proposed;
    const line = byPerson.get(side.resourceId) ?? { changes: 0, minutes: 0 };
    line.changes += 1;
    line.minutes += clockMinutesBetween(side.start, side.end);
    byPerson.set(side.resourceId, line);
  }
  return [...byPerson.entries()]
    .map(([resourceId, line]) => ({ ...line, resourceId }))
    .sort(
      (a, b) => b.changes - a.changes || nameOf(a.resourceId).localeCompare(nameOf(b.resourceId)),
    );
}

/** A kept change that puts its person on two shifts at once. */
export interface ProposalDoubleBooking {
  /** "block": Apply leaves the change out; "warn": a note only. */
  readonly kind: "block" | "warn";
  /** The shift that stays where it is today. */
  readonly with: SchedulerUiEvent;
}

export interface ProposalDoubleBookingOptions {
  readonly dropped?: ReadonlySet<string>;
  /** Changes the host found out of date; their shifts stay too. */
  readonly outOfDate?: ReadonlySet<string>;
  /** The maker's overlap setting. */
  readonly policy: RulePolicy;
}

/**
 * The solver checked its plan as a whole (F31 rework), so a clean
 * plan has no double booking. A dropped or out-of-date change leaves
 * its shift where it is today, and a kept change that now puts the
 * same person on two shifts at once is a double booking, at the
 * maker's overlap setting: "block" leaves that change out too, so its
 * own shift stays and the check runs again; "warn" only notes it;
 * "off" says nothing. By the kept change's current event id.
 */
export function proposalDoubleBookings(
  changes: readonly ProposalChange[],
  options: ProposalDoubleBookingOptions,
): ReadonlyMap<string, ProposalDoubleBooking> {
  const found = new Map<string, ProposalDoubleBooking>();
  if (options.policy === "off") {
    return found;
  }
  const stays = new Set<string>([
    ...(options.dropped ?? []),
    ...(options.outOfDate ?? []),
  ]);
  const kind = options.policy;
  let grew = true;
  while (grew) {
    grew = false;
    const staying = changes.filter(
      (change) =>
        stays.has(change.current.id) && change.current.status !== "needsCover",
    );
    for (const change of changes) {
      const id = change.current.id;
      const target = change.proposed;
      if (stays.has(id) || found.has(id) || target.status === "needsCover") {
        continue;
      }
      const clash = staying.find(
        (other) =>
          other.current.id !== id &&
          other.current.resourceId === target.resourceId &&
          other.current.start < target.end &&
          other.current.end > target.start,
      );
      if (clash) {
        found.set(id, { kind, with: clash.current });
        if (kind === "block") {
          stays.add(id);
          grew = true;
        }
      }
    }
  }
  return found;
}

/** What the surface shows while a solve runs: label, elapsed time, Cancel. */
export interface SolveProgress {
  readonly label: string;
  readonly onCancel?: () => void;
  readonly seconds: number;
}
