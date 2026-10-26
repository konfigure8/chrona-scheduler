/**
 * The Chrona canonical scheduling contract, v2. It models scheduling
 * FACTS AND INTENT in our
 * names - never solver mechanics, vendor field names, constraint
 * names, or score levels. Adapters translate it to whatever a
 * solver backend speaks (today: the v0 POC payload in
 * solveTransport.ts); vendor JSON stops at those adapters.
 *
 * v2 is scoped STRICTLY to capabilities already present or
 * independently ratified: window, resources with skills and the
 * implemented contract/cost facts, the agreements people work under
 * (minimum rest and days in a row, dated), unavailability and
 * preferred or unpreferred time, shifts with times/required
 * skills/assignment/pinned/history, their breaks and split parts (F48
 * Split shifts), on-call shifts and the repair intent (F24 Repair
 * mode), the run result we already expose, and the rule checks behind
 * it: breach counts and the rule matches that explain a roster, before
 * and after, and the check of one person on one shift. Generation,
 * hourly demand and further agreement rules for the solver are
 * additive later, when their product rungs are designed independently;
 * the other rule kinds and every should rule stay on the board until
 * then (A5).
 *
 * Dates are ISO-8601 strings with explicit offsets: the contract is
 * a wire format, and hosts own timezone conversion at their
 * boundary. They are real moments: a host converts its board's
 * display dates back before they go on the wire (toInstant), and
 * names the site's time zone so the solver counts days, nights and
 * paid hours as the site's clock does.
 */
import { isPinned } from "./locks";
import type {
  AgreementRuleKind,
  AgreementRuleLevel,
  AgreementRulePeriod,
  AvailabilityBand,
  PersonContract,
  SchedulerAgreement,
  SchedulerAgreementRule,
  SchedulerResource,
  SchedulerUiEvent,
  TagSpan,
} from "./types";
import {
  boardRules,
  extensionMustRow,
  type ExtensionMatchKinds,
  type ExtensionMustRows,
  type ExtensionShouldRules,
} from "./ruleRegistry";
import { maxHoursPerWindow } from "./windowHours";

/** Contract polarity per Docs/domain_model.md section 1. */
export type ResourceContractType = "casual" | "fixed" | "minMax";

/** The agreement rules the solver checks: every kind (release 2, R2.11). */
export type SolverRuleKind = AgreementRuleKind;

const SOLVER_RULE_KINDS: ReadonlySet<AgreementRuleKind> = new Set<SolverRuleKind>([
  "averageHours",
  "daysInARow",
  "daysOff",
  "maximumHours",
  "minimumHours",
  "minimumRest",
  "overtime",
  "weeklyRest",
  "nightShiftsInARow",
  "nightShifts",
  "nightShiftHours",
  "restAfterNight",
  "restAfterNights",
]);

/** The kinds the board checks itself, for its warnings and its count after a hold-back. */
const BOARD_CHECKED_KINDS: ReadonlySet<AgreementRuleKind> = new Set<AgreementRuleKind>(["daysInARow", "minimumRest"]);

/** True for a rule kind the solver checks. */
export function isSolverRuleKind(kind: AgreementRuleKind): kind is SolverRuleKind {
  return SOLVER_RULE_KINDS.has(kind) || (boardRules().agreementRuleKinds ?? []).includes(kind);
}

/** The kinds that only ever weigh as a cost, as in Timefold's contracts. */
const ALWAYS_SHOULD: ReadonlySet<AgreementRuleKind> = new Set<AgreementRuleKind>(["minimumHours", "overtime"]);

/**
 * A rule's level as it holds: minimum hours and overtime are always
 * should; any other rule is must unless the maker set should.
 */
export function ruleLevel(rule: Pick<SchedulerAgreementRule, "kind" | "level">): AgreementRuleLevel {
  return ALWAYS_SHOULD.has(rule.kind) ? "should" : (rule.level ?? "must");
}

