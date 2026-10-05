import {
  applyProposalChanges,
  diffProposal,
  ghostIdOf,
  isGhostEvent,
  openShiftCount,
  previewProposal,
  proposalDoubleBookings,
  proposalMustRules,
  proposalPeople,
  proposalScore,
  type ProposalChange,
  type ScheduleProposal,
} from "../src/solve";
import { outOfDateChanges } from "../src/freshness";
import { problemFromSchedule } from "../src/schedulingContract";
import {
  buildSolveRequest,
  proposalFromSolution,
  solutionFromPoll,
} from "../src/solveTransport";
import type { SchedulerResource, SchedulerUiEvent } from "../src/types";

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

const at = (hour: number): Date => new Date(Date.UTC(2027, 1, 1, hour));

const people: readonly SchedulerResource[] = [
  { id: "mia", name: "Mia Wong", tags: ["Bar", "Supervisor"] },
  { id: "noah", name: "Noah Patel", tags: ["Floor", "First Aid"] },
];

const uncovered: SchedulerUiEvent = {
  end: at(15),
  id: "shift-1",
  requiredTags: ["Floor"],
  resourceId: "open",
  start: at(10),
  status: "needsCover",
  title: "Floor shift",
};

const assigned: SchedulerUiEvent = {
  end: at(18),
  id: "shift-2",
  resourceId: "mia",
  start: at(12),
  status: "assigned",
  title: "Bar shift",
};

const problem = problemFromSchedule({
  events: [uncovered, assigned],
  resources: people,
  window: { end: at(20), start: at(8) },
});

function problemStatesFactsAndIntentInOurNames(): void {
  assertEqual(problem.contractVersion, "2");
  assertEqual(problem.window.start, "2027-02-01T08:00:00.000Z");
  assertEqual(problem.shifts.length, 2);
  assertEqual(problem.shifts[0]?.assignment, undefined);
  assertEqual(problem.shifts[0]?.requiredSkills[0], "Floor");
  assertEqual(problem.shifts[1]?.assignment?.resourceId, "mia");
  // F22 deliverable 2 (Q1-A): pinning is a choice, not a default - an
  // unlocked existing assignment is a fact the solver may move.
  assertEqual(problem.shifts[1]?.assignment?.pinned, false);
  assertEqual(problem.resources[0]?.skills.length, 2);
}

function requestWrapsTheCanonicalProblemVerbatim(): void {
  const request = buildSolveRequest(problem, {
    solverSeconds: 2,
    tenantId: "tenant-dev-a",
  });
  assertEqual(request.problemType, "rostering");
  assertEqual(request.solutionType, "workforce-scheduling");
  assertEqual(request.tenantId, "tenant-dev-a");
  assertEqual(request.solverSeconds, 2);
  assertEqual(request.problem, problem);
  assertEqual(request.problem.shifts[0]?.requiredSkills[0], "Floor");
  // F39: the calendar's name rides along only when the host knows it.
  assertEqual("calendarName" in request, false);
  const named = buildSolveRequest(problem, { calendarName: "Night shift", solverSeconds: 2, tenantId: "tenant-dev-a" });
  assertEqual(named.calendarName, "Night shift");
}

function resultMapsAssignmentsOntoCurrentState(): void {
  const solution = solutionFromPoll("run-1", "succeeded", {
    assignments: [
      { resourceId: "noah", shiftId: "shift-1" },
      { resourceId: null, shiftId: "shift-2" },
    ],
    contractVersion: "2",
  });
  assertEqual(solution.status, "succeeded");
  assertEqual(solution.assignments.length, 2);
  const proposal = proposalFromSolution(solution, [uncovered, assigned]);
  assertEqual(proposal.runId, "run-1");
  assertEqual(proposal.events.length, 2);
  assertEqual(proposal.events[0]?.resourceId, "noah");
  assertEqual(proposal.events[0]?.status, "assigned");
  assertEqual(proposal.events[1], assigned);
}

