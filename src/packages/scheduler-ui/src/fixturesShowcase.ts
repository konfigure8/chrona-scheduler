import type { DemandRow } from "./coverage";
import type { FixtureSchedule } from "./fixtures";
import type { ShiftDemandTemplate, ShiftTemplateSlot } from "./generation";
import type { PeriodLifecycle } from "./horizon";
import type {
  AvailabilityBand,
  SchedulerResource,
  SchedulerUiEvent,
} from "./types";

/*
 * Showcase datasets for captures (marketing site, listings, guides):
 * a hospitality site with sixteen people in three teams (seven front of
 * house, five kitchen, four events), staggered five-to-seven-hour shifts and a fortnight
 * that is fully rostered, conflict-free and covered. Two shapes of the
 * same week:
 *
 * - `buildShowcaseFreeFixture`: what the free scheduler shows on its
 *   own bindings - lanes, groups, hours against capacity, an
 *   unscheduled panel with a little open work. No skills, no coverage,
 *   no availability, no periods.
 * - `buildShowcaseFixture`: the same site with Chrona Workforce
 *   Scheduler - skills, availability, demand and coverage, the
 *   planning horizon with the current fortnight published and the next
 *   one part-rostered, and templates for Generate.
 *
 * Bench only; nothing here ships. The week starts Mon 17 Aug 2026 and
 * "today" is Fri 21 Aug 10:30, the busiest day, so the current-time
 * line sits inside a full day.
 */

const at = (dayOffset: number, hour: number, minute = 0): Date =>
  new Date(2026, 7, 17 + dayOffset, hour, minute, 0, 0);

interface Person {
  readonly capacityHours: number;
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly team: string;
}

const PEOPLE: readonly Person[] = [
  { capacityHours: 38, id: "sc-ava", name: "Ava Cole", tags: ["Floor", "Bar"], team: "Front of house" },
  { capacityHours: 38, id: "sc-ben", name: "Ben Ito", tags: ["Floor"], team: "Front of house" },
  { capacityHours: 32, id: "sc-cleo", name: "Cleo Marsh", tags: ["Bar", "First Aid"], team: "Front of house" },
  { capacityHours: 38, id: "sc-dan", name: "Dan Petrov", tags: ["Floor", "First Aid"], team: "Front of house" },
  { capacityHours: 38, id: "sc-isla", name: "Isla Brown", tags: ["Floor", "Bar"], team: "Front of house" },
  { capacityHours: 32, id: "sc-jonah", name: "Jonah Kerr", tags: ["Bar"], team: "Front of house" },
  { capacityHours: 30, id: "sc-mia", name: "Mia Sato", tags: ["Floor"], team: "Front of house" },
  { capacityHours: 38, id: "sc-eli", name: "Eli Tran", tags: ["Kitchen"], team: "Kitchen" },
  { capacityHours: 32, id: "sc-fay", name: "Fay Osei", tags: ["Kitchen", "Bar"], team: "Kitchen" },
  { capacityHours: 32, id: "sc-gus", name: "Gus Novak", tags: ["Kitchen", "First Aid"], team: "Kitchen" },
  { capacityHours: 38, id: "sc-hana", name: "Hana Reid", tags: ["Kitchen"], team: "Kitchen" },
  { capacityHours: 24, id: "sc-noah", name: "Noah Adeyemi", tags: ["Kitchen"], team: "Kitchen" },
  { capacityHours: 30, id: "sc-kai", name: "Kai Lin", tags: ["Events"], team: "Events" },
  { capacityHours: 24, id: "sc-lena", name: "Lena Roth", tags: ["Events", "First Aid"], team: "Events" },
  { capacityHours: 20, id: "sc-omar", name: "Omar Haddad", tags: ["Events", "Bar"], team: "Events" },
  { capacityHours: 24, id: "sc-priya", name: "Priya Nair", tags: ["Events"], team: "Events" },
];

interface ShiftKind {
  /** Maker-chosen shift colour (chr_color on the template, carried by
   * generated shifts); light tints so the bar text stays readable. */
  readonly color: string;
  readonly endHour: number;
  readonly skill: string;
  readonly startHour: number;
  readonly team: string;
  readonly title: string;
}