/**
 * True for a rule the board itself holds as a limit: rest or days in a
 * row at the must level. The solver checks every kind at both levels;
 * the board's hand-edit warnings and its own Must count check these.
 */
export function isBoardCheckedRule(rule: Pick<SchedulerAgreementRule, "kind" | "level">): boolean {
  return BOARD_CHECKED_KINDS.has(rule.kind) && ruleLevel(rule) === "must";
}

/**
 * One rule of an agreement that is switched on and sets a limit. Its
 * dates are calendar days read on the problem's clock (timeZone).
 */
export interface ScheduleContractAgreementRule {
  /** restAfterNights: the night shifts in a row that start the rest. Absent = 1. */
  readonly count?: number;
  /** The rule's last day, inclusive, "YYYY-MM-DD". Absent = no end. */
  readonly end?: string;
  /**
   * Timefold's shift tag filter (F55 Tag model): the rule counts only
   * the shifts with these tags, or all but them, matching all (the
   * default) or any. Absent until shifts carry tags; never both lists.
   */
  readonly excludeShiftTags?: readonly string[];
  readonly includeShiftTags?: readonly string[];
  readonly kind: SolverRuleKind;
  /** "should" for a Should rule (Timefold PREFERRED). Absent = must (REQUIRED). */
  readonly level?: "should";
  /** The period a period rule counts over. Absent = week. */
  readonly period?: AgreementRulePeriod;
  /** overtime: what an hour past the value pays, a percentage of the person's rate. */
  readonly rate?: number;
  readonly shiftTagMatches?: "all" | "any";
  /** The rule's first day, "YYYY-MM-DD". Absent = always. */
  readonly start?: string;
  /**
   * Above 0, in the units SchedulerAgreementRule.value names: minutes,
   * days for days in a row and days off, or night shifts.
   */
  readonly value: number;
  /**
   * weeklyRest and averageHours: the weeks of each window. Absent = 1.
   * nightShifts with weeks and no period: every rolling window of that
   * many weeks.
   */
  readonly weeks?: number;
  /** A Should rule's weight (Timefold weight). Absent = 1. */
  readonly weight?: number;
}

/**
 * How the agreement rules count periods: the board's first day of the
 * week, and a day a fortnight starts on (the view's roster period
 * anchor, when the view counts in fortnights).
 */
export interface ScheduleContractPeriods {
  readonly fortnightStart?: string;
  readonly weekStart: "friday" | "monday" | "saturday" | "sunday" | "thursday" | "tuesday" | "wednesday";
}

/**
 * An agreement with its rules as entered: two rules of one kind in
 * force on one date both hold (the stricter wins), and the rule in
 * force when the later work starts applies. No rules = no limits.
 */
export interface ScheduleContractAgreement {
  readonly id: string;
  readonly rules: readonly ScheduleContractAgreementRule[];
}

export interface ScheduleContractResource {
  /**
   * The agreement whose rules limit this person's rest and days in a
   * row. Absent, or naming no agreement in the problem = no limits.
   */
  readonly agreementId?: string;
  /** Hours bounds apply per solve window; omit to disable a bound. */
  readonly contract?: {
    readonly maxHoursPerWindow?: number;
    readonly minHoursPerWindow?: number;
    readonly type: ResourceContractType;
  };
  /**
   * F65 Contracts and employment types: the person's own terms, one in
   * force on each day, each a version of the person's own Timefold
   * contract beside their agreement's. A contract that ended before the
   * window is not sent. Absent = no contract.
   */
  readonly contracts?: readonly ScheduleContractPersonContract[];
  /** Employer cost in cents per hour; omitted = unknown, cost skipped. */
  readonly costCentsPerHour?: number;
  readonly id: string;
  readonly name: string;
  /**
   * The sites the person works at (F63 Person sites). Absent or empty =
   * none: the person takes only shifts with no site.
   */
  readonly sites?: readonly string[];
  /** The roles and skills held; F4: a tag held only on some days as Timefold's dated skill. */
  readonly skills: readonly (string | ScheduleContractSkill)[];
}

