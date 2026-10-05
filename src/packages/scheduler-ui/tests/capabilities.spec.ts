import { activeCapabilities, computeCapabilityTiers } from "../src/capabilities";
import { problemFromSchedule } from "../src/schedulingContract";
import { buildSolveRequest } from "../src/solveTransport";
import { redactProblem } from "../src/redaction";
import { fromDisplayZone, toDisplayZone } from "../src/timeZone";
import type { SchedulerResource, SchedulerUiEvent } from "../src/types";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const at = (hour: number): Date => new Date(Date.UTC(2026, 7, 17, hour));

const event = (
  id: string,
  extra: Partial<SchedulerUiEvent> = {},
): SchedulerUiEvent => ({
  end: at(17),
  id,
  resourceId: "r-a",
  start: at(9),
  status: "assigned",
  title: id,
  ...extra,
});

// F22 deliverable 2, Q2-A: presence-based tiers. A bare mapping
// activates assignment only; each resolved extra activates its tier.
{
  const bare = computeCapabilityTiers({
    events: [event("s1")],
    resources: [{ id: "r-a", name: "A" }],
  });
  assertEqual(
    activeCapabilities(bare).join(","),
    "assignment",
    "bare mapping = assignment only",
  );

  const rich = computeCapabilityTiers({
    decorations: [
      {
        end: at(12),
        kind: "unavailable",
        resourceId: "r-a",
        start: at(8),
      },
    ],
    events: [event("s1", { pinned: true, requiredTags: ["Bar"] })],
    resources: [
      { capacityHours: 38, costCentsPerHour: 3200, id: "r-a", name: "A", tags: ["Bar"] },
    ],
  });
  assertEqual(
    activeCapabilities(rich).join(","),
    "assignment,locks,roles,availability,hours,cost",
    "every tier active",
  );

  // Roles needs BOTH sides resolved: requirements without any tagged
  // person is not a working roles tier.
  const halfRoles = computeCapabilityTiers({
    events: [event("s1", { requiredTags: ["Bar"] })],
    resources: [{ id: "r-a", name: "A" }],
  });
  assertEqual(
    halfRoles.find((tier) => tier.capability === "roles")?.active,
    false,
    "roles inactive without tagged people",
  );

  // Host-declared mapping is reported alongside data presence.
  const mappedButEmpty = computeCapabilityTiers({
    events: [event("s1")],
    mapped: { hours: true },
    resources: [{ id: "r-a", name: "A" }],
  });
  const hours = mappedButEmpty.find((tier) => tier.capability === "hours");
  assertEqual(hours?.mapped, true, "hours mapped");
  assertEqual(hours?.active, false, "hours inactive (no data)");

  // No people = nothing to assign to, whatever else is bound.
  const nobody = computeCapabilityTiers({
    events: [event("s1")],
    resources: [{ id: "r-open", name: "Unassigned" }],
  });
  assertEqual(
    nobody.find((tier) => tier.capability === "assignment")?.active,
    false,
    "assignment inactive without a population",
  );
}

// Q1-A: pinning is a choice, not a default. Only a pin holds the
// assignment; everything else is movable. The explicit override still
// pins everything.
{
  const resources: SchedulerResource[] = [{ id: "r-a", name: "A" }];
  const events = [event("free"), event("pinned-spelling", { pinned: true })];
  const problem = problemFromSchedule({
    events,
    resources,
    window: { end: at(24), start: at(0) },
  });
  const pinnedById = new Map(
    problem.shifts.map((shift) => [shift.id, shift.assignment?.pinned]),
  );
  assertEqual(pinnedById.get("free"), false, "unpinned is movable");
  assertEqual(pinnedById.get("pinned-spelling"), true, "a pin pins");

  const pinAll = problemFromSchedule({
    events,
    pinAssigned: true,
    resources,
    window: { end: at(24), start: at(0) },
  });
  assertEqual(
    pinAll.shifts.every((shift) => shift.assignment?.pinned === true),
    true,
    "explicit override pins everything",
  );
}

