import * as assert from "node:assert/strict";

import { englishDateNames } from "../src/dateNames";
import type { ScheduleCandidateCheck, ScheduleRuleMatch } from "../src/schedulingContract";
import { defaultSchedulerStrings as strings } from "../src/stringResources";
import type { SchedulerResource, SchedulerUiEvent } from "../src/types";
import { whyNotAction, whyNotLines, whyNotShiftLabel, whyNotVerdict, type WhyNotActionInput } from "../src/whyNot";

/*
 * "Why not…?" (E2, A2; design DR2 calls 3, 4 and 12, DR2-Q2): the
 * verdict comes first, the rule lines follow for the person picked and
 * the person taken off, and on the current roster the answer offers an
 * assign when the person is free, a swap when both moves pass the
 * board's Must checks, or names the shift left open.
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

const people: readonly SchedulerResource[] = [
  { id: "ava", name: "Ava", tags: ["Senior"] },
  { id: "sam", name: "Sam", tags: ["Senior"] },
  { id: "kai", name: "Kai", tags: [] },
];
const names = new Map(people.map((person) => [person.id, person.name]));
const nameOf = (id: string): string => names.get(id) ?? id;

const check = (patch: Partial<ScheduleCandidateCheck>): ScheduleCandidateCheck => ({
  added: [],
  fit: "worse",
  removed: [],
  ...patch,
});

function verdictLeadsWithAMustRule(): void {
  const rest: ScheduleRuleMatch = { resourceId: "ava", rule: "restBetweenShifts", shiftIds: ["d1", "n2"] };
  const skill: ScheduleRuleMatch = { resourceId: "ava", rule: "skills", shiftIds: ["n2"] };
  assert.deepEqual(whyNotVerdict(check({ added: [rest] }), "Ava", strings, false), {
    text: "Ava would break 1 Must rule",
    tone: "add",
  });
  assert.equal(whyNotVerdict(check({ added: [rest, skill] }), "Ava", strings, false).text, "Ava would break 2 Must rules");
  // A Must rule outranks the fit: it is named even when the fit is better.
  assert.equal(whyNotVerdict(check({ added: [skill], fit: "better" }), "Ava", strings, false).tone, "add");
  // Should rules only.
  const unpreferred: ScheduleRuleMatch = { resourceId: "ava", rule: "unpreferredTime", shiftIds: ["n2"] };
  assert.deepEqual(whyNotVerdict(check({ added: [unpreferred] }), "Ava", strings, false), {
    text: "Ava keeps every Must rule but fits less well",
    tone: "strain",
  });
  // As good a fit: in review Optimize had to pick; on the roster as it stands it just fits.
  assert.equal(whyNotVerdict(check({ fit: "equal" }), "Ava", strings, true).text, "Ava fits as well. Optimize had to pick one.");
  assert.equal(whyNotVerdict(check({ fit: "equal" }), "Ava", strings, false).text, "Ava fits as well.");
  assert.deepEqual(whyNotVerdict(check({ fit: "better" }), "Ava", strings, false), { text: "Ava fits better.", tone: "fix" });
}

function linesSplitByPersonAndWordEachRule(): void {
  const events = [shift("d1", "ava", day(2, 7), 8), shift("n2", "sam", day(2, 23), 8), shift("d3", "sam", day(3, 15), 8)];
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const answer = check({
    added: [
      { resourceId: "ava", rule: "restBetweenShifts", shiftIds: ["d1", "n2"] },
      { resourceId: "ava", rule: "skills", shiftIds: ["n2"] },
      { resourceId: "ava", rule: "unpreferredTime", shiftIds: ["n2"] },
      { rule: "spreadOfShifts", shiftIds: ["n2", "d1"] },
      { rule: "spreadOfShifts", shiftIds: ["n2", "d3"] },
      { resourceId: "kai", rule: "minimumHours", shiftIds: [] },
    ],
    removed: [
      { resourceId: "sam", rule: "restBetweenShifts", shiftIds: ["n2", "d3"] },
      { resourceId: "sam", rule: "preferredTime", shiftIds: ["n2"] },
      { rule: "spreadOfShifts", shiftIds: ["n2", "x"] },
      { resourceId: "kai", rule: "minimumHours", shiftIds: [] },
    ],
  });
  const lines = whyNotLines(answer, { eventsById, nameOf, strings, takenOffId: "sam" });
  assert.deepEqual(lines.picked, [
    // Without the extension's words, a short rest reads with its gap and other rules by name.
    { text: "Adds a short rest for Ava (8 h)", tone: "add" },
    { text: "Skills", tone: "add" },
    { text: "Ava prefers not to work then", tone: "strain" },
    // Two spread pairs added, one removed: less even, never a count. Kai's minimum hours net out.
    { text: "Spread of shifts: less even", tone: "strain" },
  ]);
  assert.deepEqual(lines.takenOff, [
    { text: "Fixes Sam's rest (8 h)", tone: "fix" },
    // Preferred time lost strains.
    { text: "Sam prefers to work then", tone: "strain" },
  ]);
  // The extension's words win for a Must match it knows.
  const described = whyNotLines(check({ added: [{ resourceId: "ava", rule: "restBetweenShifts", shiftIds: ["d1", "n2"] }] }), {
    describe: (match) => (match.rule === "restBetweenShifts" ? "Rest under 10 h (8 h gap)" : undefined),
    eventsById,
    nameOf,
    strings,
  });
  assert.deepEqual(described.picked, [{ text: "Rest under 10 h (8 h gap)", tone: "add" }]);
  // Removed unpreferred time and gained preferred time are fixes; an open shift has no one taken off.
  const open = whyNotLines(
    check({
      added: [{ resourceId: "ava", rule: "preferredTime", shiftIds: ["n2"] }],
      removed: [{ resourceId: "ava", rule: "unpreferredTime", shiftIds: ["n9"] }],
    }),
    { eventsById, nameOf, strings },
  );
  assert.deepEqual(open, {
    picked: [
      { text: "Ava prefers to work then", tone: "fix" },
      { text: "Avoids Ava's unpreferred time", tone: "fix" },
    ],
    takenOff: [],
  });
}

/** The board's Must count, cut down: a person lacking a shift's skill, or two shifts of one person overlapping. */
const checkMust = (events: readonly SchedulerUiEvent[]): { readonly matches: readonly ScheduleRuleMatch[] } => {
  const matches: ScheduleRuleMatch[] = [];
  for (const event of events) {
    if (event.status === "needsCover") {
      continue;
    }
    const person = people.find((candidate) => candidate.id === event.resourceId);
    if ((event.requiredTags ?? []).some((tag) => !(person?.tags ?? []).includes(tag))) {
      matches.push({ resourceId: event.resourceId, rule: "skills", shiftIds: [event.id] });
    }
  }
  return { matches };
};