/**
 * F4 Validated role membership: a skill that holds only in its spans
 * (Timefold skill validity, validityDateTimeSpans). An empty list holds at
 * no time.
 */
export interface ScheduleContractSkill {
  readonly id: string;
  readonly validityDateTimeSpans: readonly { readonly end?: string; readonly start?: string }[];
}

/**
 * One contract of a person (F65), in the problem's units: its days are
 * calendar days on the problem's clock (timeZone), its hours minutes.
 * Guaranteed minutes are a Should minimum (Timefold allows no required
 * minimum), maximum minutes a Must maximum, both over the period.
 */
export interface ScheduleContractPersonContract {
  /** The contract's last day, inclusive, "YYYY-MM-DD". Absent = ongoing. */
  readonly end?: string;
  readonly guaranteedMinutes?: number;
  /** Overrides costCentsPerHour on the contract's days. */
  readonly hourlyRateCents?: number;
  readonly maxMinutes?: number;
  /** The period the minutes count over. Absent = week. */
  readonly period?: "fortnight" | "month" | "rosterPeriod" | "week";
  /** The contract's first day, "YYYY-MM-DD". */
  readonly start: string;
}

export interface ScheduleContractShift {
  /** Present = an existing assignment (a fact); pinned = intent that
   * the solver must not change it. Absent = the shift is open. */
  readonly assignment?: {
    readonly pinned: boolean;
    readonly resourceId: string;
  };
  /**
   * Rostered breaks inside the shift (Docs/domain_model.md section 4).
   * An unpaid break comes off paid hours and cost; every break still
   * counts as cover. Absent = no breaks.
   */
  readonly breaks?: readonly ScheduleContractBreak[];
  readonly end: string;
  /**
   * True = the shift had started when the problem was built: it is
   * pinned and still counts toward the window's totals, but a rule
   * match made only of history shifts is neither scored nor counted.
   * Absent = not history.
   */
  readonly history?: boolean;
  readonly id: string;
  /**
   * F24 Repair mode: an on-call shift, Timefold's backup capacity. Not
   * required work: left open it costs a Should rule. Absent = an
   * ordinary shift.
   */
  readonly onCall?: true;
  readonly requiredSkills: readonly string[];
  /** The shift's site (F63 Person sites): only someone who works there takes it. Absent = no site. */
  readonly site?: string;
  /**
   * One part of a split shift (F48 Split shifts): parts share the id.
   * The gap between parts is not rest; "required" makes one person for
   * both parts a must, "preferred" a preference.
   */
  readonly split?: { readonly id: string; readonly samePerson: "preferred" | "required" };
  readonly start: string;
  /** The shift's tags (Timefold shift tags): Night marks a night shift. Absent = none. */
  readonly tags?: readonly string[];
  readonly title: string;
}

export interface ScheduleContractBreak {
  readonly end: string;
  readonly paid: boolean;
  readonly start: string;
}

export interface ScheduleContractUnavailability {
  readonly end: string;
  readonly resourceId: string;
  readonly start: string;
}

/** Time a person prefers to work, or prefers not to: a Should rule. */
export interface ScheduleContractTimePreference {
  readonly end: string;
  readonly kind: "preferred" | "unpreferred";
  readonly resourceId: string;
  readonly start: string;
}

/**
 * F24 Repair mode, Timefold's real-time planning: keep the roster as it
 * stands. Each shift's assignment is its current person; the absent
 * person stays on their shift, with their absence as unavailability.
 * The API pins every assigned shift the absence leaves alone, so only
 * the shifts it uncovers and on-call shifts can move.
 */
export type ScheduleContractRepair = true;

