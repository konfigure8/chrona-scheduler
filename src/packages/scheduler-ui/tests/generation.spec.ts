/**
 * Domain model 6.4: generation expands demand templates into open
 * shifts and re-runs RECONCILE - add missing; remove no-longer-
 * required only while untouched (untouched unassigned first on a
 * count shrink); never touch assigned/pinned/edited, flag surplus
 * ones; hand-created shifts are invisible; report added/removed/
 * flagged. Generated shifts are ordinary v2 shifts - the contract
 * does not know generation exists.
 */
import {
  cycleWeekOf,
  reconcileGeneration,
  slotOccursOn,
  type ShiftDemandTemplate,
  type ShiftTemplateSlot,
} from "../src/generation";
import { problemFromSchedule } from "../src/schedulingContract";
import type { SchedulerUiEvent, TimeWindow } from "../src/types";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

// Monday 2026-08-17, local - the same anchor the fixtures use.
const monday = (hour: number, minute = 0): Date =>
  new Date(2026, 7, 17, hour, minute);
const week: TimeWindow = {
  end: new Date(2026, 7, 24),
  start: new Date(2026, 7, 17),
};

const template = (count: number): ShiftDemandTemplate => ({
  slots: [
    {
      count,
      daysOfWeek: [1],
      endMinutes: 21 * 60,
      groups: { Teams: "Front of house" },
      requiredTags: ["Floor"],
      slotId: "close",
      startMinutes: 18 * 60,
      title: "Close-down",
    },
  ],
  templateId: "sv",
});

const generate = (
  events: readonly SchedulerUiEvent[],
  templates: readonly ShiftDemandTemplate[],
) =>
  reconcileGeneration({
    events,
    openResourceId: "open",
    period: week,
    templates,
  });

// 1. Fresh expansion: count honored, provenance and lock stamped.
{
  const result = generate([], [template(2)]);
  assertEqual(result.added.length, 2, "fresh adds");
  assertEqual(result.removed.length, 0, "fresh removes");
  assertEqual(result.flagged.length, 0, "fresh flags");
  const shift = result.added[0];
  assertEqual(shift?.start.getTime(), monday(18).getTime(), "start");
  assertEqual(shift?.end.getTime(), monday(21).getTime(), "end");
  assertEqual(shift?.status, "needsCover", "status");
  assertEqual(shift?.resourceId, "open", "open row");
  assertEqual(shift?.lock, "time", "demand-born time lock");
  assertEqual(shift?.groups?.["Teams"], "Front of house", "group");
  assertEqual(shift?.requiredTags?.[0], "Floor", "tags");
  assertEqual(shift?.origin?.templateId, "sv", "origin template");
  assertEqual(shift?.origin?.dateKey, "2026-08-17", "origin date");
  assertEqual(shift?.origin?.slotId, "close", "origin slot");
  assertEqual(
    new Set(result.added.map((event) => event.id)).size,
    2,
    "unique ids",
  );

  // 2. Re-running reconciles to zero changes and signals no change.
  const again = generate(result.events, [template(2)]);
  assertEqual(again.added.length, 0, "idempotent adds");
  assertEqual(again.removed.length, 0, "idempotent removes");
  assertEqual(again.events.length, result.events.length, "idempotent size");
  assertEqual(again.changed, false, "idempotent signals unchanged");
  assertEqual(result.changed, true, "fresh run signals changed");
}

// 3. An end past midnight crosses into the next local day.
{
  const overnight: ShiftDemandTemplate = {
    slots: [
      {
        count: 1,
        daysOfWeek: [1],
        endMinutes: 25 * 60,
        slotId: "night",
        startMinutes: 22 * 60,
        title: "Night",
      },
    ],
    templateId: "sv",
  };
  const result = generate([], [overnight]);
  assertEqual(
    result.added[0]?.end.getTime(),
    new Date(2026, 7, 18, 1).getTime(),
    "overnight end",
  );
}

// 4. Count shrink removes untouched unassigned first; assigned survives.
{
  const seeded = generate([], [template(2)]).events;
  const oneAssigned = seeded.map((event, index) =>
    index === 0
      ? { ...event, resourceId: "s-ava", status: "assigned" as const }
      : event,
  );
  const result = generate(oneAssigned, [template(1)]);
  assertEqual(result.removed.length, 1, "shrink removes");
  assertEqual(result.removed[0]?.status, "needsCover", "removed the open one");
  assertEqual(result.flagged.length, 0, "no flags when untouched cover it");
  assertEqual(
    result.events.some((event) => event.status === "assigned"),
    true,
    "assigned survives",
  );
}

