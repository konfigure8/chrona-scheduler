import type { EventLock, SchedulerUiEvent } from "./types";

/**
 * THE single interpretation of an assignment lock. Every guard - drag,
 * resize, group move, reassign, delete, menu affordance - resolves
 * through here rather than reading `lock` or `pinned` off the event.
 *
 * That indirection is the point: a lock interpreted in two places is the
 * same defect as a rule defined twice (Docs/domain_model.md section 12),
 * and this package is where it would happen first, because the guards
 * are spread across five view components.
 */

/** `lock` wins; `pinned: true` is the original spelling of `both`. */
export function resolveLock(
  event: Pick<SchedulerUiEvent, "lock" | "pinned">,
): EventLock | undefined {
  if (event.lock) {
    return event.lock;
  }
  return event.pinned === true ? "both" : undefined;
}

/** Any lock at all. Drag affordances use this deliberately - see below. */
export function isLocked(
  event: Pick<SchedulerUiEvent, "lock" | "pinned">,
): boolean {
  return resolveLock(event) !== undefined;
}

/** Blocks changes to start/end: `time` and `both`. */
export function isTimeLocked(
  event: Pick<SchedulerUiEvent, "lock" | "pinned">,
): boolean {
  const lock = resolveLock(event);
  return lock === "time" || lock === "both";
}

/** Blocks changes of assignee: `resource` and `both`. */
export function isResourceLocked(
  event: Pick<SchedulerUiEvent, "lock" | "pinned">,
): boolean {
  const lock = resolveLock(event);
  return lock === "resource" || lock === "both";
}

/**
 * Deletion and unschedule remove the assignment outright, so any lock
 * refuses them - a partial lock still says "this booking stands".
 */
export function isDeleteLocked(
  event: Pick<SchedulerUiEvent, "lock" | "pinned">,
): boolean {
  return isLocked(event);
}

/**
 * Whether direct manipulation may start. Since 2026-08-22 the drag
 * result computation constrains partial locks to their permitted
 * axis (a time-locked shift drags by row only, a resource-locked one
 * by time only - computeDragResult pins the locked dimension), so
 * only a full lock refuses the drag outright.
 */
export function isDragLocked(
  event: Pick<SchedulerUiEvent, "lock" | "pinned">,
): boolean {
  return resolveLock(event) === "both";
}