export interface ScheduleProblemV2 {
  /** The agreements the resources name. Absent = none. */
  readonly agreements?: readonly ScheduleContractAgreement[];
  readonly contractVersion: "2";
  /** How the agreement rules count periods. Absent = weeks from Monday. */
  readonly periods?: ScheduleContractPeriods;
  /** F24 Repair mode. Absent = a plan run: any shift that is not pinned may change. */
  readonly repair?: ScheduleContractRepair;
  readonly resources: readonly ScheduleContractResource[];
  readonly shifts: readonly ScheduleContractShift[];
  /** Preferred and unpreferred time per person. Absent = none. */
  readonly timePreferences?: readonly ScheduleContractTimePreference[];
  /**
   * The site's time zone: an IANA name such as "Australia/Perth", or a
   * fixed offset such as "+10:00" when the host knows only that. The
   * solver counts days, nights and paid hours on this clock. Absent =
   * UTC.
   */
  readonly timeZone?: string;
  readonly unavailability: readonly ScheduleContractUnavailability[];
  /** The planning window this problem covers (roster period scope). */
  readonly window: { readonly end: string; readonly start: string };
}

export type ScheduleRunStatus = "failed" | "queued" | "running" | "succeeded";

/**
 * What the search did to find the roster (the review's scorecard): the
 * rosters it checked, how many times it found a better one, and how long
 * it searched. A fact about the run, never the solver's score.
 */
export interface SolveSearch {
  readonly betterRostersFound: number;
  readonly rostersChecked: number;
  readonly solvingMillis: number;
}

/**
 * Chrona's names for the Must rules a roster is checked against (never
 * the solver's constraint names). "unlisted" stands for any other Must
 * rule.
 */
export type MustRuleName =
  | "averageHours"
  | "daysInARow"
  | "daysOff"
  | "maximumHours"
  | "nights"
  | "onLeaveOrUnavailable"
  | "overlap"
  | "restBetweenShifts"
  | "site"
  | "skills"
  | "splitParts"
  | "unlisted"
  | "weeklyRest"
  | keyof ExtensionMustRows;

/** Chrona's names for the Should rules an answer explains; it leaves others out. */
export type ShouldRuleName =
  | "minimumHours"
  | "preferredTime"
  | "splitPartsOnePerson"
  | "spreadOfShifts"
  | "unpreferredTime"
  | keyof ExtensionShouldRules;

export type ScheduleRuleName = MustRuleName | ShouldRuleName;

const MUST_RULES: ReadonlySet<string> = new Set<string>([
  "averageHours",
  "daysInARow",
  "daysOff",
  "maximumHours",
  "nights",
  "onLeaveOrUnavailable",
  "overlap",
  "restBetweenShifts",
  "site",
  "skills",
  "splitParts",
  "unlisted",
  "weeklyRest",
]);

const SHOULD_RULES: ReadonlySet<string> = new Set<string>([
  "minimumHours",
  "preferredTime",
  "splitPartsOnePerson",
  "spreadOfShifts",
  "unpreferredTime",
]);

/** True for a Must rule's name: the board's, or a package's own row (ruleRegistry.ts). */
export function isMustRule(rule: string): rule is MustRuleName {
  return MUST_RULES.has(rule) || extensionMustRow(rule) !== undefined;
}

/** True for a Should rule's name: the board's, or a package's own (ruleRegistry.ts). */
export function isShouldRule(rule: string): rule is ShouldRuleName {
  return SHOULD_RULES.has(rule) || (boardRules().shouldRules ?? []).some((entry) => entry.rule === rule);
}

/** Must breaches outside the named counts, one per match. */
export interface OtherMustBreachCounts {
  readonly overlap: number;
  /** Parts of a split that must share one person, held by two. */
  readonly splitParts: number;
  /** Every other Must rule. */
  readonly unlisted: number;
}

