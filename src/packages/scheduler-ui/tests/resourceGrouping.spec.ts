import { UNGROUPED } from "../src/groupSets";
import {
  buildResourceGroups,
  groupCollapseKey,
} from "../src/resourceGrouping";
import type { SchedulerResource } from "../src/types";

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

const resource = (
  id: string,
  group?: string,
  subgroup?: string,
): SchedulerResource => ({
  groups: {
    ...(group ? { Sites: group } : {}),
    ...(subgroup ? { Teams: subgroup } : {}),
  },
  id,
  name: id,
});

function bucketsTwoLevelsInFirstSeenOrder(): void {
  const groups = buildResourceGroups(
    [
      resource("a", "Site 1", "Front"),
      resource("b", "Site 2"),
      resource("c", "Site 1", "Kitchen"),
      resource("d", "Site 1", "Front"),
    ],
    ["Sites", "Teams"],
  );
  assertEqual(groups.length, 2);
  assertEqual(groups[0]?.name, "Site 1");
  assertEqual(groups[1]?.name, "Site 2");
  assertEqual(groups[0]?.subgroups.length, 2);
  assertEqual(groups[0]?.subgroups[0]?.name, "Front");
  assertEqual(groups[0]?.subgroups[0]?.members.length, 2);
  assertEqual(groups[0]?.subgroups[1]?.name, "Kitchen");
  // Site 2 has no subgroups: one undefined bucket, no level-2 header.
  assertEqual(groups[1]?.subgroups.length, 1);
  assertEqual(groups[1]?.subgroups[0]?.name, undefined);
}

function oneLevelDataStaysOneLevel(): void {
  const groups = buildResourceGroups(
    [
      resource("a", "Front of house"),
      resource("b", "Front of house"),
      resource("c", "Kitchen"),
    ],
    ["Sites"],
  );
  assertEqual(groups.length, 2);
  for (const group of groups) {
    assertEqual(group.subgroups.length, 1);
    assertEqual(group.subgroups[0]?.name, undefined);
  }
}

function ungroupedTrailsWithSentinel(): void {
  const groups = buildResourceGroups(
    [resource("a"), resource("b", "Team")],
    ["Sites"],
  );
  // Ungrouped members land in the sentinel bucket, LAST (ruling
  // 2026-08-31) - visible data quality beats silent flattening.
  assertEqual(groups[0]?.name, "Team");
  assertEqual(groups[1]?.name, UNGROUPED);
}

function collapseKeysCannotCollide(): void {
  // The delimiter is a control character no real name contains.
  const first = groupCollapseKey("A B", "C");
  const second = groupCollapseKey("A", "B C");
  if (first === second) {
    throw new Error("Collapse keys collided across group/subgroup split");
  }
  assertEqual(groupCollapseKey("Team"), "Team");
}

bucketsTwoLevelsInFirstSeenOrder();
oneLevelDataStaysOneLevel();
ungroupedTrailsWithSentinel();
collapseKeysCannotCollide();

console.log("resourceGrouping tests passed");