function diffFindsAssignsAndMovesAndSkipsTheRest(): void {
  const proposal = {
    events: [
      { ...uncovered, resourceId: "noah", status: "assigned" as const },
      assigned, // unchanged: no entry
      { ...assigned, id: "unknown-id" }, // not in current: skipped
    ],
    runId: "run-1",
  };
  const changes = diffProposal([uncovered, assigned], proposal);
  assertEqual(changes.length, 1);
  assertEqual(changes[0]?.kind, "assign");
  assertEqual(changes[0]?.proposed.resourceId, "noah");

  const moved = diffProposal([assigned], {
    events: [{ ...assigned, start: at(13), end: at(19) }],
    runId: "run-2",
  });
  assertEqual(moved.length, 1);
  assertEqual(moved[0]?.kind, "move");
}

function applyReplacesExactlyTheChangedEvents(): void {
  const proposal = {
    events: [{ ...uncovered, resourceId: "noah", status: "assigned" as const }],
    runId: "run-1",
  };
  const changes = diffProposal([uncovered, assigned], proposal);
  const next = applyProposalChanges([uncovered, assigned], changes);
  assertEqual(next.length, 2);
  assertEqual(next[0]?.resourceId, "noah");
  assertEqual(next[0]?.status, "assigned");
  assertEqual(next[1], assigned);
}

problemStatesFactsAndIntentInOurNames();
requestWrapsTheCanonicalProblemVerbatim();
resultMapsAssignmentsOntoCurrentState();
diffFindsAssignsAndMovesAndSkipsTheRest();
applyReplacesExactlyTheChangedEvents();

console.log("solve tests passed");

/*
 * F31: the preview marks every kept change at its proposed place,
 * ghosts the current place of a moved item, and leaves dropped or
 * blocked changes as they are.
 */
{
  const placed: SchedulerUiEvent = {
    end: at(12),
    id: "s-moved",
    resourceId: "mia",
    start: at(8),
    status: "assigned",
    title: "Bar open",
  };
  const open: SchedulerUiEvent = {
    end: at(16),
    id: "s-open",
    resourceId: "open",
    start: at(12),
    status: "needsCover",
    title: "Floor",
  };
  const same: SchedulerUiEvent = {
    end: at(20),
    id: "s-same",
    resourceId: "noah",
    start: at(16),
    status: "assigned",
    title: "Close",
  };
  const current = [placed, open, same];
  const proposal: ScheduleProposal = {
    events: [
      { ...placed, resourceId: "noah" },
      { ...open, resourceId: "mia", status: "assigned" },
      same,
    ],
    runId: "run-p",
  };
  const changes = diffProposal(current, proposal);
  assertEqual(changes.length, 2);

  const preview = previewProposal(current, changes);
  assertEqual(preview.unscheduled.length, 0);
  assertEqual(preview.scheduled.length, 4);
  const moved = preview.scheduled.find((event) => event.id === "s-moved");
  assertEqual(moved?.resourceId, "noah");
  assertEqual(moved?.review, "proposed");
  const ghost = preview.scheduled.find(
    (event) => event.id === ghostIdOf("s-moved"),
  );
  assertEqual(ghost?.resourceId, "mia");
  assertEqual(ghost?.review, "ghost");
  assertEqual(ghost ? isGhostEvent(ghost) : false, true);
  assertEqual(
    preview.scheduled.find((event) => event.id === "s-open")?.review,
    "proposed",
  );
  assertEqual(
    preview.scheduled.find((event) => event.id === "s-same")?.review,
    undefined,
  );

  const dropped = previewProposal(current, changes, {
    dropped: new Set(["s-moved"]),
  });
  assertEqual(
    dropped.scheduled.find((event) => event.id === "s-moved")?.resourceId,
    "mia",
  );
  assertEqual(dropped.scheduled.some((event) => event.review === "ghost"), false);

  const withheld = previewProposal(current, changes, {
    withheld: new Set(["s-open"]),
  });
  assertEqual(withheld.unscheduled.length, 1);
  assertEqual(withheld.unscheduled[0]?.review, undefined);
  assertEqual(withheld.scheduled.length, 3);
}