/** Must breaches in one roster, each in its counting unit. */
export interface MustBreachCounts {
  /** One per rolling window of weeks whose hours are over the weekly average times its weeks (R2.18). */
  readonly averageHours: number;
  /**
   * One per run of working days with at least one day whose run so far
   * is longer than the limit in force that day.
   */
  readonly daysInARow: number;
  /** One per period with fewer days off than the minimum, scaled to its planned days (R2.18). */
  readonly daysOff: number;
  /**
   * One per person over their contract's maximum in the window, and one
   * per period over an agreement's Maximum hours (R2.18).
   */
  readonly maximumHours: number;
  /**
   * Nights: one per run of night shifts over its limit or rested too
   * little after, per period over its night shifts, per night shift
   * too long, and per short rest after a night shift. Absent in counts
   * made before the Nights rules = 0.
   */
  readonly nights?: number;
  /** One per match: assigned in unavailable time, or a casual outside declared availability. */
  readonly onLeaveOrUnavailable: number;
  readonly other: OtherMustBreachCounts;
  /**
   * One per pair of a person's consecutive shifts whose gap is shorter
   * than the minimum in force at the later shift's start. The parts of
   * one split shift are not a pair.
   */
  readonly restBetweenShifts: number;
  /** One per assigned shift at a site its person does not work at (F63 Person sites). */
  readonly site: number;
  /** One per assigned shift whose person lacks a required skill. */
  readonly skills: number;
  /** One per rolling window of weeks whose longest time off is shorter than the rule's (R2.18). */
  readonly weeklyRest: number;
}

/** Every Must breach in the counts. */
export function mustBreachTotal(counts: MustBreachCounts): number {
  const { other } = counts;
  return (
    counts.restBetweenShifts +
    counts.daysInARow +
    counts.maximumHours +
    counts.daysOff +
    counts.weeklyRest +
    counts.averageHours +
    (counts.nights ?? 0) +
    extensionRowsTotal(counts) +
    counts.skills +
    counts.site +
    counts.onLeaveOrUnavailable +
    other.overlap +
    other.splitParts +
    other.unlisted
  );
}

/** A registered row's count (ruleRegistry.ts); absent = 0. */
export function extensionRowCount(counts: MustBreachCounts, row: string): number {
  const value = (counts as unknown as Readonly<Record<string, unknown>>)[row];
  return typeof value === "number" ? value : 0;
}

function extensionRowsTotal(counts: MustBreachCounts): number {
  return (boardRules().mustRows ?? []).reduce((total, entry) => total + extensionRowCount(counts, entry.row), 0);
}

/**
 * One rule match: the rule, the person and the shifts behind it. A
 * Must match is one breach in its counting unit (MustBreachCounts), so
 * a short rest is always two consecutive shifts of one person.
 */
export interface ScheduleRuleMatch {
  /** daysInARow: the run's working days, "YYYY-MM-DD" on the problem's clock. */
  readonly days?: readonly string[];
  /**
   * nights: which of the five Nights rules the match breaks; a package's
   * own rule, which of its kinds (ruleRegistry.ts). Absent = not known.
   */
  readonly kind?: NightRuleKind | keyof ExtensionMatchKinds;
  /** The person the match is about. Absent = no one. */
  readonly resourceId?: string;
  readonly rule: ScheduleRuleName;
  /**
   * The shifts behind the match, earliest first: the two shifts of a
   * short rest, the shifts of a run of days.
   */
  readonly shiftIds: readonly string[];
}

/** The five Nights rules (night rules design), as an agreement names them. */
export type NightRuleKind = Extract<
  AgreementRuleKind,
  "nightShiftHours" | "nightShifts" | "nightShiftsInARow" | "restAfterNight" | "restAfterNights"
>;

/** How one roster stands against the rules. */
export interface ScheduleRosterCheck {
  /**
   * The matches of every Must breach and every rule match that touches
   * a shift the run changed. Absent when the analysis counted only.
   */
  readonly matches?: readonly ScheduleRuleMatch[];
  readonly mustBreaches: MustBreachCounts;
  /** Required shifts left open, one per shift. */
  readonly openShifts: number;
}

/**
 * The run's rule checks: the roster as the run found it and as it
 * proposes it. A match made only of history shifts is not counted.
 */