const KINDS = {
  barEarly: { color: "#e6dcf3", endHour: 18, skill: "Bar", startHour: 12, team: "Front of house", title: "Bar" },
  barLate: { color: "#e6dcf3", endHour: 23, skill: "Bar", startHour: 17, team: "Front of house", title: "Bar late" },
  eventService: { color: "#fbe3cc", endHour: 23, skill: "Events", startHour: 17, team: "Events", title: "Event service" },
  firstAid: { color: "#f9dcdc", endHour: 17, skill: "First Aid", startHour: 11, team: "Front of house", title: "First aid cover" },
  floorClose: { color: "#d6e6fa", endHour: 23, skill: "Floor", startHour: 17, team: "Front of house", title: "Floor close" },
  floorLunch: { color: "#d6e6fa", endHour: 16, skill: "Floor", startHour: 11, team: "Front of house", title: "Floor lunch" },
  floorMid: { color: "#d6e6fa", endHour: 20, skill: "Floor", startHour: 14, team: "Front of house", title: "Floor mid" },
  floorOpen: { color: "#d6e6fa", endHour: 12, skill: "Floor", startHour: 6, team: "Front of house", title: "Floor open" },
  functionSetup: { color: "#fbe3cc", endHour: 17, skill: "Events", startHour: 12, team: "Events", title: "Function setup" },
  kitchenClose: { color: "#d9efd7", endHour: 23, skill: "Kitchen", startHour: 17, team: "Kitchen", title: "Kitchen close" },
  kitchenLunch: { color: "#d9efd7", endHour: 16, skill: "Kitchen", startHour: 10, team: "Kitchen", title: "Kitchen lunch" },
  kitchenPrep: { color: "#d9efd7", endHour: 12, skill: "Kitchen", startHour: 6, team: "Kitchen", title: "Kitchen prep" },
  venueReset: { color: "#fbe3cc", endHour: 13, skill: "Events", startHour: 8, team: "Events", title: "Venue reset" },
} as const satisfies Readonly<Record<string, ShiftKind>>;

/**
 * One week's roster as [dayOffset, kind, person]. Every person stays
 * inside their weekly hours, nobody works two shifts in a day, and
 * every demand row below is met. Mon = 0.
 */
const WEEK: readonly (readonly [number, keyof typeof KINDS, string])[] = [
  // Monday
  [0, "floorOpen", "sc-ava"], [0, "floorLunch", "sc-mia"], [0, "floorMid", "sc-ben"], [0, "floorClose", "sc-dan"], [0, "barLate", "sc-jonah"],
  [0, "kitchenPrep", "sc-eli"], [0, "kitchenLunch", "sc-noah"], [0, "kitchenClose", "sc-fay"], [0, "venueReset", "sc-kai"],
  // Tuesday
  [1, "floorOpen", "sc-isla"], [1, "floorLunch", "sc-ben"], [1, "floorMid", "sc-dan"], [1, "floorClose", "sc-ava"], [1, "barLate", "sc-cleo"],
  [1, "kitchenPrep", "sc-gus"], [1, "kitchenLunch", "sc-hana"], [1, "kitchenClose", "sc-eli"], [1, "venueReset", "sc-priya"],
  // Wednesday
  [2, "floorOpen", "sc-dan"], [2, "floorLunch", "sc-mia"], [2, "floorMid", "sc-isla"], [2, "floorClose", "sc-ben"], [2, "barEarly", "sc-jonah"], [2, "barLate", "sc-cleo"],
  [2, "kitchenPrep", "sc-hana"], [2, "kitchenLunch", "sc-noah"], [2, "kitchenClose", "sc-gus"],
  // Thursday
  [3, "floorOpen", "sc-ava"], [3, "floorLunch", "sc-ben"], [3, "floorMid", "sc-mia"], [3, "floorClose", "sc-isla"], [3, "barEarly", "sc-cleo"], [3, "barLate", "sc-jonah"],
  [3, "kitchenPrep", "sc-eli"], [3, "kitchenLunch", "sc-fay"], [3, "kitchenClose", "sc-hana"], [3, "functionSetup", "sc-kai"],
  // Friday
  [4, "floorOpen", "sc-ava"], [4, "floorLunch", "sc-dan"], [4, "floorMid", "sc-isla"], [4, "floorClose", "sc-ben"], [4, "barEarly", "sc-omar"], [4, "barLate", "sc-jonah"], [4, "firstAid", "sc-cleo"],
  [4, "kitchenPrep", "sc-gus"], [4, "kitchenLunch", "sc-eli"], [4, "kitchenClose", "sc-noah"],
  [4, "functionSetup", "sc-priya"], [4, "eventService", "sc-lena"], [4, "eventService", "sc-kai"],
  // Saturday
  [5, "floorOpen", "sc-dan"], [5, "floorLunch", "sc-isla"], [5, "floorMid", "sc-mia"], [5, "floorClose", "sc-ava"], [5, "barEarly", "sc-cleo"], [5, "barLate", "sc-jonah"],
  [5, "kitchenPrep", "sc-hana"], [5, "kitchenLunch", "sc-gus"], [5, "kitchenClose", "sc-fay"],
  [5, "venueReset", "sc-kai"], [5, "functionSetup", "sc-lena"], [5, "eventService", "sc-priya"], [5, "eventService", "sc-omar"],
  // Sunday
  [6, "floorOpen", "sc-dan"], [6, "floorLunch", "sc-ava"], [6, "floorMid", "sc-isla"], [6, "floorClose", "sc-mia"], [6, "barLate", "sc-omar"],
  [6, "kitchenPrep", "sc-gus"], [6, "kitchenLunch", "sc-hana"], [6, "kitchenClose", "sc-eli"], [6, "venueReset", "sc-kai"],
];

