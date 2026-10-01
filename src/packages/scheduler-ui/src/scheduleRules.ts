/**
 * The shared rules engine (section 12.2: mechanism here, values from
 * the host). Both hosts - the fixture/harness and the Dataverse
 * adapter - resolve a SchedulerRulesConfig and call evaluateScheduleRules,
 * so rule behavior cannot drift between the test bench and the PCF.
 * Reasons format through host-supplied strings (the adapter passes
 * resx-resolved text); the defaults here are the English fallbacks.
 *
 * Scopes follow the RuleResult contract: working hours is about the
 * item and holds for every candidate; skills, overlap, availability,
 * breaks, cross-group, and preference tiers are about the pairing.
 */
import type { RuleResult } from "./interactions";
import type { DragResult } from "./interactions";
import {
  evaluateResourcePreferences,
  type ResourcePreferenceRule,
} from "./resourcePreferences";
import { missingRequiredTags } from "./skills";
import { formatString } from "./stringResources";
import type {
  AvailabilityBand,
  SchedulerResource,
  SchedulerUiEvent,
} from "./types";

export type RulePolicy = "block" | "off" | "warn";

/**
 * The serializable maker configuration for interactive rules. The
 * adapter maps chr_ columns into this shape; the harness edits and
 * persists it directly. Parameters without Dataverse storage yet
 * (minimum break - award-layer, pending the rule-set design) stay at
 * their defaults there.
 */
export interface SchedulerRulesConfig {
  readonly availabilityPolicy: RulePolicy;
  readonly crossGroupPolicy: RulePolicy;
  readonly minimumBreakMinutes: number;
  readonly minimumBreakPolicy: RulePolicy;
  readonly overlapPolicy: RulePolicy;
  readonly skillMismatchPolicy: RulePolicy;
  /** Display-space hours; the rule is off when either bound is absent. */
  readonly workingEndHour?: number;
  readonly workingHoursPolicy: RulePolicy;
  readonly workingStartHour?: number;
}

export const defaultRulesConfig: SchedulerRulesConfig = {
  availabilityPolicy: "block",
  crossGroupPolicy: "off",
  minimumBreakMinutes: 0,
  minimumBreakPolicy: "warn",
  overlapPolicy: "warn",
  skillMismatchPolicy: "block",
  workingHoursPolicy: "off",
};

/** Reason format strings; hosts localize (the adapter via resx). */
export interface RuleReasonStrings {
  readonly minimumBreak: string;
  readonly missingSkill: string;
  readonly outsideGroup: string;
  readonly outsideHours: string;
  readonly overlap: string;
  readonly unavailable: string;
  readonly unavailableNoLabel: string;
}

export const defaultRuleReasonStrings: RuleReasonStrings = {
  minimumBreak: "Break under {minimum} min ({gap} min gap)",
  missingSkill: "Missing skill: {names}",
  outsideGroup: "Outside {group}",
  outsideHours: "Outside working hours ({start}-{end})",
  overlap: "Overlaps an existing shift",
  unavailable: "Unavailable: {label}",
  unavailableNoLabel: "Unavailable",
};

/** First unavailable-kind span the proposal intersects, if any. */
export function findUnavailableCollision(
  bands: readonly AvailabilityBand[],
  resourceId: string,
  start: Date,
  end: Date,
): AvailabilityBand | undefined {
  return bands.find(
    (band) =>
      band.kind === "unavailable" &&
      band.resourceId === resourceId &&
      band.start < end &&
      band.end > start,
  );
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
  /** Unavailable spans, in the same time space as `proposed`. */
  readonly availabilityBands: readonly AvailabilityBand[];
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
  /**
   * Instant used for preference-rule effective dating. Hosts whose
   * stored instants differ from display (the adapter) pass the stored
   * start; others pass proposed.start.
   */
  readonly preferenceDatingInstant?: Date;
  readonly preferenceRules?: readonly ResourcePreferenceRule[];
  readonly proposed: DragResult;
  readonly resources: readonly SchedulerResource[];
  readonly strings?: RuleReasonStrings;
}

/**
 * Evaluate every rule and return every failure. Callers fold the
 * results through aggregateVerdict. Order fixes the headline when
 * several rules of the same tier fail: preference, skills, working
 * hours, cross-group, overlap, availability, minimum break.
 */
export function evaluateScheduleRules(
  input: RuleEvaluationInput,
): readonly RuleResult[] {
  const { config, event, events, proposed, resources } = input;
  const strings = input.strings ?? defaultRuleReasonStrings;
  const results: RuleResult[] = [];
  const target = resources.find(
    (resource) => resource.id === proposed.resourceId,
  );
  // Overlap and break only read the proposed person's own events.
  const personEvents =
    input.eventsByResource?.get(proposed.resourceId) ??
    events.filter((candidate) => candidate.resourceId === proposed.resourceId);

  if (input.preferenceRules && input.preferenceRules.length > 0) {
    const preferenceVerdict = evaluateResourcePreferences(
      input.preferenceRules,
      event,
      proposed.resourceId,
      input.preferenceDatingInstant ?? proposed.start,
    );
    if (preferenceVerdict.kind !== "allow" && preferenceVerdict.reason) {
      results.push({
        kind: preferenceVerdict.kind,
        reason: preferenceVerdict.reason,
        scope: "person",
      });
    }
  }

  if (config.skillMismatchPolicy !== "off" && target) {
    const missing = missingRequiredTags(target, event?.requiredTags);
    if (missing.length > 0) {
      results.push({
        kind: config.skillMismatchPolicy,
        reason: formatString(strings.missingSkill, {
          names: missing.join(", "),
        }),
        scope: "person",
      });
    }
  }

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
      results.push({
        kind: config.workingHoursPolicy,
        reason: formatString(strings.outsideHours, {
          end: `${pad(config.workingEndHour)}:00`,
          start: `${pad(config.workingStartHour)}:00`,
        }),
        scope: "item",
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
      results.push({
        kind: config.crossGroupPolicy,
        reason: formatString(strings.outsideGroup, { group: mismatch[1] }),
        scope: "person",
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
      results.push({
        kind: config.overlapPolicy,
        reason: strings.overlap,
        scope: "person",
      });
    }
  }

  if (config.availabilityPolicy !== "off") {
    const band = findUnavailableCollision(
      input.availabilityBands,
      proposed.resourceId,
      proposed.start,
      proposed.end,
    );
    if (band) {
      results.push({
        kind: config.availabilityPolicy,
        reason: band.label
          ? formatString(strings.unavailable, { label: band.label })
          : strings.unavailableNoLabel,
        scope: "person",
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
      results.push({
        kind: config.minimumBreakPolicy,
        reason: formatString(strings.minimumBreak, {
          gap: String(violation.gapMinutes),
          minimum: String(config.minimumBreakMinutes),
        }),
        scope: "person",
      });
    }
  }

  return results;
}