/*
 * F40 Three-level score: an empty answer takes the person off, except
 * on a locked shift. The change is "unassign" and leaves a ghost like
 * a move; the open count follows Drop and Keep; the Must-rules
 * statement speaks only for the whole proposal.
 */
{
  const early: SchedulerUiEvent = {
    end: at(12),
    id: "s-early",
    resourceId: "mia",
    start: at(8),
    status: "assigned",
    title: "Early",
  };
  const locked: SchedulerUiEvent = { ...early, id: "s-locked", pinned: true, title: "Locked" };
  const open: SchedulerUiEvent = {
    end: at(16),
    id: "s-open",
    resourceId: "open",
    start: at(12),
    status: "needsCover",
    title: "Floor",
  };
  const current = [early, locked, open];
  const solution = solutionFromPoll("run-f40", "succeeded", {
    assignments: [
      { resourceId: null, shiftId: "s-early" },
      { resourceId: null, shiftId: "s-locked" },
      { resourceId: null, shiftId: "s-open" },
    ],
    contractVersion: "2",
    feasible: true,
    missingDemandHalfHours: 0,
    openShifts: 2,
  });
  assertEqual(solution.feasible, true);
  assertEqual(solution.openShifts, 2);

  // Without the host's id for nobody, an empty answer leaves every shift as it stands.
  assertEqual(diffProposal(current, proposalFromSolution(solution, current)).length, 0);

  const proposal = proposalFromSolution(solution, current, { unassignedResourceId: "open" });
  assertEqual(proposal.feasible, true);
  assertEqual(proposal.events[0]?.resourceId, "open");
  assertEqual(proposal.events[0]?.status, "needsCover");
  assertEqual(proposal.events[1], locked);
  const changes = diffProposal(current, proposal);
  assertEqual(changes.length, 1);
  assertEqual(changes[0]?.kind, "unassign");

  const preview = previewProposal(current, changes);
  assertEqual(
    preview.unscheduled.some((event) => event.id === "s-early" && event.review === "proposed"),
    true,
  );
  const ghost = preview.scheduled.find((event) => event.id === ghostIdOf("s-early"));
  assertEqual(ghost?.resourceId, "mia");
  assertEqual(ghost?.review, "ghost");

  // Two open if applied as it stands; one once the change is dropped or withheld.
  assertEqual(openShiftCount(proposal, changes), 2);
  assertEqual(openShiftCount(proposal, changes, { dropped: new Set(["s-early"]) }), 1);
  assertEqual(openShiftCount(proposal, changes, { withheld: new Set(["s-early"]) }), 1);

  assertEqual(proposalMustRules(proposal), "kept");
  assertEqual(proposalMustRules({ ...proposal, feasible: false }), "broken");
  assertEqual(proposalMustRules(proposal, { dropped: new Set(["s-early"]) }), undefined);
  assertEqual(proposalMustRules({ events: [], runId: "run-older-api" }), undefined);
  console.log("F40 proposal tests passed");
}

/*
 * F31 rework scorecard: the figures follow Drop and Keep, as Apply
 * would leave the roster, and count only the period's shifts - the
 * pinned context before it is not the planner's to fill.
 */