export interface ScheduleSolveAnalysis {
  /**
   * True = the roster was too large to explain in this run: the counts
   * are whole, and no roster carries matches.
   */
  readonly countsOnly?: boolean;
  readonly current: ScheduleRosterCheck;
  readonly proposed: ScheduleRosterCheck;
}

/** "Why not…?": one person tried on one shift of the roster. */
export interface ScheduleCandidate {
  readonly resourceId: string;
  readonly shiftId: string;
}

/**
 * How the roster with the candidate on the shift compares with the
 * roster as it stands, all rules weighed: the solver's verdict, never
 * its score.
 */
export type CandidateFit = "better" | "equal" | "worse";

/**
 * The answer for a candidate: the rule matches the move adds and
 * removes, for the person picked and the person taken off.
 */
export interface ScheduleCandidateCheck {
  readonly added: readonly ScheduleRuleMatch[];
  readonly fit: CandidateFit;
  readonly removed: readonly ScheduleRuleMatch[];
}

export interface ScheduleSolutionV2 {
  /**
   * The rule checks before and after the run. Absent when the run was
   * not analysed: no counts, never zeros.
   */
  readonly analysis?: ScheduleSolveAnalysis;
  /** One entry per shift; null = the solver left it unassigned. */
  readonly assignments: readonly {
    readonly resourceId: string | null;
    readonly shiftId: string;
  }[];
  readonly error?: string;
  /** No Must rule broken (F40). Absent when the answer does not say. */
  readonly feasible?: boolean;
  /** Missing people per half-hour below a time-of-day minimum. */
  readonly missingDemandHalfHours?: number;
  /** Required shifts the run left open. */
  readonly openShifts?: number;
  readonly runId: string;
  /** What the search did. Absent when the answer does not say. */
  readonly search?: SolveSearch;
  readonly status: ScheduleRunStatus;
}

export interface ProblemFromScheduleInput {
  /**
   * The agreements the resources name. Each travels with its On rules
   * that set a limit (value above 0). Absent = none.
   */
  readonly agreements?: readonly SchedulerAgreement[];
  readonly events: readonly SchedulerUiEvent[];
  /** How the agreement rules count periods; sent only when a rule counts over one. */
  readonly periods?: ScheduleContractPeriods;
  /**
   * A planner plans ahead and does not change history (F31 rework):
   * an assigned shift that started before this instant travels
   * pinned and marked as history, and still counts toward the
   * window's totals; an open one that ended before it stays out, and
   * an open one still running is planned like any other.
   * Absent = no history.
   */
  readonly now?: Date;
  /** F24 Repair mode (an Operate-mode run). Absent = a plan run. */
  readonly repair?: ScheduleContractRepair;
  readonly resources: readonly SchedulerResource[];
  /** The site's time zone, passed on to the solver (ScheduleProblemV2.timeZone). */
  readonly timeZone?: string;
  /**
   * Turns a board date back into the real moment it stands for. The
   * board works in display dates, whose local reading is the site's
   * clock; the wire carries moments. Absent = the dates already are
   * moments.
   */
  readonly toInstant?: (display: Date) => Date;
  /**
   * The people's availability bands: unavailable time travels as
   * unavailability, preferred and unpreferred time as time
   * preferences; time busy elsewhere stays home.
   */
  readonly unavailability?: readonly AvailabilityBand[];
  readonly window: { readonly end: Date; readonly start: Date };
}

