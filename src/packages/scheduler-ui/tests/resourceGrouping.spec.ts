import { UNGROUPED } from "../src/groupSets";
import {
  buildResourceGroups,
  groupCollapseKey,
  showsGroupHeader,
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

function openShiftGroupWithNoPeopleAppears(): void {
  const groups = buildResourceGroups(
    [resource("a", "Site 1"), resource("b", "Site 2")],
    ["Sites"],
    ["Site 3"],
  );
  assertEqual(groups.length, 3);
  assertEqual(groups[2]?.name, "Site 3");
  // One bucket with no name and no members: no level-2 header, no rows.
  assertEqual(groups[2]?.subgroups.length, 1);
  assertEqual(groups[2]?.subgroups[0]?.name, undefined);
  assertEqual(groups[2]?.subgroups[0]?.members.length, 0);
}

function openShiftGroupsFollowPeopleInFirstSeenOrder(): void {
  const groups = buildResourceGroups(
    [resource("a", "Site 2", "Front"), resource("b", "Site 1")],
    ["Sites", "Teams"],
    ["Site 9", "Site 4"],
  );
  assertEqual(groups.map((group) => group.name).join("|"), "Site 2|Site 1|Site 9|Site 4");
  // A group with no people has no subgroups, at either level.
  assertEqual(groups[2]?.subgroups.length, 1);
  assertEqual(groups[2]?.subgroups[0]?.name, undefined);
}

function ungroupedStaysLastWithOpenShiftGroups(): void {
  // Ungrouped from the people.
  const fromPeople = buildResourceGroups(
    [resource("a"), resource("b", "Team")],
    ["Sites"],
    ["Cellar"],
  );
  assertEqual(fromPeople.map((group) => group.name).join("|"), `Team|Cellar|${UNGROUPED}`);
  // Ungrouped from the open shifts only, named first.
  const fromShifts = buildResourceGroups(
    [resource("b", "Team")],
    ["Sites"],
    [UNGROUPED, "Cellar"],
  );
  assertEqual(fromShifts.map((group) => group.name).join("|"), `Team|Cellar|${UNGROUPED}`);
  assertEqual(fromShifts[2]?.subgroups[0]?.members.length, 0);
  // No people at all: the open shifts' groups alone, Ungrouped last.
  const nobody = buildResourceGroups([], ["Sites"], [UNGROUPED, "Cellar", "Bar"]);
  assertEqual(nobody.map((group) => group.name).join("|"), `Cellar|Bar|${UNGROUPED}`);
}

function groupWithPeopleAndOpenShiftsAppearsOnce(): void {
  const groups = buildResourceGroups(
    [resource("a", "Site 1"), resource("b", "Site 1"), resource("c")],
    ["Sites"],
    ["Site 1", UNGROUPED, "Site 3", "Site 3"],
  );
  assertEqual(groups.map((group) => group.name).join("|"), `Site 1|Site 3|${UNGROUPED}`);
  // The people's group keeps its members; the open shifts add nothing to it.
  assertEqual(groups[0]?.subgroups.length, 1);
  assertEqual(groups[0]?.subgroups[0]?.members.length, 2);
  assertEqual(groups[2]?.subgroups[0]?.members.length, 1);
}

function noExtraNamesKeepsPeopleGroupsOnly(): void {
  const withEmpty = buildResourceGroups([resource("a", "Site 1")], ["Sites"], []);
  const without = buildResourceGroups([resource("a", "Site 1")], ["Sites"]);
  assertEqual(withEmpty.length, 1);
  assertEqual(without.length, 1);
  assertEqual(buildResourceGroups([], ["Sites"]).length, 0);
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

function peopleWithNoSubgroupComeFirstUnderTheirGroup(): void {
  // Matt 2026-10-27, "Yes, fix the free board grouping": a group's people with no subgroup sit directly under its
  // header, before its subgroups, whatever order the people come in.
  const groups = buildResourceGroups(
    [resource("a", "Site 1", "Front"), resource("b", "Site 1"), resource("c", "Site 1", "Kitchen"), resource("d", "Site 1")],
    ["Sites", "Teams"],
  );
  assertEqual(groups[0]?.subgroups[0]?.name, undefined);
  assertEqual(groups[0]?.subgroups[0]?.members.map((member) => member.id).join(","), "b,d");
  assertEqual(groups[0]?.subgroups[1]?.name, "Front");
  assertEqual(groups[0]?.subgroups[2]?.name, "Kitchen");
}

function anEmptyUngroupedHasNoHeader(): void {
  // No "Ungrouped (0)" header, also not over the open shifts' lane; a named group keeps its header with no people.
  const groups = buildResourceGroups([resource("a", "Site 1")], ["Sites"], ["Site 2", UNGROUPED]);
  assertEqual(showsGroupHeader(groups.find((group) => group.name === UNGROUPED)!), false);
  assertEqual(showsGroupHeader(groups.find((group) => group.name === "Site 2")!), true);
  const withPerson = buildResourceGroups([resource("a")], ["Sites"]);
  assertEqual(showsGroupHeader(withPerson[0]!), true);
}

bucketsTwoLevelsInFirstSeenOrder();
oneLevelDataStaysOneLevel();
ungroupedTrailsWithSentinel();
openShiftGroupWithNoPeopleAppears();
openShiftGroupsFollowPeopleInFirstSeenOrder();
ungroupedStaysLastWithOpenShiftGroups();
groupWithPeopleAndOpenShiftsAppearsOnce();
noExtraNamesKeepsPeopleGroupsOnly();
collapseKeysCannotCollide();
peopleWithNoSubgroupComeFirstUnderTheirGroup();
anEmptyUngroupedHasNoHeader();

console.log("resourceGrouping tests passed");
