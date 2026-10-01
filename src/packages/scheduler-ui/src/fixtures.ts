import type { DemandData } from "./demandLevers";
import type { DemandRow } from "./coverage";
import type { ShiftDemandTemplate } from "./generation";
import type { PeriodLifecycle } from "./horizon";
import type { SchedulerRulesConfig } from "./scheduleRules";
import type {
  AvailabilityBand,
  SchedulerResource,
  SchedulerUiEvent,
  TimeWindow,
} from "./types";

export interface FixtureSchedule {
  readonly availabilityBands: readonly AvailabilityBand[];
  /** chr_demand stand-in: coverage curves keyed by resource group. */
  readonly demand: readonly DemandRow[];
  readonly events: readonly SchedulerUiEvent[];
  readonly now: Date;
  readonly resources: readonly SchedulerResource[];
  /** Seed period lifecycle by periodKey (chr_rosterperiod stand-in);
   * presence turns the planning chrome on for this dataset. */
  readonly lifecycleSeed?: Readonly<Record<string, PeriodLifecycle>>;
  /** chr_demanddriver / chr_demanddrivervalue stand-in: the drivers a
   * template lever reads (F5); `demand` above is coverage need. */
  readonly demandDrivers?: DemandData;
  /** chr_demandtemplate stand-in: recurring slots generation expands
   * per roster period (domain model 6.4). */
  readonly templates?: readonly ShiftDemandTemplate[];
  readonly window: TimeWindow;
}

/**
 * Deterministic three-day demo schedule (Mon 2026-08-17 .. Wed 2026-08-19,
 * local time) with overlaps and open shifts so both views have something
 * honest to show. Field values illustrate Calendar 365-style mapped columns.
 */