/** Build a v2 problem from the UI's schedule state (host boundary). */
export function problemFromSchedule(
  input: ProblemFromScheduleInput,
): ScheduleProblemV2 {
  const now = input.now;
  const wire = (date: Date): string => (input.toInstant ? input.toInstant(date) : date).toISOString();
  // An open shift that has ended is history nobody worked: it stays out.
  // One still running goes in like any other (Matt 2026-10-13: a sick call
  // or an accident on the way leaves it empty, and someone covers it now).
  // A pinned open shift stays out too: the solver leaves a pin alone.
  const shifts = input.events.filter(
    (event) =>
      !(now && event.status === "needsCover" && event.end <= now) &&
      !(event.status === "needsCover" && isPinned(event)),
  );
  // Off rules and rules without a limit stay home; the rest go as
  // entered, in Timefold's shape: a Should rule with its level, a period
  // rule with its period, a rolling rule with its weeks, overtime with
  // its rate.
  const agreements = (input.agreements ?? []).map((agreement) => ({
    id: agreement.id,
    rules: agreement.rules.flatMap((rule): ScheduleContractAgreementRule[] => {
      const { kind } = rule;
      return rule.on && isSolverRuleKind(kind) && Number.isFinite(rule.value) && rule.value > 0
        ? [
            {
              ...(rule.kind === "restAfterNights" && rule.count !== undefined ? { count: rule.count } : {}),
              ...(rule.end ? { end: rule.end } : {}),
              kind,
              ...(ruleLevel(rule) === "should" ? { level: "should" as const } : {}),
              ...(rule.period ? { period: rule.period } : {}),
              ...(rule.rate !== undefined ? { rate: rule.rate } : {}),
              ...(rule.start ? { start: rule.start } : {}),
              value: rule.value,
              ...(rule.weeks !== undefined ? { weeks: rule.weeks } : {}),
            },
          ]
        : [];
    }),
  }));
  // F65: a contract's hours count over a period too, so the solver needs the week and the window.
  const countsPeriods =
    agreements.some((agreement) => agreement.rules.some((rule) => !BOARD_CHECKED_KINDS.has(rule.kind))) ||
    input.resources.some((resource) =>
      (resource.contracts ?? []).some((contract) => (contract.guaranteedHours ?? 0) > 0 || (contract.maxHours ?? 0) > 0));
  const bands = input.unavailability ?? [];
  const timePreferences = bands
    .filter(
      (band): band is AvailabilityBand & { readonly kind: "preferred" | "unpreferred" } =>
        band.kind === "preferred" || band.kind === "unpreferred",
    )
    .map((band) => ({
      end: wire(band.end),
      kind: band.kind,
      resourceId: band.resourceId,
      start: wire(band.start),
    }));
  return {
    ...(agreements.length > 0 ? { agreements } : {}),
    contractVersion: "2",
    ...(countsPeriods && input.periods ? { periods: input.periods } : {}),
    ...(input.repair ? { repair: true as const } : {}),
    resources: input.resources.map((resource) => ({
      ...(resource.agreementId !== undefined ? { agreementId: resource.agreementId } : {}),
      ...(resource.capacityHours !== undefined
        ? {
            // A weekly capacity is a MAXIMUM on an available-unless-excepted
            // person (domain model section 1: fixed / min-max polarity).
            // "casual" would flip the polarity to unavailable-unless-declared
            // and, with no declared availability, nothing could be assigned -
            // found in the F26 stage 3 real-grid pass.
            // Hours tier: weekly capacity scales to the solve window (windowHours.ts).
            contract: {
              maxHoursPerWindow: maxHoursPerWindow(resource.capacityHours, input.window),
              type: "fixed" as const,
            },
          }
        : {}),
      ...contractsOf(resource.contracts, input.window.start),
      ...(resource.costCentsPerHour !== undefined
        ? { costCentsPerHour: resource.costCentsPerHour }
        : {}),
      id: resource.id,
      name: resource.name,
      // F4: a role that holds at no time (a skill it needs is missing) is not sent; Timefold defines no empty span list.
      skills: (resource.tags ?? [])
        .filter((tag) => resource.tagSpans?.[tag]?.length !== 0)
        .map((tag) => skillOf(tag, resource.tagSpans?.[tag], wire)),
    })),
    shifts: shifts.map((event) => ({
      assignment:
        event.status === "needsCover"
          ? undefined
          : {
              // Context outside the window (the day before and after, sent so rest
              // rules see across its edges) is pinned: nothing outside the window changes.
              // So is history: a shift that has started.
              pinned:
                event.start < input.window.start ||
                event.start >= input.window.end ||
                (now !== undefined && event.start < now) ||
                // Busy elsewhere: another board's shift, which this solve only sees.
                event.elsewhere === true ||
                // Pinning is a choice (F22 deliverable 2, Q1-A): only a planner's pin
                // pins. In a repair the API pins what the absence leaves alone (F24).
                isPinned(event),
              resourceId: event.resourceId,
            },
      // Rostered gaps travel as breaks: the solver takes unpaid ones off paid hours.
      ...(event.gaps && event.gaps.length > 0
        ? {
            breaks: event.gaps.map((gap) => ({
              end: wire(gap.end),
              paid: gap.paid === true,
              start: wire(gap.start),
            })),
          }
        : {}),
      end: wire(event.end),
      // An assigned shift that has started is history: no breach made only of
      // history counts. A running open shift is a decision, not history. A shift
      // busy elsewhere is history too: a breach made only of them is the other board's.
      ...((now !== undefined && event.start < now && event.status !== "needsCover") || (event.elsewhere === true && event.status !== "needsCover")
        ? { history: true }
        : {}),
      id: event.id,
      ...(event.onCall ? { onCall: true as const } : {}),
      requiredSkills: event.requiredTags ?? [],
      ...(event.split ? { split: { id: event.split.id, samePerson: event.split.samePerson } } : {}),
      start: wire(event.start),
      // Nights: a night shift carries the tag the Nights rules count.
      ...(event.night ? { tags: ["Night"] } : {}),
      title: event.title,
    })),
    ...(timePreferences.length > 0 ? { timePreferences } : {}),
    unavailability: bands
      .filter((band) => band.kind === "unavailable")
      .map((band) => ({
        end: wire(band.end),
        resourceId: band.resourceId,
        start: wire(band.start),
      })),
    ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    window: {
      end: wire(input.window.end),
      start: wire(input.window.start),
    },
  };
}