/** A few placements the planner has promised: pinned or time-locked. */
const PINNED = new Set(["w1-d4-firstAid", "w2-d4-firstAid"]);
const TIME_LOCKED = new Set(["w1-d0-venueReset", "w2-d0-venueReset"]);

function weekEvents(
  weekIndex: number,
  options: { readonly open?: ReadonlySet<string>; readonly skills: boolean },
): SchedulerUiEvent[] {
  return WEEK.map(([dayOffset, kindKey, personId]) => {
    const kind = KINDS[kindKey];
    const id = `w${weekIndex + 1}-d${dayOffset}-${kindKey}`;
    const day = weekIndex * 7 + dayOffset;
    const open = options.open?.has(id) ?? false;
    return {
      color: kind.color,
      end: at(day, kind.endHour),
      groups: { Teams: kind.team },
      id,
      ...(options.skills ? { requiredTags: [kind.skill] } : {}),
      ...(open ? { lock: "time" as const } : PINNED.has(id) ? { pinned: true } : TIME_LOCKED.has(id) ? { lock: "time" as const } : {}),
      resourceId: open ? "open" : personId,
      start: at(day, kind.startHour),
      status: open ? ("needsCover" as const) : ("assigned" as const),
      title: kind.title,
    };
  });
}

function people(options: { readonly skills: boolean }): SchedulerResource[] {
  return PEOPLE.map((person) => ({
    capacityHours: person.capacityHours,
    groups: { Teams: person.team },
    id: person.id,
    name: person.name,
    ...(options.skills ? { tags: person.tags } : {}),
  }));
}

/** Coverage need per team and day; every row is met by WEEK above. */
function demandRows(weeks: number): DemandRow[] {
  const rows: DemandRow[] = [];
  for (let day = 0; day < weeks * 7; day += 1) {
    const dow = day % 7;
    rows.push({ end: at(day, 12), group: "Front of house", minHeadcount: 1, start: at(day, 6) });
    rows.push({ end: at(day, 16), group: "Front of house", minHeadcount: 2, start: at(day, 11) });
    rows.push({ end: at(day, 23), group: "Front of house", minHeadcount: 2, start: at(day, 17) });
    rows.push({ end: at(day, 12), group: "Kitchen", minHeadcount: 1, start: at(day, 6) });
    rows.push({ end: at(day, 16), group: "Kitchen", minHeadcount: 1, start: at(day, 10) });
    rows.push({ end: at(day, 23), group: "Kitchen", minHeadcount: 1, start: at(day, 17) });
    if (dow >= 2) {
      rows.push({ end: at(day, 23), group: "Front of house", minHeadcount: 1, start: at(day, 17), tags: ["Bar"] });
    }
    if (dow >= 3 && dow <= 5) {
      rows.push({ end: at(day, 23), group: "Events", minHeadcount: 1, start: at(day, 12) });
    }
  }
  return rows;
}