const actionInput = (events: readonly SchedulerUiEvent[], shiftId: string, pickedId: string): WhyNotActionInput => ({
  checkMust,
  events,
  nameOf,
  names: englishDateNames,
  picked: people.find((person) => person.id === pickedId) as SchedulerResource,
  resources: people,
  shift: events.find((event) => event.id === shiftId) as SchedulerUiEvent,
  strings,
});

function assignsWhenThePersonIsFree(): void {
  const events = [shift("n2", "sam", day(2, 23), 8), shift("d4", "ava", day(4, 7), 8)];
  const action = whyNotAction(actionInput(events, "n2", "ava"));
  assert.equal(action.kind, "assign");
  if (action.kind === "assign") {
    assert.equal(action.change.event?.id, "n2");
    assert.deepEqual(action.change.result, { end: events[0]?.end, resourceId: "ava", start: events[0]?.start });
    assert.equal(action.change.verdict.kind, "allow");
  }
  // The maker's rules can refuse it: then no button, and their reason.
  const blocked = whyNotAction({
    ...actionInput(events, "n2", "ava"),
    validateChange: () => ({ kind: "block", reason: "Missing skill: Senior" }),
  });
  assert.deepEqual(blocked, { kind: "blocked", text: "Missing skill: Senior" });
  // A warning travels with the change.
  const warned = whyNotAction({
    ...actionInput(events, "n2", "ava"),
    validateChange: () => ({ kind: "warn", reason: "Rest under 10 h (8 h gap)" }),
  });
  assert.equal(warned.kind === "assign" ? warned.change.verdict.kind : "", "warn");
}