// Planning-horizon doctrine: context outside the window travels pinned
// and never changes, whatever its lock and whatever the override says.
{
  const resources: SchedulerResource[] = [{ id: "r-a", name: "A" }];
  const window = { end: at(24), start: at(0) };
  const dayBefore = new Date(Date.UTC(2026, 7, 16, 22));
  const dayAfter = new Date(Date.UTC(2026, 7, 18, 9));
  const events = [
    event("inside"),
    event("night-before", { end: at(6), start: dayBefore }),
    event("day-after", { end: new Date(Date.UTC(2026, 7, 18, 17)), start: dayAfter }),
  ];
  for (const pinAssigned of [undefined, false]) {
    const problem = problemFromSchedule({ events, pinAssigned, resources, window });
    const pinnedById = new Map(
      problem.shifts.map((shift) => [shift.id, shift.assignment?.pinned]),
    );
    assertEqual(pinnedById.get("inside"), false, "inside the window stays movable");
    assertEqual(pinnedById.get("night-before"), true, "the night before is pinned context");
    assertEqual(pinnedById.get("day-after"), true, "the day after is pinned context");
  }
}

// Hours and cost reach the wire (the ledger says they do): weekly
// capacity scales to the solve window; cost passes through.
{
  const problem = problemFromSchedule({
    events: [event("s1")],
    resources: [
      { capacityHours: 38, costCentsPerHour: 3200, id: "r-a", name: "A" },
    ],
    window: { end: new Date(Date.UTC(2026, 7, 31)), start: new Date(Date.UTC(2026, 7, 17)) },
  });
  assertEqual(
    problem.resources[0]?.contract?.maxHoursPerWindow,
    76,
    "38h/week over a fortnight",
  );
  assertEqual(problem.resources[0]?.contract?.type, "fixed", "contract type: capacity is a ceiling on an available person");
  assertEqual(problem.resources[0]?.costCentsPerHour, 3200, "cost on the wire");
}

// Q4-B: capabilities ride the ENVELOPE, never the problem body, and
// survive redaction untouched.
{
  const problem = problemFromSchedule({
    events: [event("s1")],
    resources: [{ id: "r-a", name: "A" }],
    window: { end: at(24), start: at(0) },
  });
  const request = buildSolveRequest(redactProblem(problem).problem, {
    capabilities: ["assignment", "roles"],
    solverSeconds: 2,
    tenantId: "tenant-dev-a",
  });
  assertEqual(request.capabilities?.join(","), "assignment,roles", "envelope carries tiers");
  assertEqual(
    "capabilities" in request.problem,
    false,
    "problem body stays pure",
  );
  const bare = buildSolveRequest(problem, { solverSeconds: 2, tenantId: "t" });
  assertEqual("capabilities" in bare, false, "absent when not declared");
}

// Ruled 2026-10-02 (option A): the board works in the site's clock, and
// the wire carries real moments and the site's zone. A Perth board,
// viewed from any browser, sends 09:00 Perth as 01:00 UTC.
{
  const zone = "Australia/Perth";
  const display = (instant: Date): Date => toDisplayZone(instant, zone);
  const shift = event("early", {
    end: display(new Date(Date.UTC(2026, 9, 5, 9, 0))),
    start: display(new Date(Date.UTC(2026, 9, 5, 1, 0))),
  });
  const problem = problemFromSchedule({
    events: [shift],
    resources: [{ id: "r-a", name: "A" }],
    timeZone: zone,
    toInstant: (date) => fromDisplayZone(date, zone),
    unavailability: [
      {
        end: display(new Date(Date.UTC(2026, 9, 6, 9, 0))),
        kind: "unavailable",
        resourceId: "r-a",
        start: display(new Date(Date.UTC(2026, 9, 6, 1, 0))),
      },
    ],
    window: {
      end: display(new Date(Date.UTC(2026, 9, 11, 16, 0))),
      start: display(new Date(Date.UTC(2026, 9, 4, 16, 0))),
    },
  });
  assertEqual(problem.shifts[0]?.start, "2026-10-05T01:00:00.000Z", "shift start is the real moment");
  assertEqual(problem.shifts[0]?.end, "2026-10-05T09:00:00.000Z", "shift end is the real moment");
  assertEqual(problem.unavailability[0]?.start, "2026-10-06T01:00:00.000Z", "unavailability is real");
  assertEqual(problem.window.start, "2026-10-04T16:00:00.000Z", "window opens at Perth's midnight");
  assertEqual(problem.timeZone, zone, "the problem names the site's zone");
  assertEqual(redactProblem(problem).problem.timeZone, zone, "redaction keeps the zone");

  // Without a zone the problem says nothing, as before.
  const plain = problemFromSchedule({
    events: [event("free")],
    resources: [{ id: "r-a", name: "A" }],
    window: { end: at(24), start: at(0) },
  });
  assertEqual("timeZone" in plain, false, "no zone, no field");
  assertEqual("timeZone" in redactProblem(plain).problem, false, "redaction adds none");
}

console.log("capabilities tests passed");
