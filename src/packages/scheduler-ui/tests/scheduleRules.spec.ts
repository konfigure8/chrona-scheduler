import {
  buildEventsByResource,
  compareShifts,
  defaultRulesConfig,
  evaluateScheduleRules,
  findBreakViolation,
  findRestShortfall,
  restShortfall,
  scheduleRuleOrder,
  shiftsOverlap,
  type MinimumRestAt,
  type SchedulerRulesConfig,
} from "../src/scheduleRules";
import type { SchedulerResource, SchedulerUiEvent } from "../src/types";

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

const day = (hour: number, minute = 0): Date =>
  new Date(2026, 7, 17, hour, minute);

const resources: readonly SchedulerResource[] = [
  { id: "r-1", name: "Casey", tags: ["Kitchen"] },
  { id: "r-2", name: "Dana", tags: ["Floor"] },
];

const shift = (
  id: string,
  resourceId: string,
  startHour: number,
  endHour: number,
): SchedulerUiEvent => ({
  end: day(endHour),
  id,
  resourceId,
  start: day(startHour),
  status: "assigned",
  title: `Shift ${id}`,
});

const events: readonly SchedulerUiEvent[] = [
  shift("e-1", "r-1", 6, 14),
  shift("e-2", "r-2", 9, 17),
];

const config: SchedulerRulesConfig = {
  ...defaultRulesConfig,
  minimumBreakMinutes: 60,
  workingEndHour: 22,
  workingHoursPolicy: "warn",
  workingStartHour: 6,
};

function extraRulesTakeTheirPlaceInTheOrder(): void {
  // Outside working hours (warn) and an extra rule ordered first (warn):
  // the extra rule's finding heads the list.
  const results = evaluateScheduleRules({
    config,
    event: undefined,
    events: [],
    extraRules: [
      {
        evaluate: () => ({ kind: "warn", reason: "First", scope: "person" }),
        order: scheduleRuleOrder.workingHours - 10,
      },
      {
        evaluate: () => undefined,
        order: scheduleRuleOrder.overlap + 10,
      },
    ],
    proposed: { end: day(23), resourceId: "r-1", start: day(21) },
    resources,
  });
  assertEqual(results.map((result) => result.reason).join(" | "), "First | Outside working hours (06:00-22:00)");
}

function breakUnderMinimumWarnsWithTheGap(): void {
  const results = evaluateScheduleRules({
    config,
    event: undefined,
    events,
    proposed: { end: day(16), resourceId: "r-1", start: day(14, 30) },
    resources,
  });
  assertEqual(results.length, 1);
  assertEqual(results[0]?.kind, "warn");
  assertEqual(results[0]?.reason, "Break under 60 min (30 min gap)");
  assertEqual(results[0]?.scope, "person");
}

function backToBackCountsAsZeroGapAndOverlapIsNotABreak(): void {
  // e-1 ends at 14:00: starting right there is a zero-minute gap.
  const zeroGap = findBreakViolation(
    events,
    undefined,
    "r-1",
    day(14),
    day(16),
    60,
  );
  assertEqual(zeroGap?.gapMinutes, 0);
  // Overlapping neighbor: the overlap rule's finding, not a break.
  assertEqual(
    findBreakViolation(events, undefined, "r-1", day(13), day(16), 60),
    undefined,
  );
  // A gap of exactly the minimum passes.
  assertEqual(
    findBreakViolation(events, undefined, "r-1", day(15), day(16), 60),
    undefined,
  );
  // The proposal's own event never collides with itself.
  assertEqual(
    findBreakViolation(events, "e-1", "r-1", day(6), day(14), 60),
    undefined,
  );
}

function minimumBreakZeroMeansOff(): void {
  const results = evaluateScheduleRules({
    config: { ...config, minimumBreakMinutes: 0 },
    event: undefined,
    events,
    proposed: { end: day(16), resourceId: "r-1", start: day(14, 30) },
    resources,
  });
  assertEqual(results.length, 0);
}

