import type { SchedulerResource, SchedulerUiEvent } from "./types";

/*
 * Grouping sets: the flexible-grouping ruling. Resources and work
 * carry classification maps (set name -> value); the board groups by
 * an ordered list of set names. Nothing is hard-coded to "teams" -
 * a set is whatever the maker defined (chr_groupset).
 */

/**
 * Sentinel bucket for members with no value in the active set.
 * Renderers label it with strings.ungrouped; the key itself never
 * collides with a real value (control character).
 */
export const UNGROUPED = "\u0000ungrouped";

/** Set names in first-seen order across resources and work. */
export function groupSetNames(
  resources: readonly SchedulerResource[],
  events?: readonly SchedulerUiEvent[],
): readonly string[] {
  const seen: string[] = [];
  const add = (groups?: Readonly<Record<string, string>>): void => {
    for (const name of Object.keys(groups ?? {})) {
      if (!seen.includes(name)) {
        seen.push(name);
      }
    }
  };
  for (const resource of resources) {
    add(resource.groups);
  }
  for (const event of events ?? []) {
    add(event.groups);
  }
  return seen;
}

/** The entity's value in a set, or the Ungrouped sentinel. */
export function groupValue(
  groups: Readonly<Record<string, string>> | undefined,
  set: string | undefined,
): string {
  return (set ? groups?.[set] : undefined) ?? UNGROUPED;
}
