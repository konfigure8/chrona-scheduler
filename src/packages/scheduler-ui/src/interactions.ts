import { isPinned } from "./locks";
import { clampResizeEnd, clampResizeStart } from "./spans";
import { offsetToDate, snapDate } from "./timeAxis";
import type { SchedulerUiEvent, TimeWindow } from "./types";

export type DragKind = "assign" | "create" | "move" | "resizeEnd" | "resizeStart";

export interface DragSession {
  /** Pointer offset from the event start, in milliseconds, at drag begin. */
  readonly grabOffsetMs: number;
  readonly kind: DragKind;
  /**
   * Lane drags are a pure "who" gesture: the drop changes only the
   * resource and the shift keeps its own time, whatever the pointer
   * does along the time axis.
   */
  readonly preserveTime?: boolean;
  readonly sourceEvent?: SchedulerUiEvent;
}

export interface DragPointer {
  /** Horizontal canvas offset in pixels. */
  readonly left: number;
  readonly resourceId: string | undefined;
}

export interface DragResult {
  readonly end: Date;
  readonly resourceId: string;
  readonly start: Date;
}

export type ChangeVerdictKind = "allow" | "block" | "warn";

/**
 * One failed rule inside a verdict. `scope` says what the failure is
 * about: "item" failures (outside working hours) hold for every
 * candidate resource, "person" failures (missing skill, overlap,
 * restricted resource) depend on the proposed pairing. The dialog's
 * "Best options" ranks people by person-scoped results only.
 */
export interface RuleResult {
  readonly kind: "block" | "warn";
  readonly reason: string;
  readonly scope: "item" | "person";
}

export interface ChangeVerdict {
  readonly kind: ChangeVerdictKind;
  readonly reason?: string;
  /**
   * Every failed rule, worst first, when the host evaluates all rules
   * instead of stopping at the first failure. `kind`/`reason` stay
   * the aggregate headline so single-reason consumers keep working.
   */
  readonly results?: readonly RuleResult[];
}

export const allowVerdict: ChangeVerdict = { kind: "allow" };

/**
 * Fold rule results into the aggregate verdict: any block blocks,
 * else any warn warns; the headline reason is the first result of the
 * worst kind. Hosts that evaluate every rule build their verdict here
 * so aggregation cannot drift between hosts.
 */
export function aggregateVerdict(
  results: readonly RuleResult[],
): ChangeVerdict {
  if (results.length === 0) {
    return allowVerdict;
  }
  const blocks = results.filter((result) => result.kind === "block");
  const ordered = [...blocks, ...results.filter((r) => r.kind === "warn")];
  const worst = ordered[0];
  if (!worst) {
    return allowVerdict;
  }
  return { kind: worst.kind, reason: worst.reason, results: ordered };
}

/**
 * Host-pluggable rule seam. The package renders verdicts; the host (and
 * ultimately the solver) owns the rules - skills, availability, labor law,
 * travel feasibility all flow through this one callback.
 */
export type ValidateChange = (
  event: SchedulerUiEvent | undefined,
  proposed: DragResult,
) => ChangeVerdict;

export interface DragGeometry {
  readonly pxPerHour: number;
  readonly snapMinutes: number;
  readonly window: TimeWindow;
}

const minimumDurationMs = 5 * 60_000;

export function beginMoveSession(
  event: SchedulerUiEvent,
  pointerLeft: number,
  geometry: DragGeometry,
): DragSession {
  const pointerDate = offsetToDate(
    pointerLeft,
    geometry.window,
    geometry.pxPerHour,
  );
  return {
    grabOffsetMs: pointerDate.getTime() - event.start.getTime(),
    kind: "move",
    sourceEvent: event,
  };
}

export function beginResizeSession(
  event: SchedulerUiEvent,
  edge: "end" | "start",
): DragSession {
  return {
    grabOffsetMs: 0,
    kind: edge === "start" ? "resizeStart" : "resizeEnd",
    sourceEvent: event,
  };
}

export function beginCreateSession(
  anchorLeft: number,
  geometry: DragGeometry,
): DragSession {
  const anchor = snapDate(
    offsetToDate(anchorLeft, geometry.window, geometry.pxPerHour),
    geometry.snapMinutes,
  );
  return {
    grabOffsetMs: anchor.getTime(),
    kind: "create",
    sourceEvent: undefined,
  };
}