function availability(): AvailabilityBand[] {
  return [
    { end: at(2, 0), kind: "unavailable", label: "Leave", resourceId: "sc-mia", start: at(1, 0) },
    { end: at(10, 0), kind: "unavailable", label: "Leave", resourceId: "sc-noah", start: at(8, 0) },
    { end: at(4, 14), kind: "preferred", resourceId: "sc-ava", start: at(4, 6) },
    { end: at(5, 14), kind: "preferred", resourceId: "sc-isla", start: at(5, 6) },
  ];
}

function templates(): ShiftDemandTemplate[] {
  const slot = (
    slotId: string,
    kindKey: keyof typeof KINDS,
    daysOfWeek: readonly number[],
    count = 1,
  ): ShiftTemplateSlot => {
    const kind = KINDS[kindKey];
    return {
      count,
      daysOfWeek,
      endMinutes: kind.endHour * 60,
      groups: { Teams: kind.team },
      requiredTags: [kind.skill],
      slotId,
      startMinutes: kind.startHour * 60,
      title: kind.title,
    };
  };
  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  return [
    {
      slots: [
        slot("floor-open", "floorOpen", everyDay),
        slot("floor-lunch", "floorLunch", everyDay),
        slot("floor-mid", "floorMid", everyDay),
        slot("floor-close", "floorClose", everyDay),
        slot("bar-early", "barEarly", [3, 4, 5, 6]),
        slot("bar-late", "barLate", [3, 4, 5, 6, 0]),
        slot("kitchen-prep", "kitchenPrep", everyDay),
        slot("kitchen-lunch", "kitchenLunch", everyDay),
        slot("kitchen-close", "kitchenClose", everyDay),
        slot("function-setup", "functionSetup", [4, 5, 6]),
        slot("event-service", "eventService", [5, 6], 2),
        slot("venue-reset", "venueReset", [1, 2, 6, 0]),
      ],
      templateId: "sc-week",
    },
  ];
}

/** The free scheduler's shape of the site: four rostered weeks (two past), a little open work. */
export function buildShowcaseFreeFixture(): FixtureSchedule {
  const open = new Set(["w1-d3-barLate", "w1-d5-floorMid"]);
  return {
    availabilityBands: [],
    demand: [],
    events: [
      ...weekEvents(-2, { skills: false }),
      ...weekEvents(-1, { skills: false }),
      ...weekEvents(0, { open, skills: false }),
      ...weekEvents(1, { skills: false }),
    ],
    now: at(4, 10, 30),
    resources: people({ skills: false }),
    window: { end: at(14, 0), start: at(-14, 0) },
  };
}

/**
 * Chrona Workforce Scheduler's shape: the current fortnight published
 * and fully covered, the next fortnight part-rostered so Optimize has
 * work to do, the horizon beyond it not started.
 */
export function buildShowcaseFixture(): FixtureSchedule {
  const nextPeriodOpen = new Set(
    WEEK.filter((_entry, index) => index % 5 === 1 || index % 5 === 3).map(
      ([dayOffset, kindKey]) => `w3-d${dayOffset}-${kindKey}`,
    ),
  );
  const lifecycleSeed: Record<string, PeriodLifecycle> = {
    "2026-08-17": {
      publications: [{ at: at(-3, 16), changesSince: 0 }],
      status: "published",
    },
  };
  return {
    availabilityBands: availability(),
    demand: demandRows(2),
    demandDrivers: {
      drivers: [{ driverId: "covers", name: "Covers", unitLabel: "covers", windowKind: "day" }],
      values: [
        { driverId: "covers", value: 120, windowStart: "2026-08-21" },
        { driverId: "covers", value: 180, windowStart: "2026-08-22" },
        { driverId: "covers", value: 90, windowStart: "2026-08-23" },
      ],
    },
    events: [
      ...weekEvents(0, { skills: true }),
      ...weekEvents(1, { skills: true }),
      ...weekEvents(2, { open: nextPeriodOpen, skills: true }),
    ],
    lifecycleSeed,
    now: at(4, 10, 30),
    resources: people({ skills: true }),
    templates: templates(),
    window: { end: at(28, 0), start: at(0, 0) },
  };
}
