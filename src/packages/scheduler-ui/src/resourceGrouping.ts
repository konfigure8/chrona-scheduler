import { groupValue, UNGROUPED } from "./groupSets";
import type { SchedulerResource } from "./types";

export interface ResourceSubgroup {
  /** Undefined for resources sitting directly under the group header. */
  readonly name: string | undefined;
  readonly members: readonly SchedulerResource[];
}

export interface ResourceGroup {
  readonly name: string;
  readonly subgroups: readonly ResourceSubgroup[];
}

/** Collapse-state key for a group or subgroup header. */
export function groupCollapseKey(group: string, subgroup?: string): string {
  // Control-character delimiter: never collides with real names.
  return subgroup === undefined ? group : group + "\u0000" + subgroup;
}

/**
 * Grouping by an ordered list of set names (two honored): resources
 * bucket by their value in the first set, then by the second within
 * it, first-seen order. Members without a value in the active set
 * land in the Ungrouped bucket, LAST - visible data quality beats
 * silent flattening (ruling 2026-08-31). Group names carry the
 * UNGROUPED sentinel; renderers label it via strings.ungrouped.
 */
export function buildResourceGroups(
  resources: readonly SchedulerResource[],
  groupBy: readonly string[],
): readonly ResourceGroup[] {
  const primary = groupBy[0];
  const secondary = groupBy[1];
  const groupOrder: string[] = [];
  const groupBuckets = new Map<
    string,
    {
      order: (string | undefined)[];
      buckets: Map<string | undefined, SchedulerResource[]>;
    }
  >();

  for (const resource of resources) {
    const groupName = groupValue(resource.groups, primary);
    let entry = groupBuckets.get(groupName);
    if (!entry) {
      entry = { buckets: new Map(), order: [] };
      groupBuckets.set(groupName, entry);
      groupOrder.push(groupName);
    }
    const rawSub = secondary ? resource.groups?.[secondary] : undefined;
    const bucket = entry.buckets.get(rawSub);
    if (bucket) {
      bucket.push(resource);
    } else {
      entry.buckets.set(rawSub, [resource]);
      entry.order.push(rawSub);
    }
  }

  // Ungrouped trails the real values.
  groupOrder.sort((first, second) =>
    first === UNGROUPED ? 1 : second === UNGROUPED ? -1 : 0,
  );

  return groupOrder.map((name) => {
    const entry = groupBuckets.get(name);
    return {
      name,
      subgroups: (entry?.order ?? []).map((subgroupName) => ({
        members: entry?.buckets.get(subgroupName) ?? [],
        name: subgroupName,
      })),
    };
  });
}