export function buildFixtureSchedule(): FixtureSchedule {
  const day = (dayOffset: number, hour: number, minute = 0): Date =>
    new Date(2026, 7, 17 + dayOffset, hour, minute, 0, 0);

  const resources: readonly SchedulerResource[] = [
    { capacityHours: 40, groups: { Teams: "Front of house", Locations: "Ground floor" }, id: "r-alex", name: "Alex Chen", tags: ["Floor", "Bar"] },
    { capacityHours: 40, groups: { Teams: "Front of house", Locations: "Ground floor" }, id: "r-riley", name: "Riley Patel", tags: ["Floor"] },
    { capacityHours: 40, groups: { Teams: "Front of house", Locations: "Upstairs" }, id: "r-jordan", name: "Jordan Lee", tags: ["Floor", "First Aid"] },
    { capacityHours: 38, groups: { Teams: "Kitchen", Locations: "Ground floor" }, id: "r-morgan", name: "Morgan Diaz", tags: ["Kitchen"] },
    { capacityHours: 40, groups: { Teams: "Kitchen", Locations: "Ground floor" }, id: "r-sam", name: "Sam Ortiz", tags: ["Kitchen", "Bar"] },
    { capacityHours: 32, groups: { Teams: "Kitchen", Locations: "Upstairs" }, id: "r-priya", name: "Priya Nair", tags: ["Kitchen"] },
    { capacityHours: 40, groups: { Teams: "Supervisors" }, id: "r-taylor", name: "Taylor Kim", tags: ["Supervisor", "Floor", "First Aid"] },
    { id: "r-open", name: "Unassigned" },
  ];

  const shift = (
    id: string,
    resourceId: string,
    dayOffset: number,
    startHour: number,
    endHour: number,
    title: string,
    options?: {
      readonly color?: string;
      readonly group?: string;
      readonly gaps?: readonly { readonly from: number; readonly label: string; readonly paid?: boolean; readonly to: number }[];
      readonly needsCover?: boolean;
      readonly role?: string;
    },
  ): SchedulerUiEvent => ({
    color: options?.color,
    end: day(dayOffset, endHour),
    gaps: options?.gaps?.map((gap) => ({
      end: day(dayOffset, gap.to),
      label: gap.label,
      paid: gap.paid,
      start: day(dayOffset, gap.from),
    })),
    groups: options?.group ? { Teams: options.group } : undefined,
    fields: [
      { label: "Role", value: options?.role ?? title },
      { label: "Location", value: "Main site" },
    ],
    id,
    // Demand-born uncovered shifts are time-locked: their times ARE
    // the requirement; assignment picks the person, never the slot.
    lock: options?.needsCover ? ("time" as const) : undefined,
    requiredTags: options?.role ? [options.role] : undefined,
    resourceId,
    start: day(dayOffset, startHour),
    status: options?.needsCover ? "needsCover" : "assigned",
    title,
  });

  const events: readonly SchedulerUiEvent[] = [
    shift("e-01", "r-alex", 0, 6, 14, "Floor open", { role: "Floor" }),
    shift("e-02", "r-alex", 0, 12, 20, "Bar cover", { role: "Bar" }),
    shift("e-03", "r-riley", 0, 6, 14, "Service", { role: "Floor" }),
    {
      /*
       * Flag showcase (domain model 6.4): demand shrank to one Floor
       * close but this one is assigned, so generation kept and
       * flagged it. Origin carries the created snapshot, as a real
       * generated shift would.
       */
      ...shift("e-04", "r-jordan", 0, 14, 22, "Floor close", {
        role: "Floor",
      }),
      flag: { cause: "assigned" as const, existing: 2, required: 1 },
      origin: {
        dateKey: "2026-08-17",
        generated: {
          end: day(0, 22).toISOString(),
          start: day(0, 14).toISOString(),
          tags: ["Floor"],
          title: "Floor close",
        },
        slotId: "floor-close",
        templateId: "demo-week",
      },
    },
    shift("e-05", "r-morgan", 0, 9, 17, "Kitchen prep", { role: "Kitchen" }),
    shift("e-06", "r-sam", 0, 13, 21, "Kitchen close", { role: "Kitchen" }),
    shift("e-07", "r-taylor", 0, 8, 18, "Duty manager", {
      role: "Supervisor",
    }),
    shift("e-08", "r-open", 0, 16, 22, "Bar close", {
      group: "Front of house",
      needsCover: true,
      role: "Bar",
    }),
    shift("e-09", "r-alex", 1, 6, 14, "Floor open", { role: "Floor" }),
    shift("e-10", "r-riley", 1, 10, 18, "Service", { role: "Floor" }),
    shift("e-11", "r-jordan", 1, 14, 22, "Floor close", { role: "Floor" }),
    shift("e-12", "r-morgan", 1, 6, 12, "Bakery", { role: "Kitchen" }),
    shift("e-13", "r-morgan", 1, 11, 19, "Kitchen", {
      gaps: [{ from: 14, label: "Meal break", to: 15 }],
      role: "Kitchen",
    }),
    shift("e-14", "r-priya", 1, 13, 21, "Kitchen close", { role: "Kitchen" }),
    shift("e-14s", "r-sam", 1, 9, 22, "Chef split", {
      gaps: [{ from: 14, label: "Split", to: 17 }],
      role: "Kitchen",
    }),
    shift("e-15", "r-taylor", 1, 8, 18, "Duty manager", {
      role: "Supervisor",
    }),
    shift("e-16", "r-open", 1, 6, 14, "Kitchen prep", {
      group: "Kitchen",
      needsCover: true,
      role: "Kitchen",
    }),
    shift("e-17", "r-open", 1, 16, 22, "Floor close", {
      group: "Front of house",
      needsCover: true,
      role: "Floor",
    }),
    shift("e-18", "r-riley", 2, 6, 14, "Service", { role: "Floor" }),
    shift("e-19", "r-jordan", 2, 9, 17, "Stocktake", { role: "Floor" }),
    shift("e-20", "r-sam", 2, 6, 14, "Kitchen open", { role: "Kitchen" }),
    shift("e-21", "r-priya", 2, 13, 21, "Kitchen close", { role: "Kitchen" }),
    shift("e-22", "r-taylor", 2, 8, 18, "Duty manager", {
      role: "Supervisor",
    }),
    shift("e-23", "r-open", 2, 14, 22, "Bar close", {
      group: "Front of house",
      needsCover: true,
      role: "Bar",
    }),
  ];

  const availabilityBands: readonly AvailabilityBand[] = [
    { end: day(0, 24), kind: "unavailable", resourceId: "r-alex", start: day(0, 20) },
    { end: day(0, 12), kind: "preferred", resourceId: "r-riley", start: day(0, 6) },
    { end: day(1, 13), kind: "unpreferred", resourceId: "r-priya", start: day(1, 6) },
    { end: day(2, 14), kind: "preferred", resourceId: "r-sam", start: day(2, 6) },
    { end: day(1, 24), kind: "unavailable", resourceId: "r-jordan", start: day(1, 22) },
  ];

  /*
   * Demo demand (chr_demand stand-in): a declared floor plus a midday
   * peak for the kitchen, an evening service minimum for front of
   * house - shaped to leave visible deficits against the fixture
   * shifts so the coverage strip demos every state.
   */
  const demand: DemandRow[] = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    demand.push(
      {
        end: day(dayOffset, 22),
        group: "Kitchen",
        minHeadcount: 1,
        start: day(dayOffset, 6),
      },
      {
        end: day(dayOffset, 14),
        group: "Kitchen",
        maxHeadcount: 3,
        minHeadcount: 2,
        start: day(dayOffset, 11),
      },
      {
        end: day(dayOffset, 22),
        group: "Front of house",
        minHeadcount: 2,
        start: day(dayOffset, 16),
      },
    );
  }

  return {
    availabilityBands,
    demand,
    events,
    now: day(0, 11, 30),
    resources,
    window: { end: day(3, 0), start: day(0, 0) },
  };
}

