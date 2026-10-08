import * as assert from "node:assert/strict";

import { englishDateNames } from "../src/dateNames";
import {
  DRILL_DOWN_LIMIT,
  drillDownEntries,
  personFixCounts,
  proposalReasons,
} from "../src/proposalReasons";
import type {
  MustBreachCounts,
  ScheduleRuleMatch,
  ScheduleSolveAnalysis,
} from "../src/schedulingContract";
import {
  diffProposal,
  MUST_ROWS,
  mustRowCount,
  mustRowMatches,
  openShiftCount,
  openShiftsAfter,
  proposalMustReport,
  type ScheduleProposal,
} from "../src/solve";
import { defaultSchedulerStrings } from "../src/stringResources";
import type { SchedulerUiEvent } from "../src/types";

/*
 * The review's Must report and reasons (design Pass 1 calls 2 to 6,
 * R10, A11, DR2-Q1, RR3-D1, RR2-D8): counts now against proposed, the
 * board's count after a hold-back, the matches a row opens to, one
 * reason line per change and the drill-down's entries.
 */

const day = (date: number, hour: number, minute = 0): Date => new Date(2026, 10, date, hour, minute);

const shift = (
  id: string,
  resourceId: string,
  start: Date,
  hours: number,
  extra: Partial<SchedulerUiEvent> = {},
): SchedulerUiEvent => ({
  end: new Date(start.getTime() + hours * 3_600_000),
  id,
  resourceId,
  start,
  status: resourceId === "open" ? "needsCover" : "assigned",
  title: id.startsWith("n") ? "Night" : "Day",
  ...extra,
});

const zero: MustBreachCounts = {
  daysInARow: 0,
  onLeaveOrUnavailable: 0,
  other: { maximumHours: 0, overlap: 0, splitParts: 0, unlisted: 0 },
  restBetweenShifts: 0,
  skills: 0,
};
const counts = (patch: Partial<Omit<MustBreachCounts, "other">> & { other?: Partial<MustBreachCounts["other"]> }): MustBreachCounts => ({
  ...zero,
  ...patch,
  other: { ...zero.other, ...patch.other },
});

// Sam works Monday night to 06:00 and Tuesday 14:00 (8 h rest); the run moves the night to Ava.
const night = shift("n1", "sam", day(2, 22), 8);
const tuesday = shift("d2", "sam", day(3, 14), 8);
const open = shift("d3", "open", day(3, 9), 8);
const current = [night, tuesday, open];
const restMatch: ScheduleRuleMatch = { resourceId: "sam", rule: "restBetweenShifts", shiftIds: ["n1", "d2"] };
const analysis: ScheduleSolveAnalysis = {
  current: { matches: [restMatch], mustBreaches: counts({ restBetweenShifts: 1 }), openShifts: 1 },
  proposed: {
    matches: [{ resourceId: "ava", rule: "unpreferredTime", shiftIds: ["d3"] }],
    mustBreaches: zero,
    openShifts: 0,
  },
};
const proposal: ScheduleProposal = {
  analysis,
  events: [
    { ...night, resourceId: "ava" },
    tuesday,
    { ...open, resourceId: "ava", status: "assigned" },
  ],
  feasible: true,
  runId: "run-1",
};
const changes = diffProposal(current, proposal);
const names = new Map([
  ["ava", "Ava"],
  ["sam", "Sam"],
]);
const context = {
  eventsById: new Map(current.map((event) => [event.id, event])),
  nameOf: (id: string): string => names.get(id) ?? id,
  strings: defaultSchedulerStrings,
};

function rowsAddUpToTheTotal(): void {
  const all = counts({
    daysInARow: 2,
    onLeaveOrUnavailable: 3,
    other: { maximumHours: 1, overlap: 4, splitParts: 5, unlisted: 6 },
    restBetweenShifts: 7,
    skills: 8,
  });
  assert.deepEqual(
    MUST_ROWS.map((row) => mustRowCount(all, row)),
    [7, 2, 8, 3, 16],
  );
}

function aFreshProposalShowsTheSolversCounts(): void {
  let recounted = 0;
  const report = proposalMustReport(proposal, {}, () => {
    recounted += 1;
    return { matches: [], mustBreaches: zero };
  });
  assert.equal(recounted, 0, "no board count right after Optimize");
  assert.equal(report.source, "solver");
  assert.equal(report.now?.restBetweenShifts, 1);
  assert.equal(report.proposed?.restBetweenShifts, 0);
  // The proposal leaves the row clean, so it opens to what it fixes.
  assert.deepEqual(mustRowMatches(report, "restBetweenShifts"), { matches: [restMatch], roster: "now" });
  assert.equal(mustRowMatches(report, "skills"), undefined, "a zero row opens nothing");
}

function aHoldBackRecountsOnTheBoard(): void {
  const boardMatch: ScheduleRuleMatch = { resourceId: "sam", rule: "restBetweenShifts", shiftIds: ["n1", "d2"] };
  const report = proposalMustReport(proposal, { dropped: new Set(["n1"]) }, () => ({
    matches: [boardMatch],
    mustBreaches: counts({ restBetweenShifts: 1 }),
  }));
  assert.equal(report.source, "board");
  assert.equal(report.proposed?.restBetweenShifts, 1);
  assert.equal(report.now?.restBetweenShifts, 1, "now stays the solver's");
  assert.deepEqual(mustRowMatches(report, "restBetweenShifts"), { matches: [boardMatch], roster: "proposed" });
  // Without a board counter (the free board) a hold-back leaves the proposed side uncounted.
  assert.equal(proposalMustReport(proposal, { withheld: new Set(["n1"]) }).proposed, undefined);
}