function indexedEvaluationHandlesCandidateLoopsAtStressScale(): void {
  // The dialog's worst case: one evaluation per person over the
  // stress dataset (2,000 people x 10 events). The shared index keeps
  // the loop linear in people; the bound is generous for slow CI.
  const people: SchedulerResource[] = [];
  const bulk: SchedulerUiEvent[] = [];
  const skills = ["Floor", "Bar", "Kitchen", "First Aid"];
  for (let person = 0; person < 2000; person += 1) {
    people.push({
      id: `s-${person}`,
      name: `Person ${person}`,
      tags: [skills[person % skills.length] ?? "Floor"],
    });
    for (let slot = 0; slot < 10; slot += 1) {
      bulk.push({
        ...shift(`s-${person}-${slot}`, `s-${person}`, 6 + slot, 7 + slot),
        requiredTags: [skills[slot % skills.length] ?? "Floor"],
      });
    }
  }
  const index = buildEventsByResource(bulk);
  const probe: SchedulerUiEvent = {
    ...shift("probe", "s-0", 18, 19),
    requiredTags: ["Kitchen"],
  };
  const started = Date.now();
  for (const person of people) {
    evaluateScheduleRules({
        config: { ...config, minimumBreakMinutes: 60 },
      event: probe,
      events: bulk,
      eventsByResource: index,
      proposed: { end: day(19), resourceId: person.id, start: day(18) },
      resources: people,
    });
  }
  const elapsed = Date.now() - started;
  if (elapsed >= 1500) {
    throw new Error(`Candidate loop took ${elapsed}ms (budget 1500ms)`);
  }
}

/*
 * Per-person rest (design R5b, R15; engineering T9): the minimum comes
 * from the person and from the date the later shift starts. The board's
 * own single-value check is untouched (R11(b)).
 */
const restDay = (date: number, hour: number, minute = 0): Date => new Date(2026, 6, date, hour, minute);
const restShift = (
  id: string,
  resourceId: string,
  start: Date,
  end: Date,
  split?: SchedulerUiEvent["split"],
): SchedulerUiEvent => ({ end, id, resourceId, start, split, status: "assigned", title: id });

function perPersonRestWarnsOnlyThatPerson(): void {
  // Casey works under a 10-hour minimum; Dana under none.
  const minimumFor = (resourceId: string): MinimumRestAt => () => (resourceId === "r-1" ? 600 : undefined);
  const roster = [
    restShift("c-1", "r-1", restDay(6, 7), restDay(6, 15)),
    restShift("d-1", "r-2", restDay(6, 7), restDay(6, 15)),
  ];
  const proposed = { end: restDay(7, 8), id: "new", start: restDay(7, 0) };
  const casey = findRestShortfall(roster.filter((event) => event.resourceId === "r-1"), undefined, proposed, minimumFor("r-1"));
  assertEqual(casey?.gapMinutes, 540);
  assertEqual(casey?.minimumMinutes, 600);
  assertEqual(casey?.neighborTitle, "c-1");
  const dana = findRestShortfall(roster.filter((event) => event.resourceId === "r-2"), undefined, proposed, minimumFor("r-2"));
  assertEqual(dana, undefined);
}

function restIsJudgedAtTheLaterShiftsStart(): void {
  // An 11-hour rule from 1 July (R15): nine hours before a shift starting 30 June pass,
  // nine hours before a shift starting 1 July do not.
  const elevenFromJuly: MinimumRestAt = (laterStart) => (laterStart >= new Date(2026, 6, 1) ? 660 : undefined);
  const june30 = restShift("a-1", "r-1", new Date(2026, 5, 30, 6), new Date(2026, 5, 30, 14));
  assertEqual(
    findRestShortfall([june30], undefined, { end: restDay(1, 3), id: "x", start: new Date(2026, 5, 30, 23) }, elevenFromJuly),
    undefined,
  );
  const lateJune30 = restShift("a-2", "r-1", new Date(2026, 5, 30, 14), new Date(2026, 5, 30, 22));
  assertEqual(
    findRestShortfall([lateJune30], undefined, { end: restDay(1, 15), id: "y", start: restDay(1, 7) }, elevenFromJuly)?.gapMinutes,
    540,
  );
}