const stressFirstNames = [
  "Alex", "Riley", "Jordan", "Morgan", "Sam", "Priya", "Taylor", "Lee",
  "Casey", "Dana", "Eli", "Frankie", "Gale", "Harper", "Indra", "Jules",
];
const stressLastNames = [
  "Chen", "Patel", "Lee", "Diaz", "Ortiz", "Nair", "Kim", "Fontaine",
  "Okafor", "Silva", "Novak", "Haddad", "Kowalski", "Tanaka", "Berg", "Cruz",
];

/**
 * Deterministic large dataset for the performance fixture: `resourceCount`
 * resources in groups of 50, `eventsPerResource` shifts spread across three
 * days between 05:00 and 22:00.
 */
/**
 * Level 0 of the solve ladder: two people, one uncovered Floor shift,
 * one legal answer class (only Noah holds Floor). The recorder, the
 * harness dataset select, and the solve tests all consume this one
 * definition, so the recorded exchange always matches the rendered
 * data.
 */
export function buildLevel0Fixture(): FixtureSchedule {
  const at = (hour: number): Date => new Date(2027, 1, 1, hour, 0, 0, 0);
  return {
    availabilityBands: [],
    demand: [],
    events: [
      {
        end: at(15),
        id: "level0-shift",
        lock: "time",
        requiredTags: ["Floor"],
        resourceId: "open",
        start: at(10),
        status: "needsCover",
        title: "Level0 Floor shift",
      },
    ],
    now: at(9),
    resources: [
      { id: "mia", name: "Mia Wong", tags: ["Bar", "Supervisor"] },
      { id: "noah", name: "Noah Patel", tags: ["Floor", "First Aid"] },
    ],
    window: { end: new Date(2027, 1, 2, 0), start: new Date(2027, 1, 1, 0) },
  };
}

/**
 * Level 1 of the solve ladder: two people, two uncovered shifts with
 * different skills. Only one legal split exists (Noah holds Floor,
 * Mia holds Bar), so the recorded answer is deterministic.
 */
export function buildLevel1Fixture(): FixtureSchedule {
  const level0 = buildLevel0Fixture();
  const at = (hour: number): Date => new Date(2027, 1, 1, hour, 0, 0, 0);
  return {
    ...level0,
    events: [
      {
        end: at(13),
        id: "level1-bar",
        lock: "time",
        requiredTags: ["Bar"],
        resourceId: "open",
        start: at(9),
        status: "needsCover",
        title: "Level1 Bar shift",
      },
      {
        end: at(15),
        id: "level1-floor",
        lock: "time",
        requiredTags: ["Floor"],
        resourceId: "open",
        start: at(10),
        status: "needsCover",
        title: "Level1 Floor shift",
      },
    ],
  };
}

