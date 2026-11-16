import { groupValue, UNGROUPED } from "./groupSets";
import type { CreateRequest, DragResult } from "./interactions";
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

/**
 * Whether a group gets a header row: every group does, except an Ungrouped with nobody in it, so no
 * "Ungrouped (0)" stands over the open shifts' lane.
 */
export function showsGroupHeader(group: ResourceGroup): boolean {
  return group.name !== UNGROUPED || group.subgroups.some((subgroup) => subgroup.members.length > 0);
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
 *
 * extraGroupNames are groups that need a header even with no people,
 * such as the groups of the open shifts in view: each one not already
 * a people's group follows those groups in the order given, with one
 * unnamed subgroup and no members. Ungrouped stays last.
 */
export function buildResourceGroups(
  resources: readonly SchedulerResource[],
  groupBy: readonly string[],
  extraGroupNames?: readonly string[],
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

  for (const name of extraGroupNames ?? []) {
    if (!groupBuckets.has(name)) {
      groupBuckets.set(name, { buckets: new Map([[undefined, []]]), order: [undefined] });
      groupOrder.push(name);
    }
  }

  // Ungrouped trails the real values.
  groupOrder.sort((first, second) =>
    first === UNGROUPED ? 1 : second === UNGROUPED ? -1 : 0,
  );

  return groupOrder.map((name) => {
    const entry = groupBuckets.get(name);
    // A group's people with no subgroup sit directly under its header, before its subgroups.
    // (Array sort puts undefined last whatever the comparator says, so the order is built, not sorted.)
    const order = [
      ...(entry?.order ?? []).filter((subgroupName) => subgroupName === undefined),
      ...(entry?.order ?? []).filter((subgroupName) => subgroupName !== undefined),
    ];
    return {
      name,
      subgroups: order.map((subgroupName) => ({
        members: entry?.buckets.get(subgroupName) ?? [],
        name: subgroupName,
      })),
    };
  });
}

/**
 * The band a range drawn on a row sits in: the row's value in each grouping set the board shows (two honored), as
 * buildResourceGroups bands the rows. Absent when the rows are not grouped or the row has no value (Ungrouped).
 */
export function bandGroupsOf(
  resource: SchedulerResource | undefined,
  groupBy: readonly string[],
): Readonly<Record<string, string>> | undefined {
  const entries = groupBy
    .slice(0, 2)
    .map((set) => [set, groupValue(resource?.groups, set)] as const)
    .filter(([, value]) => value !== UNGROUPED);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Where a range drawn on the grid goes: an extension's own form for a new item (`hasCreate`) gets the request with the
 * row and its band's groups; with none, the board's own dialog gets the range exactly as drawn, as before.
 */
export function drawnRangeTarget(
  range: DragResult,
  hasCreate: boolean,
  resources: readonly SchedulerResource[],
  groupBy: readonly string[],
): { readonly range: DragResult } | { readonly request: CreateRequest } {
  if (!hasCreate) {
    return { range };
  }
  const resource = resources.find((one) => one.id === range.resourceId);
  const groups = bandGroupsOf(resource, groupBy);
  return {
    request: {
      end: range.end,
      ...(groups ? { groups } : {}),
      resource,
      start: range.start,
    },
  };
}