function scorecardFollowsKeepAndPeriod(): void {
  const shift = (id: string, resourceId: string, start: number, open = false): SchedulerUiEvent => ({
    end: at(start + 4),
    id,
    resourceId,
    start: at(start),
    status: open ? "needsCover" : "assigned",
    title: id,
  });
  const current = [
    shift("s-a", "mia", 8),
    shift("s-b", "open", 12, true),
    shift("s-c", "noah", 9),
    shift("s-context", "noah", 2),
  ];
  const proposal = proposalFromSolution(
    solutionFromPoll("run-score", "succeeded", {
      assignments: [
        { resourceId: "noah", shiftId: "s-a" },
        { resourceId: "mia", shiftId: "s-b" },
        { resourceId: "noah", shiftId: "s-c" },
        { resourceId: "noah", shiftId: "s-context" },
      ],
      contractVersion: "2",
    }),
    current,
    { unassignedResourceId: "open" },
  );
  const changes = diffProposal(current, proposal);
  const period = { end: at(20), start: at(6) };

  const all = proposalScore(proposal, changes, {}, period);
  assertEqual(all.total, 3);
  assertEqual(all.filledNow, 2);
  assertEqual(all.filledProposed, 3);
  assertEqual(all.kept, 2);
  // Mia loses Early and takes the open shift; Noah takes Early.
  assertEqual(all.peopleAffected, 2);

  const dropped = proposalScore(proposal, changes, { dropped: new Set(["s-b"]) }, period);
  assertEqual(dropped.filledProposed, 2);
  assertEqual(dropped.kept, 1);
  assertEqual(dropped.peopleAffected, 2);

  const none = proposalScore(proposal, changes, { withheld: new Set(["s-a", "s-b"]) }, period);
  assertEqual(none.filledProposed, none.filledNow);
  assertEqual(none.kept, 0);
  assertEqual(none.peopleAffected, 0);

  // Without a period every shift the solver answered for counts.
  const unscoped = proposalScore(proposal, changes);
  assertEqual(unscoped.total, 4);
  assertEqual(unscoped.filledNow, 3);
  assertEqual(unscoped.filledProposed, 4);

  // What the search did travels from the answer to the proposal; a malformed set does not.
  const searched = proposalFromSolution(
    solutionFromPoll("run-search", "succeeded", {
      assignments: [{ resourceId: "noah", shiftId: "s-a" }],
      contractVersion: "2",
      search: { betterRostersFound: 14, rostersChecked: 1234567, solvingMillis: 28400 },
    }),
    current,
  );
  assertEqual(searched.search?.rostersChecked, 1234567);
  assertEqual(searched.search?.betterRostersFound, 14);
  assertEqual(searched.search?.solvingMillis, 28400);
  // The proposal carries the period the run solved, so the scorecard
  // counts what Apply writes, not the days on screen.
  const windowed = proposalFromSolution(
    solutionFromPoll("run-window", "succeeded", { assignments: [], contractVersion: "2" }),
    current,
    { window: period },
  );
  assertEqual(windowed.window, period);
  assertEqual(searched.window, undefined);
  const malformed = solutionFromPoll("run-bad", "succeeded", {
    assignments: [],
    contractVersion: "2",
    search: { betterRostersFound: -1, rostersChecked: 5, solvingMillis: 10 },
  });
  assertEqual(malformed.search, undefined);
  console.log("scorecard tests passed");
}
scorecardFollowsKeepAndPeriod();

/*
 * F31 rework, above 24 changes: one line per person, with their shifts
 * and hours. A change counts for the person it gives the shift to, or
 * for the person it takes the shift from when it leaves it open.
 */
function changeListPerPerson(): void {
  const shift = (id: string, resourceId: string, start: number, hours: number, open = false): SchedulerUiEvent => ({
    end: at(start + hours),
    id,
    resourceId,
    start: at(start),
    status: open ? "needsCover" : "assigned",
    title: id,
  });
  const changes: ProposalChange[] = [
    { current: shift("a", "open", 8, 4, true), kind: "assign", proposed: shift("a", "noah", 8, 4) },
    { current: shift("b", "mia", 9, 6), kind: "move", proposed: shift("b", "noah", 9, 6) },
    { current: shift("c", "mia", 14, 3), kind: "unassign", proposed: shift("c", "open", 14, 3, true) },
  ];
  const names = new Map([["mia", "Mia Wong"], ["noah", "Noah Patel"]]);
  const lines = proposalPeople(changes, (id) => names.get(id) ?? id);
  assertEqual(lines.length, 2);
  // Noah takes two shifts, ten hours; Mia loses one, three hours.
  assertEqual(lines[0]?.resourceId, "noah");
  assertEqual(lines[0]?.changes, 2);
  assertEqual(lines[0]?.minutes, 600);
  assertEqual(lines[1]?.resourceId, "mia");
  assertEqual(lines[1]?.changes, 1);
  assertEqual(lines[1]?.minutes, 180);
  console.log("change list per person tests passed");
}
changeListPerPerson();

