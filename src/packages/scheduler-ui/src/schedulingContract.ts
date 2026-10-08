/**
 * The Chrona canonical scheduling contract, v2 (PLAN: solver
 * boundary doctrine). It models scheduling FACTS AND INTENT in our
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
 * Split shifts), the run result we already expose, and the rule
 * checks behind it: breach counts and the rule matches that explain a
 * roster, before and after, and the check of one person on one shift.
 * Generation, hourly demand, disruption policies and further
 * agreement rules are additive later, when their product rungs are
 * designed independently.
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
  AvailabilityBand,
  SchedulerAgreement,
  SchedulerResource,
  SchedulerUiEvent,
} from "./types";
import { maxHoursPerWindow } from "./windowHours";

/** Contract polarity per Docs/domain_model.md section 1. */
export type ResourceContractType = "casual" | "fixed" | "minMax";

/**
 * One rule of an agreement that is switched on and sets a limit. Its
 * dates are calendar days read on the problem's clock (timeZone).
 */
export interface ScheduleContractAgreementRule {
  /** The rule's last day, inclusive, "YYYY-MM-DD". Absent = no end. */
  readonly end?: string;
  readonly kind: AgreementRuleKind;
  /** The rule's first day, "YYYY-MM-DD". Absent = always. */
  readonly start?: string;
  /**
   * Above 0. minimumRest: minutes from the end of one shift to the
   * start of the next. daysInARow: the most days a person may work in
   * a row.
   */
  readonly value: number;
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
  /** Employer cost in cents per hour; omitted = unknown, cost skipped. */
  readonly costCentsPerHour?: number;
  readonly id: string;
  readonly name: string;
  readonly skills: readonly string[];
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
  readonly requiredSkills: readonly string[];
  /**
   * One part of a split shift (F48 Split shifts): parts share the id.
   * The gap between parts is not rest; "required" makes one person for
   * both parts a must, "preferred" a preference.
   */
  readonly split?: { readonly id: string; readonly samePerson: "preferred" | "required" };
  readonly start: string;
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

export interface ScheduleProblemV2 {
  /** The agreements the resources name. Absent = none. */
  readonly agreements?: readonly ScheduleContractAgreement[];
  readonly contractVersion: "2";
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
  | "daysInARow"
  | "maximumHours"
  | "onLeaveOrUnavailable"
  | "overlap"
  | "restBetweenShifts"
  | "skills"
  | "splitParts"
  | "unlisted";

/** Chrona's names for the Should rules an answer explains; it leaves others out. */
export type ShouldRuleName =
  | "minimumHours"
  | "preferredTime"
  | "splitPartsOnePerson"
  | "spreadOfShifts"
  | "unpreferredTime";

export type ScheduleRuleName = MustRuleName | ShouldRuleName;

const MUST_RULES: ReadonlySet<string> = new Set<MustRuleName>([
  "daysInARow",
  "maximumHours",
  "onLeaveOrUnavailable",
  "overlap",
  "restBetweenShifts",
  "skills",
  "splitParts",
  "unlisted",
]);

const SHOULD_RULES: ReadonlySet<string> = new Set<ShouldRuleName>([
  "minimumHours",
  "preferredTime",
  "splitPartsOnePerson",
  "spreadOfShifts",
  "unpreferredTime",
]);

/** True for a Must rule's name. */
export function isMustRule(rule: string): rule is MustRuleName {
  return MUST_RULES.has(rule);
}

/** True for a Should rule's name. */
export function isShouldRule(rule: string): rule is ShouldRuleName {
  return SHOULD_RULES.has(rule);
}

/** Must breaches outside the four named counts, one per match. */
export interface OtherMustBreachCounts {
  readonly maximumHours: number;
  readonly overlap: number;
  /** Parts of a split that must share one person, held by two. */
  readonly splitParts: number;
  /** Every other Must rule. */
  readonly unlisted: number;
}

/** Must breaches in one roster, each in its counting unit. */
export interface MustBreachCounts {
  /**
   * One per run of working days with at least one day whose run so far
   * is longer than the limit in force that day.
   */
  readonly daysInARow: number;
  /** One per match: assigned in unavailable time, or a casual outside declared availability. */
  readonly onLeaveOrUnavailable: number;
  readonly other: OtherMustBreachCounts;
  /**
   * One per pair of a person's consecutive shifts whose gap is shorter
   * than the minimum in force at the later shift's start. The parts of
   * one split shift are not a pair.
   */
  readonly restBetweenShifts: number;
  /** One per assigned shift whose person lacks a required skill. */
  readonly skills: number;
}

/** Every Must breach in the counts. */
export function mustBreachTotal(counts: MustBreachCounts): number {
  const { other } = counts;
  return (
    counts.restBetweenShifts +
    counts.daysInARow +
    counts.skills +
    counts.onLeaveOrUnavailable +
    other.overlap +
    other.maximumHours +
    other.splitParts +
    other.unlisted
  );
}

/**
 * One rule match: the rule, the person and the shifts behind it. A
 * Must match is one breach in its counting unit (MustBreachCounts), so
 * a short rest is always two consecutive shifts of one person.
 */
export interface ScheduleRuleMatch {
  /** daysInARow: the run's working days, "YYYY-MM-DD" on the problem's clock. */
  readonly days?: readonly string[];
  /** The person the match is about. Absent = no one. */
  readonly resourceId?: string;
  readonly rule: ScheduleRuleName;
  /**
   * The shifts behind the match, earliest first: the two shifts of a
   * short rest, the shifts of a run of days.
   */
  readonly shiftIds: readonly string[];
}

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
  /**
   * A planner plans ahead and does not change history (F31 rework):
   * an assigned shift that started before this instant travels
   * pinned and marked as history, and still counts toward the
   * window's totals; an open one that started before it stays out.
   * Absent = no history.
   */
  readonly now?: Date;
  /** Override: pin EVERY existing assignment. Absent = the ruled
   * default (F22 deliverable 2, Q1-A): pinning is a choice, not a
   * default - only an item whose lock forbids reassignment is pinned;
   * everything else is movable. */
  readonly pinAssigned?: boolean;
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
  // An open shift that has started is history nobody worked: it stays out.
  // So does a pinned open shift: the solver leaves a pin alone, so it stays open.
  const shifts = input.events.filter(
    (event) =>
      !(now && event.status === "needsCover" && event.start < now) &&
      !(event.status === "needsCover" && isPinned(event)),
  );
  // Off rules and rules without a limit stay home; the rest go as entered.
  const agreements = (input.agreements ?? []).map((agreement) => ({
    id: agreement.id,
    rules: agreement.rules
      .filter((rule) => rule.on && Number.isFinite(rule.value) && rule.value > 0)
      .map((rule) => ({
        ...(rule.end ? { end: rule.end } : {}),
        kind: rule.kind,
        ...(rule.start ? { start: rule.start } : {}),
        value: rule.value,
      })),
  }));
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
      ...(resource.costCentsPerHour !== undefined
        ? { costCentsPerHour: resource.costCentsPerHour }
        : {}),
      id: resource.id,
      name: resource.name,
      skills: resource.tags ?? [],
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
                // The override adds pins; it never takes one away.
                input.pinAssigned === true ||
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
      // A shift that has started is history: no breach made only of history counts.
      ...(now !== undefined && event.start < now ? { history: true } : {}),
      id: event.id,
      requiredSkills: event.requiredTags ?? [],
      ...(event.split ? { split: { id: event.split.id, samePerson: event.split.samePerson } } : {}),
      start: wire(event.start),
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
