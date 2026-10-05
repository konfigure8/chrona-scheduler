/**
 * The shared rules engine (section 12.2: mechanism here, values from
 * the host). Both hosts - the fixture/harness and the Dataverse
 * adapter - resolve a SchedulerRulesConfig and call evaluateScheduleRules,
 * so rule behavior cannot drift between the test bench and the PCF.
 * Reasons format through host-supplied strings (the adapter passes
 * resx-resolved text); the defaults here are the English fallbacks.
 *
 * Scopes follow the RuleResult contract: working hours is about the
 * item and holds for every candidate; overlap, breaks and cross-group
 * are about the pairing. A scenario package adds its own rules
 * (extraRules), each taking its place in the order by number.
 */
import type { RuleResult } from "./interactions";
import type { DragResult } from "./interactions";
import { formatString } from "./stringResources";
import type { SchedulerResource, SchedulerUiEvent } from "./types";

export type RulePolicy = "block" | "off" | "warn";

/**
 * The serializable maker configuration for interactive rules. The
 * adapter maps chr_ columns into this shape; the harness edits and
 * persists it directly. Parameters without Dataverse storage yet
 * (minimum break - award-layer, pending the rule-set design) stay at
 * their defaults there.
 */
export interface SchedulerRulesConfig {
  readonly crossGroupPolicy: RulePolicy;
  readonly minimumBreakMinutes: number;
  readonly minimumBreakPolicy: RulePolicy;
  readonly overlapPolicy: RulePolicy;
  /** Display-space hours; the rule is off when either bound is absent. */
  readonly workingEndHour?: number;
  readonly workingHoursPolicy: RulePolicy;
  readonly workingStartHour?: number;
}

export const defaultRulesConfig: SchedulerRulesConfig = {
  crossGroupPolicy: "off",
  minimumBreakMinutes: 0,
  minimumBreakPolicy: "warn",
  overlapPolicy: "warn",
  workingHoursPolicy: "off",
};

/** Reason format strings; hosts localize (the adapter via resx). */
export interface RuleReasonStrings {
  readonly minimumBreak: string;
  readonly outsideGroup: string;
  readonly outsideHours: string;
  readonly overlap: string;
}

export const defaultRuleReasonStrings: RuleReasonStrings = {
  minimumBreak: "Break under {minimum} min ({gap} min gap)",
  outsideGroup: "Outside {group}",
  outsideHours: "Outside working hours ({start}-{end})",
  overlap: "Overlaps an existing shift",
};

/**
 * Where the board's own rules sit when several of one tier fail: the
 * first failure is the headline. An extra rule takes its place by number.
 */
export const scheduleRuleOrder = {
  crossGroup: 30,
  minimumBreak: 60,
  overlap: 40,
  workingHours: 20,
} as const;

/** What a rule reads for one proposed change. */
export interface ScheduleRuleContext {
  readonly event: SchedulerUiEvent | undefined;
  /** The proposed person's own events. */
  readonly personEvents: readonly SchedulerUiEvent[];
  readonly proposed: DragResult;
  /** The proposed person; absent for the open row. */
  readonly target: SchedulerResource | undefined;
}

/** A scenario package's rule, evaluated with the board's own. */
export interface ScheduleRule {
  readonly evaluate: (context: ScheduleRuleContext) => RuleResult | undefined;
  /** Its place among the rules; see scheduleRuleOrder. */
  readonly order: number;
}

export interface BreakViolation {
  /** The actual gap in whole minutes (floored). */
  readonly gapMinutes: number;
  readonly neighborTitle: string;
}

/**
 * Smallest non-negative gap to a neighboring booking on the same
 * person that is under the minimum. Overlapping neighbors (negative
 * gap) are the overlap rule's finding, not a break violation.
 */
export function findBreakViolation(
  events: readonly SchedulerUiEvent[],
  excludeEventId: string | undefined,
  resourceId: string,
  start: Date,
  end: Date,
  minimumMinutes: number,
): BreakViolation | undefined {
  if (minimumMinutes <= 0) {
    return undefined;
  }
  let worst: BreakViolation | undefined;
  for (const candidate of events) {
    if (
      candidate.id === excludeEventId ||
      candidate.resourceId !== resourceId ||
      candidate.status === "needsCover"
    ) {
      continue;
    }
    const gapMs =
      candidate.start >= end
        ? candidate.start.getTime() - end.getTime()
        : candidate.end <= start
          ? start.getTime() - candidate.end.getTime()
          : -1;
    if (gapMs < 0) {
      continue;
    }
    const gapMinutes = Math.floor(gapMs / 60000);
    if (gapMinutes >= minimumMinutes) {
      continue;
    }
    if (!worst || gapMinutes < worst.gapMinutes) {
      worst = { gapMinutes, neighborTitle: candidate.title };
    }
  }
  return worst;
}

/**
 * Per-resource event index for on-demand rule evaluation. Overlap and
 * break rules only ever look at the proposed person's own events, so
 * callers that evaluate many times against one dataset (a drag frame
 * stream, the dialog's candidate ranking) build this once instead of
 * letting every evaluation scan the full array.
 */