export function beginAssignSession(event: SchedulerUiEvent): DragSession {
  return {
    grabOffsetMs: 0,
    kind: "assign",
    sourceEvent: event,
  };
}

/** Assign drag from an unscheduled lane bar: row changes, time stays. */
export function beginLaneAssignSession(
  event: SchedulerUiEvent,
): DragSession {
  return {
    grabOffsetMs: 0,
    kind: "assign",
    preserveTime: true,
    sourceEvent: event,
  };
}

export function computeDragResult(
  session: DragSession,
  pointer: DragPointer,
  geometry: DragGeometry,
): DragResult | undefined {
  const pointerDate = offsetToDate(
    pointer.left,
    geometry.window,
    geometry.pxPerHour,
  );

  if (session.kind === "create") {
    if (!pointer.resourceId) {
      return undefined;
    }
    const anchor = new Date(session.grabOffsetMs);
    const moving = snapDate(pointerDate, geometry.snapMinutes);
    const [start, end] =
      moving.getTime() >= anchor.getTime() ? [anchor, moving] : [moving, anchor];
    return {
      end: enforceMinimumEnd(start, end),
      resourceId: pointer.resourceId,
      start,
    };
  }

  const event = session.sourceEvent;
  if (!event) {
    return undefined;
  }
  const resourceId = pointer.resourceId ?? event.resourceId;

  // A pinned shift never changes; isDragLocked stops its drag before it starts.
  if (isPinned(event)) {
    return { end: event.end, resourceId: event.resourceId, start: event.start };
  }

  if (session.kind === "move" || session.kind === "assign") {
    // Lane drags preserve time by construction.
    if (session.preserveTime) {
      return {
        end: event.end,
        resourceId,
        start: event.start,
      };
    }
    const start = snapDate(
      new Date(pointerDate.getTime() - session.grabOffsetMs),
      geometry.snapMinutes,
    );
    const durationMs = event.end.getTime() - event.start.getTime();
    return {
      end: new Date(start.getTime() + durationMs),
      resourceId,
      start,
    };
  }

  if (session.kind === "resizeStart") {
    const start = snapDate(pointerDate, geometry.snapMinutes);
    const boundedStart =
      start.getTime() >= event.end.getTime()
        ? new Date(event.end.getTime() - minimumDurationMs)
        : start;
    return {
      end: event.end,
      resourceId: event.resourceId,
      start: clampResizeStart(event, boundedStart, geometry.snapMinutes),
    };
  }

  const end = snapDate(pointerDate, geometry.snapMinutes);
  const boundedEnd =
    end.getTime() <= event.start.getTime()
      ? new Date(event.start.getTime() + minimumDurationMs)
      : end;
  return {
    end: clampResizeEnd(event, boundedEnd, geometry.snapMinutes),
    resourceId: event.resourceId,
    start: event.start,
  };
}

/**
 * Cell-based drop (roster and month grids): moves the event by whole days
 * preserving time-of-day and duration, optionally reassigning the resource.
 * Day arithmetic goes through setDate so daylight-saving transitions keep
 * wall-clock times.
 */
export function computeCellDropResult(
  event: SchedulerUiEvent,
  dayDelta: number,
  targetResourceId?: string,
): DragResult {
  // A pinned shift never changes.
  if (isPinned(event)) {
    return { end: event.end, resourceId: event.resourceId, start: event.start };
  }
  const start = new Date(event.start.getTime());
  start.setDate(start.getDate() + dayDelta);
  const end = new Date(event.end.getTime());
  end.setDate(end.getDate() + dayDelta);
  return {
    end,
    resourceId: targetResourceId ?? event.resourceId,
    start,
  };
}

export function dragResultChangesEvent(
  event: SchedulerUiEvent,
  result: DragResult,
): boolean {
  return (
    event.start.getTime() !== result.start.getTime() ||
    event.end.getTime() !== result.end.getTime() ||
    event.resourceId !== result.resourceId
  );
}

function enforceMinimumEnd(start: Date, end: Date): Date {
  return end.getTime() - start.getTime() < minimumDurationMs
    ? new Date(start.getTime() + minimumDurationMs)
    : end;
}

/** One proposed event mutation with its validation verdict. */
export interface TimelineChange {
  readonly event: SchedulerUiEvent | undefined;
  readonly result: DragResult;
  /** Set when a dialog save renamed the item. */
  readonly title?: string;
  readonly verdict: ChangeVerdict;
}