function swapsWhenBothMovesPass(): void {
  // Ava works d2a; Sam holds d2b at the same time and can take d2a.
  const events = [shift("d2a", "ava", day(2, 7), 8), shift("d2b", "sam", day(2, 7), 8)];
  const action = whyNotAction(actionInput(events, "d2b", "ava"));
  assert.equal(action.kind, "swap");
  if (action.kind === "swap") {
    assert.equal(action.other.id, "sam");
    // In order: the picked person onto the shift, then the person taken off onto theirs.
    assert.deepEqual(
      action.changes.map((change) => [change.event?.id, change.result.resourceId]),
      [
        ["d2b", "ava"],
        ["d2a", "sam"],
      ],
    );
    assert.deepEqual(action.lines, [
      { text: `Ava takes ${whyNotShiftLabel(events[1] as SchedulerUiEvent, englishDateNames)}`, tone: "move" },
      { text: `Sam takes ${whyNotShiftLabel(events[0] as SchedulerUiEvent, englishDateNames)}`, tone: "move" },
    ]);
  }
  // The swap fixes what the board counted before it.
  const skilled = [
    shift("d2a", "ava", day(2, 7), 8),
    shift("d2b", "kai", day(2, 7), 8, { requiredTags: ["Senior"] }),
  ];
  const fixing = whyNotAction(actionInput(skilled, "d2b", "ava"));
  assert.equal(fixing.kind, "swap");
  assert.deepEqual(fixing.kind === "swap" ? fixing.lines.slice(2) : [], [{ text: "Fixes a skill gap", tone: "fix" }]);
}

function namesTheShiftLeftOpenOtherwise(): void {
  // Ava's own shift needs a skill Kai, taken off, lacks: the swap would add a Must break.
  const events = [
    shift("d2a", "ava", day(2, 7), 8, { requiredTags: ["Senior"] }),
    shift("d2b", "kai", day(2, 7), 8),
  ];
  const action = whyNotAction(actionInput(events, "d2b", "ava"));
  assert.deepEqual(action, {
    kind: "leftOpen",
    text: `Ava's ${whyNotShiftLabel(events[0] as SchedulerUiEvent, englishDateNames)} would be left open`,
  });
  // An open shift has nobody to swap with.
  const open = [shift("d2a", "ava", day(2, 7), 8), shift("d2b", "open", day(2, 7), 8)];
  assert.equal(whyNotAction(actionInput(open, "d2b", "ava")).kind, "leftOpen");
  // The person taken off is busy at the time of the picked person's shift.
  const busy = [
    shift("d2a", "ava", day(2, 7), 8),
    shift("d2b", "sam", day(2, 7), 8),
    shift("d2c", "sam", day(2, 9), 4),
  ];
  assert.equal(whyNotAction(actionInput(busy, "d2b", "ava")).kind, "leftOpen");
  // Two overlapping shifts of the picked person: no single swap covers them.
  const twice = [
    shift("d2a", "ava", day(2, 7), 4),
    shift("d2c", "ava", day(2, 11), 4),
    shift("d2b", "sam", day(2, 7), 8),
  ];
  assert.equal(whyNotAction(actionInput(twice, "d2b", "ava")).kind, "leftOpen");
  // Without the board's Must count no swap is offered.
  const swappable = [shift("d2a", "ava", day(2, 7), 8), shift("d2b", "sam", day(2, 7), 8)];
  assert.equal(whyNotAction({ ...actionInput(swappable, "d2b", "ava"), checkMust: undefined }).kind, "leftOpen");
  // A pinned shift: no move changes it.
  const pinned = [shift("n2", "sam", day(2, 23), 8, { pinned: true })];
  assert.deepEqual(whyNotAction(actionInput(pinned, "n2", "ava")), { kind: "none" });
}

verdictLeadsWithAMustRule();
linesSplitByPersonAndWordEachRule();
assignsWhenThePersonIsFree();
swapsWhenBothMovesPass();
namesTheShiftLeftOpenOtherwise();
console.log("whyNot tests passed");