// 5. Surplus with nothing safely removable is flagged, never removed.
{
  const seeded = generate([], [template(2)]).events;
  const bothAssigned = seeded.map((event) => ({
    ...event,
    resourceId: "s-ava",
    status: "assigned" as const,
  }));
  const result = generate(bothAssigned, [template(1)]);
  assertEqual(result.removed.length, 0, "assigned never removed");
  assertEqual(result.flagged.length, 1, "surplus flagged");
  assertEqual(result.events.length, 2, "events kept");
  // The flag is STAMPED on the event so it renders and survives
  // storage; reconciliation owns it end to end.
  assertEqual(result.changed, true, "stamping counts as a change");
  const stamped = result.events.filter((event) => event.flag);
  assertEqual(stamped.length, 1, "one event carries the flag");
  assertEqual(stamped[0]?.flag?.cause, "assigned", "cause");
  assertEqual(stamped[0]?.flag?.required, 1, "required");
  assertEqual(stamped[0]?.flag?.existing, 2, "existing");
  const rerun = generate(result.events, [template(1)]);
  assertEqual(rerun.changed, false, "same flag re-stamped is no change");
  // Demand grows back: the flag is stripped.
  const grown = generate(result.events, [template(2)]);
  assertEqual(grown.changed, true, "stripping counts as a change");
  assertEqual(
    grown.events.some((event) => event.flag),
    false,
    "flag stripped when no longer surplus",
  );
}

// 6. An edited shift counts as touched: pristine removed first, the
// edited one flagged when the slot disappears entirely.
{
  const seeded = generate([], [template(2)]).events;
  const oneEdited = seeded.map((event, index) =>
    index === 0 ? { ...event, start: monday(17, 30) } : event,
  );
  const shrink = generate(oneEdited, [template(1)]);
  assertEqual(shrink.removed[0]?.start.getTime(), monday(18).getTime(), "pristine removed first");
  assertEqual(shrink.flagged.length, 0, "edited not surplus yet");

  const gone = generate(oneEdited, [
    { slots: [], templateId: "sv" },
  ]);
  assertEqual(gone.removed.length, 1, "slot gone: pristine removed");
  assertEqual(gone.flagged.length, 1, "slot gone: edited flagged");
  assertEqual(gone.flagged[0]?.start.getTime(), monday(17, 30).getTime(), "the edited one");
  assertEqual(gone.flagged[0]?.flag?.cause, "edited", "edited cause");
}

// 7. A pinned generated shift is untouchable. Pinned means the
// resolved lock is "both" - locks are read through resolveLock, and
// there the lock field wins over the pinned shorthand.
{
  const seeded = generate([], [template(1)]).events;
  const pinned = seeded.map((event) => ({ ...event, lock: "both" as const }));
  const result = generate(pinned, [{ slots: [], templateId: "sv" }]);
  assertEqual(result.removed.length, 0, "pinned never removed");
  assertEqual(result.flagged.length, 1, "pinned surplus flagged");
  assertEqual(result.flagged[0]?.flag?.cause, "pinned", "pinned cause");
}

// 8. Hand-created shifts are invisible: never counted, never removed.
{
  const handMade: SchedulerUiEvent = {
    end: monday(21),
    id: "hand-1",
    lock: "time",
    requiredTags: ["Floor"],
    resourceId: "open",
    start: monday(18),
    status: "needsCover",
    title: "Close-down",
  };
  const result = generate([handMade], [template(1)]);
  assertEqual(result.added.length, 1, "adds despite identical hand shift");
  const cleared = generate(result.events, [{ slots: [], templateId: "sv" }]);
  assertEqual(cleared.removed.length, 1, "only the generated one removed");
  assertEqual(
    cleared.events.some((event) => event.id === "hand-1"),
    true,
    "hand-created survives",
  );
}

// 9. Generated shifts are ordinary v2 shifts (expressed in v2).
{
  const generated = generate([], [template(1)]).added;
  const problem = problemFromSchedule({
    events: generated,
    resources: [{ id: "s-ava", name: "Ava Cole", tags: ["Floor"] }],
    window: week,
  });
  assertEqual(problem.shifts.length, 1, "flows into the contract");
  assertEqual(problem.shifts[0]?.assignment, undefined, "open in v2");
  assertEqual(problem.shifts[0]?.requiredSkills[0], "Floor", "skills in v2");
}