/*
 * F31 rework: the solver's plan is judged whole. A three-way rotation
 * has no double booking until the planner drops one step; then the
 * dropped shift stays and the kept step that lands on its person is a
 * double booking. "block" withholds it, so ITS shift stays too and the
 * check runs again; "warn" only notes it; "off" says nothing.
 */
{
  const shift = (id: string, person: string, from: number, to: number): SchedulerUiEvent => ({
    end: at(to),
    id,
    resourceId: person,
    start: at(from),
    status: "assigned",
    title: id,
  });
  const b = shift("b", "alex", 11, 15);
  const c = shift("c", "sam", 10, 16);
  const d = shift("d", "riley", 10, 16);
  const rotation = diffProposal([b, c, d], {
    events: [
      { ...b, resourceId: "sam" },
      { ...c, resourceId: "riley" },
      { ...d, resourceId: "alex" },
    ],
    runId: "run-rotation",
  });
  assertEqual(rotation.length, 3);
  assertEqual(proposalDoubleBookings(rotation, { policy: "block" }).size, 0);
  assertEqual(proposalDoubleBookings(rotation, { policy: "warn" }).size, 0);

  const dropD = new Set(["d"]);
  const warned = proposalDoubleBookings(rotation, { dropped: dropD, policy: "warn" });
  assertEqual(warned.size, 1);
  assertEqual(warned.get("c")?.kind, "warn");
  assertEqual(warned.get("c")?.with.id, "d");

  const blocked = proposalDoubleBookings(rotation, { dropped: dropD, policy: "block" });
  assertEqual(blocked.size, 2);
  assertEqual(blocked.get("c")?.with.id, "d");
  assertEqual(blocked.get("b")?.with.id, "c");

  assertEqual(proposalDoubleBookings(rotation, { dropped: dropD, policy: "off" }).size, 0);
  // An out-of-date change leaves its shift in place like a drop.
  assertEqual(
    proposalDoubleBookings(rotation, { outOfDate: new Set(["d"]), policy: "warn" }).get("c")?.with.id,
    "d",
  );
  console.log("double booking tests passed");
}

