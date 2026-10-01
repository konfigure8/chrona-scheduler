import type { SchedulerResource, SchedulerUiEvent } from "./types";

/**
 * Requirement tags the resource does not carry. Empty when the event has no
 * requirements or the resource satisfies all of them. The package renders
 * mismatches; whether they warn or block is the host's validateChange call.
 */
export function missingRequiredTags(
  resource: SchedulerResource | undefined,
  requiredTags: readonly string[] | undefined,
): readonly string[] {
  if (!requiredTags || requiredTags.length === 0) {
    return [];
  }
  const held = new Set(resource?.tags ?? []);
  return requiredTags.filter((tag) => !held.has(tag));
}

export function resourceMatchesEvent(
  resource: SchedulerResource | undefined,
  event: SchedulerUiEvent,
): boolean {
  return missingRequiredTags(resource, event.requiredTags).length === 0;
}

/** Whole hours assigned to a resource within the window (clipped). */
export function assignedHours(
  events: readonly SchedulerUiEvent[],
  resourceId: string,
  window: { readonly end: Date; readonly start: Date },
): number {
  let milliseconds = 0;
  for (const event of events) {
    if (event.resourceId !== resourceId || event.status === "needsCover") {
      continue;
    }
    const start = Math.max(event.start.getTime(), window.start.getTime());
    const end = Math.min(event.end.getTime(), window.end.getTime());
    if (end > start) {
      milliseconds += end - start;
    }
  }
  return Math.round(milliseconds / 3_600_000);
}

export interface ResourceEligibility {
  /** Members of the target set this resource lacks skills for. */
  readonly mismatchCount: number;
  /** Union of missing tags across the target events, for labeling. */
  readonly missing: readonly string[];
  readonly resource: SchedulerResource;
}

/**
 * Ranks resources for a reassign picker: fully eligible first (stable
 * within each band), mismatched ones annotated - shown, never hidden,
 * because allow/warn/block stays the host's rule.
 */
export function rankResourcesByEligibility(
  resources: readonly SchedulerResource[],
  events: readonly SchedulerUiEvent[],
): readonly ResourceEligibility[] {
  const ranked = resources.map((resource) => {
    const missing = new Set<string>();
    let mismatchCount = 0;
    for (const event of events) {
      const gaps = missingRequiredTags(resource, event.requiredTags);
      if (gaps.length > 0) {
        mismatchCount += 1;
        for (const gap of gaps) {
          missing.add(gap);
        }
      }
    }
    return { mismatchCount, missing: [...missing], resource };
  });
  return [
    ...ranked.filter((entry) => entry.mismatchCount === 0),
    ...ranked.filter((entry) => entry.mismatchCount > 0),
  ];
}
