import type { SchedulerUiEvent } from "./types";

/*
 * Local value meters for the standalone conversion surface (F22):
 * numbers the control can compute from nothing but its own data, so
 * the Optimize explainer always has something honest to say. Pure
 * functions, unit-specced.
 */

/**
 * Distinct assigned shifts involved in at least one same-person
 * overlap. Computable from the required bindings alone - the
 * zero-config floor of the meter tier.
 */
export function countOverlappingShifts(
  events: readonly SchedulerUiEvent[],
): number {
  const byResource = new Map<string, SchedulerUiEvent[]>();
  for (const event of events) {
    if (event.status === "needsCover") {
      continue;
    }
    const bucket = byResource.get(event.resourceId);
    if (bucket) {
      bucket.push(event);
    } else {
      byResource.set(event.resourceId, [event]);
    }
  }
  const involved = new Set<string>();
  for (const bucket of byResource.values()) {
    const sorted = [...bucket].sort(
      (first, second) => first.start.getTime() - second.start.getTime(),
    );
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i];
        const b = sorted[j];
        if (!a || !b) {
          continue;
        }
        if (b.start.getTime() >= a.end.getTime()) {
          break;
        }
        involved.add(a.id);
        involved.add(b.id);
      }
    }
  }
  return involved.size;
}

/** Open work awaiting a person - shown when such rows exist at all. */
export function countUnscheduled(
  events: readonly SchedulerUiEvent[],
  unscheduledEvents?: readonly SchedulerUiEvent[],
): number {
  const fromPanel = unscheduledEvents?.length ?? 0;
  const onBoard = events.filter(
    (event) => event.status === "needsCover",
  ).length;
  return fromPanel + onBoard;
}