function restLooksAtTheNeighboursOnly(): void {
  const tenHours: MinimumRestAt = () => 600;
  // A shift between the proposal and a later one: only the nearest pair is rest.
  const roster = [
    restShift("e-1", "r-1", restDay(6, 7), restDay(6, 11)),
    restShift("e-2", "r-1", restDay(6, 13), restDay(6, 14)),
  ];
  const nearest = findRestShortfall(roster, undefined, { end: restDay(6, 21), id: "p", start: restDay(6, 20) }, tenHours);
  assertEqual(nearest?.neighborTitle, "e-2");
  assertEqual(nearest?.gapMinutes, 360);
  // Exactly the minimum keeps the rule; one minute under breaks it.
  assertEqual(
    findRestShortfall(roster, undefined, { end: restDay(7, 8), id: "q", start: restDay(7, 0) }, tenHours),
    undefined,
  );
  assertEqual(
    findRestShortfall(roster, undefined, { end: restDay(7, 8), id: "q", start: restDay(6, 23, 59) }, tenHours)?.gapMinutes,
    599,
  );
  // The moved shift never pairs with itself, and an open shift is nobody's.
  assertEqual(findRestShortfall(roster, "e-2", { end: restDay(6, 21), id: "e-2", start: restDay(6, 20) }, tenHours)?.neighborTitle, "e-1");
  const open = { ...restShift("o-1", "r-1", restDay(6, 16), restDay(6, 18)), status: "needsCover" as const };
  assertEqual(findRestShortfall([open], undefined, { end: restDay(6, 21), id: "p", start: restDay(6, 20) }, tenHours), undefined);
}

function splitPartsAreNotRestAndOverlapIsNotRest(): void {
  const tenHours: MinimumRestAt = () => 600;
  const split = { id: "s-1", samePerson: "required" as const };
  const morning = restShift("m", "r-1", restDay(6, 7), restDay(6, 11), split);
  assertEqual(restShortfall(morning, restShift("e", "r-1", restDay(6, 15), restDay(6, 19), split), tenHours), undefined);
  assertEqual(restShortfall(morning, restShift("f", "r-1", restDay(6, 15), restDay(6, 19)), tenHours)?.gapMinutes, 240);
  // Overlapping shifts are the overlap rule's finding.
  assertEqual(restShortfall(morning, restShift("g", "r-1", restDay(6, 10), restDay(6, 12)), tenHours), undefined);
  // The gap is measured between the real moments the board dates stand for.
  const anHourAhead = (display: Date): Date => new Date(display.getTime() - 60 * 60_000);
  const later = restShift("h", "r-1", restDay(6, 20), restDay(6, 22));
  assertEqual(restShortfall(morning, later, tenHours, anHourAhead)?.gapMinutes, 540);
}

function shiftOrderAndOverlap(): void {
  const early = restShift("b", "r-1", restDay(6, 7), restDay(6, 15));
  const same = restShift("a", "r-1", restDay(6, 7), restDay(6, 15));
  const touching = restShift("c", "r-1", restDay(6, 15), restDay(6, 23));
  assertEqual(compareShifts(same, early) < 0, true);
  assertEqual(compareShifts(touching, early) > 0, true);
  assertEqual(shiftsOverlap(early, touching), false);
  assertEqual(shiftsOverlap(early, same), true);
}

function theFreeBoardsSingleValueBehavesAsToday(): void {
  // One minimum for everyone, every neighbour, the break wording: unchanged (R11(b)).
  const roster = [shift("e-1", "r-1", 6, 14), shift("e-2", "r-2", 6, 14)];
  for (const resourceId of ["r-1", "r-2"]) {
    const results = evaluateScheduleRules({
      config,
      event: undefined,
      events: roster,
      proposed: { end: day(16), resourceId, start: day(14, 30) },
      resources,
    });
    assertEqual(results.map((result) => result.reason).join(" | "), "Break under 60 min (30 min gap)");
  }
}

function extraRulesSeeEveryEvent(): void {
  let seen = 0;
  evaluateScheduleRules({
    config,
    event: undefined,
    events,
    extraRules: [
      {
        evaluate: (context) => {
          seen = context.events.length;
          return undefined;
        },
        order: 0,
      },
    ],
    proposed: { end: day(16), resourceId: "r-1", start: day(15) },
    resources,
  });
  assertEqual(seen, events.length);
}

indexedEvaluationHandlesCandidateLoopsAtStressScale();
breakUnderMinimumWarnsWithTheGap();
extraRulesTakeTheirPlaceInTheOrder();
backToBackCountsAsZeroGapAndOverlapIsNotABreak();
minimumBreakZeroMeansOff();
perPersonRestWarnsOnlyThatPerson();
restIsJudgedAtTheLaterShiftsStart();
restLooksAtTheNeighboursOnly();
splitPartsAreNotRestAndOverlapIsNotRest();
shiftOrderAndOverlap();
theFreeBoardsSingleValueBehavesAsToday();
extraRulesSeeEveryEvent();

console.log("scheduleRules tests passed");
