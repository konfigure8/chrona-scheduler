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
import type { SchedulerUiEvent } from "./types";

export type SolveRunStatus = "failed" | "queued" | "running" | "succeeded";

/** What the surface renders about an in-flight or failed solve. */
export interface SolveState {
  readonly message?: string;
  /** "quota" = the server refused with 402 quota_exceeded (F19: the
   * daily free solve limit). The surface renders the calm quota
   * notice for this instead of the red failure line. */
  readonly reason?: "quota";
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
  readonly events: readonly SchedulerUiEvent[];
  /** F40 Three-level score: the whole proposal breaks no Must rule. Absent when the answer does not say. */
  readonly feasible?: boolean;
  readonly runId: string;
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
  /** Changes the host's rules block, by the current event's id. */
  readonly blocked?: ReadonlySet<string>;
  /** Changes the planner dropped, by the current event's id. */
  readonly dropped?: ReadonlySet<string>;
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
 * also leaves a "ghost" at its current place, and a dropped or blocked
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
    if (options.dropped?.has(id) || options.blocked?.has(id)) {
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
 * Shifts left open if the planner applies the proposal as it stands
 * now (F40 Three-level score): a kept change counts as proposed, a
 * dropped or blocked one as it is today, so the count follows Drop
 * and Keep.
 */
export function openShiftCount(
  proposal: ScheduleProposal,
  changes: readonly ProposalChange[],
  options: ProposalPreviewOptions = {},
): number {
  const changeById = new Map(changes.map((change) => [change.current.id, change]));
  let open = 0;
  for (const event of proposal.events) {
    const change = changeById.get(event.id);
    const kept =
      change !== undefined &&
      !options.dropped?.has(event.id) &&
      !options.blocked?.has(event.id);
    const shown = change ? (kept ? change.proposed : change.current) : event;
    if (shown.status === "needsCover") {
      open += 1;
    }
  }
  return open;
}

/**
 * What the review says about Must rules (F40 Three-level score). The
 * solver checked the whole proposal, so once a change is dropped or
 * blocked it says nothing rather than something it cannot vouch for.
 */
export function proposalMustRules(
  proposal: ScheduleProposal,
  options: ProposalPreviewOptions = {},
): "broken" | "kept" | undefined {
  if (proposal.feasible === undefined) {
    return undefined;
  }
  if ((options.dropped?.size ?? 0) > 0 || (options.blocked?.size ?? 0) > 0) {
    return undefined;
  }
  return proposal.feasible ? "kept" : "broken";
}

/** What the surface shows while a solve runs: label, elapsed time, Cancel. */
export interface SolveProgress {
  readonly label: string;
  readonly onCancel?: () => void;
  readonly seconds: number;
}