/*
 * F31 rework, freshness: a change is out of date when its shift
 * changed, when it started, when its person now has another shift or
 * leave at that time, or when the person's record changed. Ids compare
 * without braces or case.
 */
{
  const strings = {
    proposalReasonChanged: "changed",
    proposalReasonNewShift: "new shift for {person}",
    proposalReasonPersonChanged: "record of {person}",
    proposalReasonStarted: "started",
    proposalReasonUnavailable: "{person} away",
  };
  const shift = (id: string, person: string, from: number, to: number): SchedulerUiEvent => ({
    end: at(to),
    id,
    resourceId: person,
    start: at(from),
    status: "assigned",
    title: id,
  });
  const late = shift("late", "mia", 14, 18);
  const other = shift("other", "noah", 14, 18);
  const [change] = diffProposal([late], {
    events: [{ ...late, resourceId: "noah" }],
    runId: "run-fresh",
  });
  if (!change) {
    throw new Error("expected one change");
  }
  const before = { bands: [], events: [late], personVersions: new Map([["noah", "v1"]]) };
  const check = (after: Parameters<typeof outOfDateChanges>[0]["after"], at0 = at(9)) =>
    outOfDateChanges({
      after,
      at: at0,
      before,
      changes: [change],
      resourceName: (id) => (id === "noah" ? "Noah" : id),
      strings,
    }).get("late");

  assertEqual(check({ bands: [], events: [late], personVersions: new Map([["NOAH", "v1"]]) }), undefined);
  assertEqual(check({ bands: [], events: [{ ...late, end: at(19) }] }), "changed");
  assertEqual(check({ bands: [], events: [] }), "changed");
  assertEqual(check({ bands: [], events: [{ ...late, id: "{LATE}" }] }), undefined);
  assertEqual(check({ bands: [], events: [late] }, at(15)), "started");
  assertEqual(check({ bands: [], events: [late, other] }), "new shift for Noah");
  // A shift the solver already saw with that person is not new.
  assertEqual(
    outOfDateChanges({
      after: { bands: [], events: [late, other] },
      at: at(9),
      before: { bands: [], events: [late, other] },
      changes: [change],
      resourceName: () => "Noah",
      strings,
    }).size,
    0,
  );
  const leave = { end: at(23), kind: "unavailable" as const, resourceId: "noah", start: at(12) };
  assertEqual(check({ bands: [leave], events: [late] }), "Noah away");
  assertEqual(
    check({ bands: [{ ...leave, kind: "preferred" as const }], events: [late] }),
    undefined,
  );
  assertEqual(
    check({ bands: [], events: [late], personVersions: new Map([["noah", "v2"]]) }),
    "record of Noah",
  );
  console.log("freshness tests passed");
}

/*
 * F31 rework: a planner does not change history. With "now", an
 * assigned shift in the window that started travels pinned (it still
 * counts toward the window), and an open one that started stays out.
 */
{
  const window = { end: at(24), start: at(0) };
  const started: SchedulerUiEvent = {
    end: at(12),
    id: "started",
    resourceId: "mia",
    start: at(8),
    status: "assigned",
    title: "Started",
  };
  const later: SchedulerUiEvent = { ...started, end: at(20), id: "later", start: at(16) };
  const pastOpen: SchedulerUiEvent = { ...uncovered, end: at(9), id: "past-open", start: at(7) };
  const problem = problemFromSchedule({
    events: [started, later, pastOpen, uncovered],
    now: at(9),
    resources: people,
    window,
  });
  const byId = new Map(problem.shifts.map((shift) => [shift.id, shift]));
  assertEqual(byId.get("started")?.assignment?.pinned, true);
  assertEqual(byId.get("later")?.assignment?.pinned, false);
  assertEqual(byId.has("past-open"), false);
  assertEqual(byId.has("shift-1"), true);
  const noHistory = problemFromSchedule({
    events: [started, pastOpen],
    resources: people,
    window,
  });
  assertEqual(noHistory.shifts.length, 2);
  assertEqual(noHistory.shifts[0]?.assignment?.pinned, false);
  console.log("history pinning tests passed");
}

/*
 * A pin is a pin (Matt 2026-09-30): the solver leaves a pinned shift
 * alone. A pinned open shift stays out, so it stays open; a pinned
 * assigned one travels pinned, whatever the override says.
 */
{
  const window = { end: at(24), start: at(0) };
  const pinnedOpen: SchedulerUiEvent = { ...uncovered, id: "pinned-open", pinned: true };
  const pinnedAssigned: SchedulerUiEvent = {
    end: at(20),
    id: "pinned-assigned",
    pinned: true,
    resourceId: "mia",
    start: at(16),
    status: "assigned",
    title: "Pinned",
  };
  for (const pinAssigned of [undefined, false]) {
    const problem = problemFromSchedule({
      events: [pinnedOpen, pinnedAssigned, uncovered],
      pinAssigned,
      resources: people,
      window,
    });
    const byId = new Map(problem.shifts.map((shift) => [shift.id, shift]));
    assertEqual(byId.has("pinned-open"), false);
    assertEqual(byId.get("pinned-assigned")?.assignment?.pinned, true);
    assertEqual(byId.has(uncovered.id), true);
  }
  console.log("pin tests passed");
}