/**
 * Level 2 of the solve ladder: two people hold the skill, one is on
 * leave across the shift, so availability decides. The solver must
 * pick Quinn.
 */
export function buildLevel2Fixture(): FixtureSchedule {
  const at = (hour: number): Date => new Date(2027, 1, 1, hour, 0, 0, 0);
  return {
    availabilityBands: [
      {
        end: new Date(2027, 1, 2, 0),
        kind: "unavailable",
        label: "Leave",
        resourceId: "pat",
        start: new Date(2027, 1, 1, 0),
      },
    ],
    demand: [],
    events: [
      {
        end: at(15),
        id: "level2-shift",
        lock: "time",
        requiredTags: ["Floor"],
        resourceId: "open",
        start: at(10),
        status: "needsCover",
        title: "Level2 Floor shift",
      },
    ],
    now: at(9),
    resources: [
      { id: "pat", name: "Pat Reyes", tags: ["Floor"] },
      { id: "quinn", name: "Quinn Lee", tags: ["Floor"] },
    ],
    window: { end: new Date(2027, 1, 2, 0), start: new Date(2027, 1, 1, 0) },
  };
}

/**
 * A realistic, cleanly solvable roster week: every uncovered shift
 * has at least one clean candidate, and - stronger - EVERY candidate
 * the solver could legally pick (skill held, no overlap, no leave)
 * is also free of warnings (breaks, hours). The invariant is
 * machine-checked by tests/solvableFixture.spec.ts with the real
 * rules engine, so this seed cannot rot. Use it to judge solves;
 * the demo fixture stays the conflict showcase.
 */
/**
 * The demo's maker configuration: what a hospitality site might set.
 * The harness config panel edits a copy of this; e2e drives it. The
 * 05:00-24:00 window preserves the original demo's site-hours block.
 */
export const demoRulesConfig: SchedulerRulesConfig = {
  availabilityPolicy: "block",
  crossGroupPolicy: "warn",
  minimumBreakMinutes: 60,
  minimumBreakPolicy: "warn",
  overlapPolicy: "warn",
  skillMismatchPolicy: "block",
  workingEndHour: 24,
  workingHoursPolicy: "block",
  workingStartHour: 5,
};

/**
 * Rules with every policy off - a baseline for tests. What a FRESH
 * gallery install defaults each policy to is a PCF mapping-layer
 * decision (chr_ column defaults), still open; the harness's plain
 * dataset applies whatever the rules panel says, because policies
 * are maker configuration a gallery user genuinely has.
 */
export const allOffRulesConfig: SchedulerRulesConfig = {
  availabilityPolicy: "off",
  crossGroupPolicy: "off",
  minimumBreakMinutes: 0,
  minimumBreakPolicy: "off",
  overlapPolicy: "off",
  skillMismatchPolicy: "off",
  workingHoursPolicy: "off",
};

/**
 * Straight-from-the-gallery data: the minimal mapping a builder
 * starts with - resources with names, events with title/times/
 * status. No tags, groups, capacity, demand, bands, locks,
 * templates, or lifecycle: every Chrona layer absent, so the
 * harness shows exactly how the unconfigured control behaves.
 */
export function buildPlainFixture(): FixtureSchedule {
  const day = (dayOffset: number, hour: number): Date =>
    new Date(2026, 7, 17 + dayOffset, hour, 0, 0, 0);

  const resources: readonly SchedulerResource[] = [
    { id: "p-1", name: "Alex Chen" },
    { id: "p-2", name: "Riley Patel" },
    { id: "p-3", name: "Jordan Lee" },
    { id: "p-4", name: "Morgan Diaz" },
    { id: "p-5", name: "Sam Ortiz" },
  ];

  const shift = (
    id: string,
    resourceId: string,
    dayOffset: number,
    startHour: number,
    endHour: number,
    title: string,
  ): SchedulerUiEvent => ({
    end: day(dayOffset, endHour),
    id,
    resourceId,
    start: day(dayOffset, startHour),
    status: "assigned",
    title,
  });

  return {
    availabilityBands: [],
    demand: [],
    events: [
      shift("pl-01", "p-1", 0, 9, 17, "Morning shift"),
      shift("pl-02", "p-2", 0, 12, 20, "Afternoon shift"),
      shift("pl-03", "p-3", 0, 8, 12, "Site visit"),
      shift("pl-04", "p-4", 1, 9, 17, "Morning shift"),
      shift("pl-05", "p-5", 1, 13, 21, "Late shift"),
      shift("pl-06", "p-1", 2, 9, 17, "Morning shift"),
      {
        end: day(0, 22),
        id: "pl-open-1",
        resourceId: "open",
        start: day(0, 18),
        status: "needsCover",
        title: "Evening cover",
      },
      {
        end: day(1, 12),
        id: "pl-open-2",
        resourceId: "open",
        start: day(1, 8),
        status: "needsCover",
        title: "Morning cover",
      },
    ],
    now: day(0, 9),
    resources,
    window: { end: day(3, 0), start: day(0, 0) },
  };
}