function countsOnlyOpensNothing(): void {
  const large: ScheduleProposal = {
    ...proposal,
    analysis: {
      countsOnly: true,
      current: { mustBreaches: counts({ restBetweenShifts: 1 }), openShifts: 1 },
      proposed: { mustBreaches: counts({ restBetweenShifts: 1 }), openShifts: 0 },
    },
  };
  const report = proposalMustReport(large);
  assert.equal(report.countsOnly, true);
  assert.equal(mustRowMatches(report, "restBetweenShifts"), undefined);
  assert.equal(proposalReasons(changes, large.analysis, context).size, 0, "no reason lines above the size limit");
  // Absent analysis: nothing counted, nothing invented.
  const bare: ScheduleProposal = { events: proposal.events, feasible: true, runId: "run-2" };
  assert.equal(proposalMustReport(bare).proposed, undefined);
  assert.equal(proposalReasons(changes, undefined, context).size, 0);
}

function eachChangeGetsOneReason(): void {
  const reasons = proposalReasons(changes, analysis, context);
  assert.deepEqual(reasons.get("n1"), { text: "Fixes Sam's rest (8 h)", tone: "fix" });
  // Ava's new shift falls in her unpreferred time: the strain outranks filling it.
  assert.deepEqual(reasons.get("d3"), { text: "Ava prefers not to work then", tone: "strain" });

  // An added short rest outranks anything the change fixes.
  const adds: ScheduleSolveAnalysis = {
    current: { matches: [restMatch], mustBreaches: counts({ restBetweenShifts: 1 }), openShifts: 1 },
    proposed: {
      matches: [{ resourceId: "ava", rule: "restBetweenShifts", shiftIds: ["n1", "d3"] }],
      mustBreaches: counts({ restBetweenShifts: 1 }),
      openShifts: 0,
    },
  };
  const added = proposalReasons(changes, adds, context);
  assert.deepEqual(added.get("n1"), { text: "Adds a short rest for Ava (3 h)", tone: "add" });

  // A change no match names: an assignment fills an open shift, a move gets no line.
  const quiet: ScheduleSolveAnalysis = {
    current: { matches: [], mustBreaches: zero, openShifts: 1 },
    proposed: { matches: [], mustBreaches: zero, openShifts: 0 },
  };
  const plain = proposalReasons(changes, quiet, context);
  assert.deepEqual(plain.get("d3"), { text: "Fills an open shift", tone: "fix" });
  assert.equal(plain.has("n1"), false, "nothing invented");

  // A rest whose earlier shift is look-back (not on the board) still fixes a Must rule.
  const history: ScheduleSolveAnalysis = {
    current: {
      matches: [{ resourceId: "sam", rule: "restBetweenShifts", shiftIds: ["history-1", "n1"] }],
      mustBreaches: counts({ restBetweenShifts: 1 }),
      openShifts: 1,
    },
    proposed: { matches: [], mustBreaches: zero, openShifts: 0 },
  };
  assert.deepEqual(proposalReasons(changes, history, context).get("n1"), {
    text: "Fixes a Must rule break",
    tone: "fix",
  });
}

function personLinesCountTheirFixes(): void {
  // Both of Ava's changes are hers; the one rest fix counts once.
  const fixes = personFixCounts(changes, analysis);
  assert.equal(fixes.get("ava"), 1);
  assert.equal(fixes.has("sam"), false);
}

function theOpenShiftsFollowDropAndKeep(): void {
  assert.deepEqual(openShiftsAfter(proposal, changes).map((event) => event.id), []);
  assert.deepEqual(
    openShiftsAfter(proposal, changes, { dropped: new Set(["d3"]) }).map((event) => event.id),
    ["d3"],
  );
  assert.equal(openShiftCount(proposal, changes, { dropped: new Set(["d3"]) }), 1);
}

function drillDownEntriesNameWhoAndWhen(): void {
  const entries = drillDownEntries(
    [
      restMatch,
      { days: ["2026-11-02", "2026-11-03"], resourceId: "sam", rule: "daysInARow", shiftIds: ["n1", "d2"] },
      { resourceId: "sam", rule: "overlap", shiftIds: ["d2", "n1"] },
      { resourceId: "sam", rule: "restBetweenShifts", shiftIds: ["history-1", "d2"] },
    ],
    { ...context, names: englishDateNames },
  );
  assert.equal(entries[0]?.label, "Sam · Tue 3 Nov 06:00 → Tue 3 Nov 14:00");
  assert.deepEqual(entries[0]?.shiftIds, ["n1", "d2"]);
  assert.equal(entries[1]?.label, "Sam · Mon 2 Nov – Tue 3 Nov");
  // "Other Must rules" entries lead with their kind.
  assert.equal(entries[2]?.label, "Double booking · Sam · Night · Mon 2 Nov 22:00-06:00, 14:00-22:00");
  // A look-back shift is not on the board: the entry shows and selects what the board has.
  assert.deepEqual(entries[3]?.shiftIds, ["d2"]);
  assert.equal(DRILL_DOWN_LIMIT, 50);
}

rowsAddUpToTheTotal();
aFreshProposalShowsTheSolversCounts();
aHoldBackRecountsOnTheBoard();
countsOnlyOpensNothing();
eachChangeGetsOneReason();
personLinesCountTheirFixes();
theOpenShiftsFollowDropAndKeep();
drillDownEntriesNameWhoAndWhen();

console.log("mustReport tests passed");
