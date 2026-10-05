import {
  buildEventsByResource,
  defaultRulesConfig,
  evaluateScheduleRules,
  findBreakViolation,
  scheduleRuleOrder,
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

indexedEvaluationHandlesCandidateLoopsAtStressScale();
breakUnderMinimumWarnsWithTheGap();
extraRulesTakeTheirPlaceInTheOrder();
backToBackCountsAsZeroGapAndOverlapIsNotABreak();
minimumBreakZeroMeansOff();

console.log("scheduleRules tests passed");