export function buildEventsByResource(
  events: readonly SchedulerUiEvent[],
): ReadonlyMap<string, readonly SchedulerUiEvent[]> {
  const index = new Map<string, SchedulerUiEvent[]>();
  for (const event of events) {
    const bucket = index.get(event.resourceId);
    if (bucket) {
      bucket.push(event);
    } else {
      index.set(event.resourceId, [event]);
    }
  }
  return index;
}

export interface RuleEvaluationInput {
  readonly config: SchedulerRulesConfig;
  readonly event: SchedulerUiEvent | undefined;
  /** All scheduled events, in the same time space as `proposed`. */
  readonly events: readonly SchedulerUiEvent[];
  /**
   * Optional buildEventsByResource result over `events`; supply it
   * when calling the evaluator repeatedly against one dataset.
   */
  readonly eventsByResource?: ReadonlyMap<
    string,
    readonly SchedulerUiEvent[]
  >;
  /** A scenario package's rules, in the same time space as `proposed`. */
  readonly extraRules?: readonly ScheduleRule[];
  readonly proposed: DragResult;
  readonly resources: readonly SchedulerResource[];
  readonly strings?: RuleReasonStrings;
}

/**
 * Evaluate every rule and return every failure. Callers fold the
 * results through aggregateVerdict. Order fixes the headline when
 * several rules of the same tier fail: working hours, cross-group,
 * overlap, minimum break, with the extra rules in their places.
 */
export function evaluateScheduleRules(
  input: RuleEvaluationInput,
): readonly RuleResult[] {
  const { config, event, events, proposed, resources } = input;
  const strings = input.strings ?? defaultRuleReasonStrings;
  const found: { readonly order: number; readonly result: RuleResult }[] = [];
  const target = resources.find(
    (resource) => resource.id === proposed.resourceId,
  );
  // Overlap and break only read the proposed person's own events.
  const personEvents =
    input.eventsByResource?.get(proposed.resourceId) ??
    events.filter((candidate) => candidate.resourceId === proposed.resourceId);

  if (
    config.workingHoursPolicy !== "off" &&
    config.workingStartHour !== undefined &&
    config.workingEndHour !== undefined
  ) {
    const startHour =
      proposed.start.getHours() + proposed.start.getMinutes() / 60;
    const endDate = new Date(proposed.end.getTime() - 1);
    const endHour = endDate.getHours() + endDate.getMinutes() / 60;
    const sameDay = proposed.start.toDateString() === endDate.toDateString();
    const inside =
      sameDay &&
      startHour >= config.workingStartHour &&
      endHour < config.workingEndHour;
    if (!inside) {
      const pad = (value: number): string => String(value).padStart(2, "0");
      found.push({
        order: scheduleRuleOrder.workingHours,
        result: {
          kind: config.workingHoursPolicy,
          reason: formatString(strings.outsideHours, {
            end: `${pad(config.workingEndHour)}:00`,
            start: `${pad(config.workingStartHour)}:00`,
          }),
          scope: "item",
        },
      });
    }
  }

  if (config.crossGroupPolicy !== "off" && event?.groups && target?.groups) {
    // Any set where both sides carry a value and they differ trips
    // the rule - grouping is flexible, the policy is set-agnostic.
    const mismatch = Object.entries(event.groups).find(
      ([set, value]) => target.groups?.[set] && target.groups[set] !== value,
    );
    if (mismatch) {
      found.push({
        order: scheduleRuleOrder.crossGroup,
        result: {
          kind: config.crossGroupPolicy,
          reason: formatString(strings.outsideGroup, { group: mismatch[1] }),
          scope: "person",
        },
      });
    }
  }

  if (config.overlapPolicy !== "off") {
    const overlaps = personEvents.some(
      (candidate) =>
        candidate.id !== event?.id &&
        candidate.status !== "needsCover" &&
        candidate.start < proposed.end &&
        candidate.end > proposed.start,
    );
    if (overlaps) {
      found.push({
        order: scheduleRuleOrder.overlap,
        result: {
          kind: config.overlapPolicy,
          reason: strings.overlap,
          scope: "person",
        },
      });
    }
  }

  if (config.minimumBreakPolicy !== "off") {
    const violation = findBreakViolation(
      personEvents,
      event?.id,
      proposed.resourceId,
      proposed.start,
      proposed.end,
      config.minimumBreakMinutes,
    );
    if (violation) {
      found.push({
        order: scheduleRuleOrder.minimumBreak,
        result: {
          kind: config.minimumBreakPolicy,
          reason: formatString(strings.minimumBreak, {
            gap: String(violation.gapMinutes),
            minimum: String(config.minimumBreakMinutes),
          }),
          scope: "person",
        },
      });
    }
  }

  if (input.extraRules) {
    const context: ScheduleRuleContext = { event, personEvents, proposed, target };
    for (const rule of input.extraRules) {
      const result = rule.evaluate(context);
      if (result) {
        found.push({ order: rule.order, result });
      }
    }
  }

  // Array.prototype.sort is stable: one rule's results keep their order.
  return [...found].sort((a, b) => a.order - b.order).map((entry) => entry.result);
}