export function buildSolvableFixture(): FixtureSchedule {
  const day = (dayOffset: number, hour: number): Date =>
    new Date(2026, 7, 17 + dayOffset, hour, 0, 0, 0);

  const resources: SchedulerResource[] = [
    { groups: { Teams: "Front of house" }, id: "s-ava", name: "Ava Cole", tags: ["Floor", "Bar"] },
    { groups: { Teams: "Front of house" }, id: "s-ben", name: "Ben Ito", tags: ["Floor"] },
    { groups: { Teams: "Front of house" }, id: "s-cleo", name: "Cleo Marsh", tags: ["Bar", "First Aid"] },
    { groups: { Teams: "Front of house" }, id: "s-dan", name: "Dan Petrov", tags: ["Floor", "First Aid"] },
    { groups: { Teams: "Kitchen" }, id: "s-eli", name: "Eli Tran", tags: ["Kitchen"] },
    { groups: { Teams: "Kitchen" }, id: "s-fay", name: "Fay Osei", tags: ["Kitchen", "Bar"] },
    { groups: { Teams: "Kitchen" }, id: "s-gus", name: "Gus Novak", tags: ["Kitchen", "First Aid"] },
    { groups: { Teams: "Kitchen" }, id: "s-hana", name: "Hana Reid", tags: ["Kitchen", "First Aid"] },
  ];

  const assigned = (
    id: string,
    resourceId: string,
    dayOffset: number,
    startHour: number,
    endHour: number,
    title: string,
    skill: string,
  ): SchedulerUiEvent => ({
    end: day(dayOffset, endHour),
    id,
    requiredTags: [skill],
    resourceId,
    start: day(dayOffset, startHour),
    status: "assigned",
    title,
  });
  const uncovered = (
    id: string,
    dayOffset: number,
    startHour: number,
    endHour: number,
    title: string,
    skill: string,
  ): SchedulerUiEvent => ({
    end: day(dayOffset, endHour),
    id,
    lock: "time",
    requiredTags: [skill],
    resourceId: "open",
    start: day(dayOffset, startHour),
    status: "needsCover",
    title,
  });

  const events: readonly SchedulerUiEvent[] = [
    assigned("sv-01", "s-ava", 0, 6, 14, "Floor open", "Floor"),
    assigned("sv-02", "s-ben", 0, 15, 22, "Floor close", "Floor"),
    assigned("sv-03", "s-eli", 0, 6, 14, "Kitchen prep", "Kitchen"),
    assigned("sv-04", "s-fay", 0, 15, 22, "Kitchen close", "Kitchen"),
    assigned("sv-05", "s-dan", 1, 6, 14, "Floor open", "Floor"),
    assigned("sv-06", "s-gus", 1, 6, 14, "Kitchen prep", "Kitchen"),
    assigned("sv-07", "s-cleo", 1, 11, 19, "Bar mid", "Bar"),
    assigned("sv-08", "s-hana", 1, 15, 22, "Kitchen close", "Kitchen"),
    uncovered("sv-u1", 0, 16, 22, "Bar close", "Bar"),
    uncovered("sv-u2", 0, 9, 14, "Floor mid", "Floor"),
    uncovered("sv-u3", 0, 10, 14, "Kitchen mid", "Kitchen"),
    uncovered("sv-u4", 1, 8, 13, "First aid cover", "First Aid"),
    uncovered("sv-u5", 1, 6, 10, "Bar open", "Bar"),
    uncovered("sv-u6", 2, 15, 22, "Floor close", "Floor"),
  ];

  const demand: DemandRow[] = [];
  for (const group of ["Front of house", "Kitchen"] as const) {
    for (let dayOffset = 0; dayOffset < 2; dayOffset += 1) {
      demand.push({
        end: day(dayOffset, 14),
        group,
        minHeadcount: 1,
        start: day(dayOffset, 6),
      });
    }
  }
  demand.push({
    end: day(0, 22),
    group: "Front of house",
    minHeadcount: 1,
    start: day(0, 16),
  });

  return {
    availabilityBands: [
      {
        end: day(2, 0),
        kind: "unavailable",
        label: "Leave",
        resourceId: "s-ben",
        start: day(1, 0),
      },
      {
        end: day(0, 12),
        kind: "preferred",
        resourceId: "s-ava",
        start: day(0, 6),
      },
    ],
    demand,
    events,
    /*
     * Lifecycle seed (planning chrome bench): present (turns the
     * planning chrome on) but empty - every roster starts Draft, so
     * the sequential publish chain is demonstrable from a clean
     * state, and the current fortnight's never-published state
     * exercises the narrow plan-start exception with an overdue
     * deadline.
     */
    lifecycleSeed: {},
    now: day(0, 9),
    resources,
    /*
     * One recurring close-down slot, Mon-Wed: pressing Generate on
     * the default fortnight (anchored 2026-08-17) expands it to six
     * open shifts; re-running reconciles to zero changes.
     */
    /*
     * F5: a guests driver with a value per day. The floor-service slot
     * below reads it as "1 per 10 guests, min 2", so Mon 35 -> 4,
     * Tue 8 -> 2 (the floor), Wed (no value) -> 2.
     *
     * F1: the deep-clean slot runs every second Wednesday (week 2 of
     * a 2-week cycle anchored to the period anchor 2026-08-17), so it
     * lands on 2026-08-26 in the default fortnight and never in the
     * anchor week.
     */
    demandDrivers: {
      drivers: [{ driverId: "guests", name: "Guests", unitLabel: "guests", windowKind: "day" }],
      values: [
        { driverId: "guests", value: 35, windowStart: "2026-08-17" },
        { driverId: "guests", value: 8, windowStart: "2026-08-18" },
      ],
    },
    templates: [
      {
        slots: [
          {
            count: 1,
            daysOfWeek: [1, 2, 3],
            endMinutes: 21 * 60,
            groups: { Teams: "Front of house" },
            requiredTags: ["Floor"],
            slotId: "close-down",
            startMinutes: 18 * 60,
            title: "Close-down",
          },
          {
            count: 2,
            daysOfWeek: [1, 2, 3],
            endMinutes: 15 * 60,
            groups: { Teams: "Front of house" },
            lever: {
              distribution: "perOccurrence",
              driverId: "guests",
              minimum: 2,
              perUnits: 10,
              ratioCount: 1,
              rounding: "ceiling",
            },
            requiredTags: ["Floor"],
            slotId: "floor-service",
            startMinutes: 11 * 60,
            title: "Floor service",
          },
          {
            count: 1,
            cycle: { week: 2, weeks: 2 },
            daysOfWeek: [3],
            endMinutes: 17 * 60,
            groups: { Teams: "Kitchen" },
            requiredTags: ["Kitchen"],
            slotId: "deep-clean",
            startMinutes: 14 * 60,
            title: "Deep clean",
          },
        ],
        templateId: "sv-week",
      },
    ],
    window: { end: day(3, 0), start: day(0, 0) },
  };
}