export type OffsetUnit = "days" | "hours" | "weeks";

export interface OffsetSpec {
  readonly amount: number;
  /** 1 = later, -1 = earlier. */
  readonly direction: 1 | -1;
  readonly unit: OffsetUnit;
}

/**
 * "Move to..." engine: shifts every unpinned event by the same offset.
 * Day/week arithmetic goes through setDate so wall-clock times survive
 * daylight-saving transitions; hours are exact instants. Any blocked
 * member vetoes the whole move.
 */
export function buildOffsetChanges(
  events: readonly SchedulerUiEvent[],
  spec: OffsetSpec,
  validateChange: ValidateChange | undefined,
): {
  readonly blocked: ChangeVerdict | undefined;
  readonly changes: readonly TimelineChange[];
} {
  const changes: TimelineChange[] = [];
  let blocked: ChangeVerdict | undefined;
  const shift = (date: Date): Date => {
    const next = new Date(date.getTime());
    if (spec.unit === "hours") {
      next.setTime(next.getTime() + spec.direction * spec.amount * 3_600_000);
      return next;
    }
    const days = spec.amount * (spec.unit === "weeks" ? 7 : 1);
    next.setDate(next.getDate() + spec.direction * days);
    return next;
  };
  for (const event of events) {
    // A pinned member stays where it is.
    if (isPinned(event)) {
      continue;
    }
    const proposed: DragResult = {
      end: shift(event.end),
      resourceId: event.resourceId,
      start: shift(event.start),
    };
    const verdict = validateChange?.(event, proposed) ?? allowVerdict;
    if (verdict.kind === "block" && !blocked) {
      blocked = verdict;
    }
    changes.push({ event, result: proposed, verdict });
  }
  return { blocked, changes };
}

/**
 * "Reassign to..." engine: moves every unpinned event onto the target
 * resource keeping its times. Members already there drop out as no-ops;
 * any blocked member (e.g. a missing skill) vetoes the whole action.
 */
export function buildReassignChanges(
  events: readonly SchedulerUiEvent[],
  targetResourceId: string,
  validateChange: ValidateChange | undefined,
): {
  readonly blocked: ChangeVerdict | undefined;
  readonly changes: readonly TimelineChange[];
} {
  const changes: TimelineChange[] = [];
  let blocked: ChangeVerdict | undefined;
  for (const event of events) {
    // A pinned member keeps its person.
    if (isPinned(event) || event.resourceId === targetResourceId) {
      continue;
    }
    const proposed: DragResult = {
      end: event.end,
      resourceId: targetResourceId,
      start: event.start,
    };
    const verdict = validateChange?.(event, proposed) ?? allowVerdict;
    if (verdict.kind === "block" && !blocked) {
      blocked = verdict;
    }
    changes.push({ event, result: proposed, verdict });
  }
  return { blocked, changes };
}

/**
 * Group move: the dragged event takes its full drop result
 * (including a row change); the other selected events shift by the same
 * time delta on their own rows. Any blocked member vetoes the whole
 * drop. Pinned partners sit the move out entirely - a pin means "this
 * assignment does not change".
 */
export function buildGroupChanges(
  source: SchedulerUiEvent,
  result: DragResult,
  partners: readonly SchedulerUiEvent[],
  validateChange: ValidateChange | undefined,
): {
  readonly blocked: ChangeVerdict | undefined;
  readonly changes: readonly TimelineChange[];
} {
  const deltaMs = result.start.getTime() - source.start.getTime();
  const changes: TimelineChange[] = [];
  let blocked: ChangeVerdict | undefined;

  const push = (event: SchedulerUiEvent, proposed: DragResult): void => {
    const verdict = validateChange?.(event, proposed) ?? allowVerdict;
    if (verdict.kind === "block" && !blocked) {
      blocked = verdict;
    }
    changes.push({ event, result: proposed, verdict });
  };

  push(source, result);
  for (const partner of partners) {
    // Pinned partners stay where they are.
    if (partner.id === source.id || isPinned(partner)) {
      continue;
    }
    push(partner, {
      end: new Date(partner.end.getTime() + deltaMs),
      resourceId: partner.resourceId,
      start: new Date(partner.start.getTime() + deltaMs),
    });
  }
  return { blocked, changes };
}