// F25 (Q3-A): the template's shape - rostered gaps in minutes from
// local midnight - is stamped onto every generated item as absolute
// ShiftGap instants; a template without gaps stamps none.
{
  const shaped = {
    slots: [
      {
        count: 1,
        daysOfWeek: [1],
        endMinutes: 17 * 60,
        gaps: [
          { endMinutes: 12 * 60 + 30, label: "Meal break", paid: false, startMinutes: 12 * 60 },
        ],
        slotId: "shaped",
        startMinutes: 9 * 60,
        title: "Shaped shift",
      },
    ],
    templateId: "t-shaped",
  };
  const generated = generate([], [shaped]).added;
  assertEqual(generated.length, 1, "one shaped shift per Monday");
  const gap = generated[0]?.gaps?.[0];
  assertEqual(gap !== undefined, true, "gap stamped");
  assertEqual(gap?.label, "Meal break", "gap label");
  assertEqual(gap?.paid, false, "gap paid flag");
  assertEqual(gap?.start.getHours(), 12, "gap starts 12:00 local");
  assertEqual(gap?.end.getMinutes(), 30, "gap ends 12:30 local");
  assertEqual(generate([], [template(1)]).added[0]?.gaps, undefined, "no gaps without shape");
}

// F5. A levered slot reads the driver per occurrence: Mon 35 guests
// -> ceil(3.5) = 4, Tue 8 -> floor 2, Wed no value -> floor 2.
{
  const levered: ShiftDemandTemplate = {
    slots: [
      {
        count: 2,
        daysOfWeek: [1, 2, 3],
        endMinutes: 15 * 60,
        lever: {
          distribution: "perOccurrence",
          driverId: "guests",
          minimum: 2,
          perUnits: 10,
          ratioCount: 1,
          rounding: "ceiling",
        },
        slotId: "floor",
        startMinutes: 11 * 60,
        title: "Floor service",
      },
    ],
    templateId: "sv",
  };
  const withDemand = reconcileGeneration({
    demand: {
      drivers: [{ driverId: "guests", name: "Guests", windowKind: "day" }],
      values: [
        { driverId: "guests", value: 35, windowStart: "2026-08-17" },
        { driverId: "guests", value: 8, windowStart: "2026-08-18" },
      ],
    },
    events: [],
    openResourceId: "open",
    period: week,
    templates: [levered],
  });
  const perDay = new Map<string, number>();
  for (const event of withDemand.added) {
    const key = event.start.toDateString();
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  assertEqual(withDemand.added.length, 8, "F5 total added 4 + 2 + 2");
  assertEqual(perDay.get(monday(11).toDateString()), 4, "F5 Monday count from 35 guests");
  assertEqual(perDay.get(new Date(2026, 7, 18, 11).toDateString()), 2, "F5 Tuesday floors at 2");
  assertEqual(perDay.get(new Date(2026, 7, 19, 11).toDateString()), 2, "F5 Wednesday no value -> floor");
  // Without demand data the fixed count applies, so the lever is inert.
  const withoutDemand = generate([], [levered]);
  assertEqual(withoutDemand.added.length, 6, "F5 no demand -> fixed count 2 x 3 days");
}

// F1 Rotating patterns. Week 1 starts on the anchor; weeks run in
// sevens from there in both directions.
{
  const anchor = new Date(2026, 7, 17); // Monday
  assertEqual(cycleWeekOf(anchor, new Date(2026, 7, 17), 4), 1, "F1 anchor day is week 1");
  assertEqual(cycleWeekOf(anchor, new Date(2026, 7, 23), 4), 1, "F1 sixth day after the anchor is still week 1");
  assertEqual(cycleWeekOf(anchor, new Date(2026, 7, 24), 4), 2, "F1 seven days on is week 2");
  assertEqual(cycleWeekOf(anchor, new Date(2026, 8, 7), 4), 4, "F1 three weeks on is week 4");
  assertEqual(cycleWeekOf(anchor, new Date(2026, 8, 14), 4), 1, "F1 the cycle wraps");
  assertEqual(cycleWeekOf(anchor, new Date(2026, 7, 16), 4), 4, "F1 the day before the anchor is the last week");
  assertEqual(cycleWeekOf(anchor, new Date(2026, 7, 3), 4), 3, "F1 two weeks before is week 3");
  assertEqual(cycleWeekOf(anchor, new Date(2026, 9, 12, 12), 1), 1, "F1 a one-week cycle is always week 1");
  assertEqual(cycleWeekOf(anchor, new Date(2026, 9, 12), 2), 1, "F1 eight weeks on, two-week cycle");

  const deepClean: ShiftTemplateSlot = {
    count: 1,
    cycle: { week: 2, weeks: 2 },
    daysOfWeek: [3],
    endMinutes: 17 * 60,
    slotId: "deep-clean",
    startMinutes: 14 * 60,
    title: "Deep clean",
  };
  assertEqual(slotOccursOn(deepClean, new Date(2026, 7, 19), anchor), false, "F1 week-1 Wednesday is skipped");
  assertEqual(slotOccursOn(deepClean, new Date(2026, 7, 26), anchor), true, "F1 week-2 Wednesday occurs");
  assertEqual(slotOccursOn(deepClean, new Date(2026, 7, 25), anchor), false, "F1 weekday still has to match");
  assertEqual(slotOccursOn(deepClean, new Date(2026, 7, 26), undefined), false, "F1 no anchor, no occurrence");
  assertEqual(slotOccursOn({ ...deepClean, cycle: { week: 3, weeks: 2 } }, new Date(2026, 7, 26), anchor), false, "F1 a week outside the cycle never occurs");
  assertEqual(slotOccursOn({ ...deepClean, cycle: { week: 2, weeks: 1 } }, new Date(2026, 7, 19), anchor), true, "F1 a one-week cycle is weekly");

  const cycled: ShiftDemandTemplate = { slots: [deepClean], templateId: "sv" };
  const fortnight: TimeWindow = { end: new Date(2026, 7, 31), start: new Date(2026, 7, 17) };
  const run = (period: TimeWindow, cycleAnchor: Date | undefined, events: readonly SchedulerUiEvent[] = []) =>
    reconcileGeneration({ cycleAnchor, events, openResourceId: "open", period, templates: [cycled] });

  const first = run(fortnight, anchor);
  assertEqual(first.added.length, 1, "F1 one deep clean in the fortnight");
  assertEqual(first.added[0]?.origin?.dateKey, "2026-08-26", "F1 on the second Wednesday");
  assertEqual(first.unanchored.length, 0, "F1 anchored runs report nothing");
  const next = run({ end: new Date(2026, 8, 14), start: new Date(2026, 7, 31) }, anchor);
  assertEqual(next.added[0]?.origin?.dateKey, "2026-09-09", "F1 the following fortnight keeps the phase");
  assertEqual(run(week, anchor).added.length, 0, "F1 the anchor week has no week-2 occurrence");
  assertEqual(run(fortnight, new Date(2026, 7, 10)).added[0]?.origin?.dateKey, "2026-08-19", "F1 an earlier anchor shifts the phase");

  // Without an anchor the cycled slot is reported and left alone:
  // nothing added, and its existing shifts are not surplus.
  const unanchored = run(fortnight, undefined, first.events);
  assertEqual(unanchored.added.length, 0, "F1 unanchored adds nothing");
  assertEqual(unanchored.removed.length, 0, "F1 unanchored removes nothing");
  assertEqual(unanchored.changed, false, "F1 unanchored is a no-op");
  assertEqual(unanchored.unanchored[0]?.slotId, "deep-clean", "F1 unanchored slot reported");
  assertEqual(unanchored.events.length, first.events.length, "F1 existing deep clean kept");

  // Weekly slots in the same run are unaffected by a missing anchor.
  const mixed = reconcileGeneration({
    events: [],
    openResourceId: "open",
    period: week,
    templates: [{ slots: [deepClean, template(1).slots[0]!], templateId: "sv" }],
  });
  assertEqual(mixed.added.length, 1, "F1 the weekly slot still generates");
  assertEqual(mixed.unanchored.length, 1, "F1 only the cycled slot is reported");

  // An across-window lever spreads over the occurrences that fall in
  // the period under the cycle: one Wednesday, not two.
  const levered = (cycle: ShiftTemplateSlot["cycle"]) =>
    reconcileGeneration({
      cycleAnchor: anchor,
      demand: {
        drivers: [{ driverId: "guests", name: "Guests", windowKind: "day" }],
        values: [
          { driverId: "guests", value: 30, windowStart: "2026-08-19" },
          { driverId: "guests", value: 50, windowStart: "2026-08-26" },
        ],
      },
      events: [],
      openResourceId: "open",
      period: fortnight,
      templates: [
        {
          slots: [
            {
              ...deepClean,
              ...(cycle ? { cycle } : {}),
              lever: { distribution: "acrossWindow", driverId: "guests", minimum: 0, perUnits: 10, ratioCount: 1, rounding: "ceiling" },
            },
          ],
          templateId: "sv",
        },
      ],
    });
  const onDate = (events: readonly SchedulerUiEvent[], dateKey: string) =>
    events.filter((event) => event.origin?.dateKey === dateKey).length;
  const cycledLever = levered({ week: 2, weeks: 2 }).added;
  assertEqual(cycledLever.length, 8, "F1 80 guests over the one cycled Wednesday");
  assertEqual(onDate(cycledLever, "2026-08-26"), 8, "F1 all on the cycled Wednesday");
  const weeklyLever = levered({ week: 1, weeks: 1 }).added;
  assertEqual(onDate(weeklyLever, "2026-08-19"), 4, "F1 weekly: 80 guests over two Wednesdays, 4 each");
  assertEqual(onDate(weeklyLever, "2026-08-26"), 4, "F1 weekly: second Wednesday gets its 4");
}

console.log("generation tests passed");
