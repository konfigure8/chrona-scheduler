import type { SchedulerUiEvent } from "./types";

/**
 * THE single interpretation of a pin. Every guard - drag, resize, group
 * move, reassign, delete, menu affordance - resolves through here rather
 * than reading `pinned` off the event.
 *
 * That indirection is the point: a rule interpreted in two places is the
 * same defect as a rule defined twice (Docs/domain_model.md section 12),
 * and this package is where it would happen first, because the guards
 * are spread across five view components.
 */

/**
 * A pin holds the shift's time and date and its person, if it has one,
 * and the solver leaves it alone. There is no lock in between (Matt
 * 2026-09-30 and 2026-10-04).
 */
export function isPinned(event: Pick<SchedulerUiEvent, "pinned">): boolean {
  return event.pinned === true;
}

/** Whether direct manipulation may start: a pinned shift refuses drag and resize. */
export function isDragLocked(event: Pick<SchedulerUiEvent, "pinned">): boolean {
  return isPinned(event);
}

/** Delete and Unschedule: a pinned shift refuses both until it is unpinned. */
export function isDeleteLocked(event: Pick<SchedulerUiEvent, "pinned">): boolean {
  return isPinned(event);
}

/** The pin mark shows on a pinned shift. */
export function showsPin(event: Pick<SchedulerUiEvent, "pinned">): boolean {
  return isPinned(event);
}

/** The shift pinned or unpinned, the same way in every host. */
export function withPin(
  event: SchedulerUiEvent,
  pinned: boolean,
): SchedulerUiEvent {
  return { ...event, pinned: pinned || undefined };
}