export function buildLargeFixture(
  resourceCount = 2000,
  eventsPerResource = 10,
): FixtureSchedule {
  const day = (dayOffset: number, hour: number, minute = 0): Date =>
    new Date(2026, 7, 17 + dayOffset, hour, minute, 0, 0);

  // The four demo skills cycle through the roster so the skill rule,
  // chips, and best-options ranking all run at scale; every third
  // person holds a second skill.
  const stressSkills = ["Floor", "Bar", "Kitchen", "First Aid"];
  const skillAt = (index: number): string =>
    stressSkills[index % stressSkills.length] ?? "Floor";

  const resources: SchedulerResource[] = [];
  for (let index = 0; index < resourceCount; index += 1) {
    resources.push({
      // Two sets: regions of 500 holding teams of 50; the board's
      // groupBy list can nest them (["Regions", "Teams"]).
      groups: {
        Regions: `Region ${Math.floor(index / 500) + 1}`,
        Teams: `Team ${Math.floor(index / 50) + 1}`,
      },
      id: `stress-r-${index}`,
      tags:
        index % 3 === 0
          ? [skillAt(index), skillAt(index + 1)]
          : [skillAt(index)],
      name: `${stressFirstNames[index % stressFirstNames.length] ?? "Sam"} ${
        stressLastNames[Math.floor(index / stressFirstNames.length) % stressLastNames.length] ?? "Chen"
      } ${index}`,
    });
  }

  const events: SchedulerUiEvent[] = [];
  for (let resourceIndex = 0; resourceIndex < resourceCount; resourceIndex += 1) {
    for (let eventIndex = 0; eventIndex < eventsPerResource; eventIndex += 1) {
      const dayOffset = (resourceIndex + eventIndex) % 3;
      const startHour = 5 + ((resourceIndex * 3 + eventIndex * 5) % 13);
      const durationHours = 3 + ((resourceIndex + eventIndex) % 5);
      // Mostly consistent data; every 20th item requires a skill its
      // assignee lacks, so mismatches exist to find at scale.
      const mismatched =
        (resourceIndex * eventsPerResource + eventIndex) % 20 === 0;
      const uncoveredItem = (resourceIndex + eventIndex) % 17 === 0;
      events.push({
        end: day(dayOffset, Math.min(startHour + durationHours, 22)),
        id: `stress-e-${resourceIndex}-${eventIndex}`,
        lock: uncoveredItem ? ("time" as const) : undefined,
        requiredTags: [
          mismatched ? skillAt(resourceIndex + 2) : skillAt(resourceIndex),
        ],
        resourceId: `stress-r-${resourceIndex}`,
        start: day(dayOffset, startHour),
        status: uncoveredItem ? "needsCover" : "assigned",
        title: `Shift ${eventIndex + 1}`,
      });
    }
  }

  /*
   * Availability at scale: every 7th person on leave for a day
   * (unavailable - the availability rule has real targets), every
   * 5th with a preferred morning, every 11th an unpreferred
   * afternoon; roughly 800 spans across the roster.
   */
  const availabilityBands: AvailabilityBand[] = [];
  for (let index = 0; index < resourceCount; index += 1) {
    const resourceId = `stress-r-${index}`;
    if (index % 7 === 0) {
      availabilityBands.push({
        end: day((index % 3) + 1, 0),
        kind: "unavailable",
        label: "Leave",
        resourceId,
        start: day(index % 3, 0),
      });
    } else if (index % 5 === 0) {
      availabilityBands.push({
        end: day(index % 3, 12),
        kind: "preferred",
        resourceId,
        start: day(index % 3, 6),
      });
    } else if (index % 11 === 0) {
      availabilityBands.push({
        end: day((index + 1) % 3, 22),
        kind: "unpreferred",
        resourceId,
        start: day((index + 1) % 3, 12),
      });
    }
  }

  // Demand at scale: one floor plus one midday peak per region per
  // day, sized to leave a mix of met, under, and over states.
  const demand: DemandRow[] = [];
  const regions = Math.max(1, Math.ceil(resourceCount / 500));
  for (let region = 1; region <= regions; region += 1) {
    for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
      demand.push(
        {
          end: day(dayOffset, 22),
          group: `Region ${region}`,
          minHeadcount: 300,
          start: day(dayOffset, 6),
        },
        {
          end: day(dayOffset, 14),
          group: `Region ${region}`,
          maxHeadcount: 420,
          minHeadcount: 380,
          start: day(dayOffset, 11),
        },
      );
    }
  }

  return {
    availabilityBands,
    demand,
    events,
    now: day(0, 11, 30),
    resources,
    window: { end: day(3, 0), start: day(0, 0) },
  };
}