/** "YYYY-MM-DD" of a board date: its local reading is the site's clock. */
function boardDay(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * F65: a person's contracts in the problem's units (hours to minutes).
 * A contract that ended before the window starts is not sent (an
 * expired contract is not sent to the solver, domain model section 1).
 */
/** F4: a held tag as the solver reads it, dated when it holds only on some days. */
function skillOf(
  tag: string,
  spans: readonly TagSpan[] | undefined,
  wire: (date: Date) => string,
): string | ScheduleContractSkill {
  return spans
    ? {
        id: tag,
        // Board dates read the site's clock: they go as instants, like the shifts' times.
        validityDateTimeSpans: spans.map((span) => ({
          ...(span.end ? { end: wire(span.end) } : {}),
          ...(span.start ? { start: wire(span.start) } : {}),
        })),
      }
    : tag;
}

function contractsOf(
  contracts: readonly PersonContract[] | undefined,
  windowStart: Date,
): { readonly contracts?: readonly ScheduleContractPersonContract[] } {
  const firstDay = boardDay(windowStart);
  const minutes = (hours: number | undefined): number | undefined =>
    hours !== undefined && hours > 0 ? Math.round(hours * 60) : undefined;
  const sent = (contracts ?? [])
    .filter((contract) => contract.end === undefined || contract.end >= firstDay)
    .map((contract) => {
      const guaranteedMinutes = minutes(contract.guaranteedHours);
      const maxMinutes = minutes(contract.maxHours);
      return {
        ...(contract.end !== undefined ? { end: contract.end } : {}),
        ...(guaranteedMinutes !== undefined ? { guaranteedMinutes } : {}),
        ...(contract.hourlyRateCents !== undefined && contract.hourlyRateCents > 0
          ? { hourlyRateCents: contract.hourlyRateCents }
          : {}),
        ...(maxMinutes !== undefined ? { maxMinutes } : {}),
        ...(contract.period !== undefined && contract.period !== "week" ? { period: contract.period } : {}),
        start: contract.start,
      };
    });
  return sent.length > 0 ? { contracts: sent } : {};
}
