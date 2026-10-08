/**
 * Why the solver proposed each change (design R10, D17; Pass 1 calls 4
 * and 5): the rule matches a change removes from the roster as it
 * stands, or adds to the roster as proposed, read from the run's
 * analysis. Nothing is invented: a run without matches (counts only,
 * or not analysed) gives no reasons, and a change no match names gets
 * no line.
 */
import { formatHours } from "./compactChip";
import { formatDayLabel, type DateNames } from "./dateNames";
import { isMustRule, type ScheduleRuleMatch, type ScheduleSolveAnalysis } from "./schedulingContract";
import type { ProposalChange } from "./solve";
import { formatString, type SchedulerStrings } from "./stringResources";
import { clockMinutesBetween } from "./timeZone";
import type { SchedulerUiEvent } from "./types";

/** "fix" = a breach removed, "add" = a Must breach added, "strain" = a Should rule strained. */
export type ProposalReasonTone = "add" | "fix" | "strain";

export interface ProposalReason {
  readonly text: string;
  readonly tone: ProposalReasonTone;
}

/** One match's identity across the two rosters. */
export function matchKey(match: ScheduleRuleMatch): string {
  return `${match.rule}|${match.resourceId ?? ""}|${[...match.shiftIds].sort().join(",")}`;
}

export interface ReasonContext {
  /** Every shift the run answered for, by id, for the times of a rest gap. */
  readonly eventsById: ReadonlyMap<string, SchedulerUiEvent>;
  readonly nameOf: (resourceId: string) => string;
  readonly strings: SchedulerStrings;
  /** A board date back to the real moment, for rest gaps. Absent = the dates are moments. */
  readonly toInstant?: (display: Date) => Date;
}

/** The minutes between a short rest's two shifts; undefined when a shift is not on the board. */
export function restGapMinutes(
  match: ScheduleRuleMatch,
  context: Pick<ReasonContext, "eventsById" | "toInstant">,
): number | undefined {
  const [earlierId, laterId] = match.shiftIds;
  const earlier = earlierId !== undefined ? context.eventsById.get(earlierId) : undefined;
  const later = laterId !== undefined ? context.eventsById.get(laterId) : undefined;
  if (!earlier || !later) {
    return undefined;
  }
  return context.toInstant
    ? (context.toInstant(later.start).getTime() - context.toInstant(earlier.end).getTime()) / 60_000
    : clockMinutesBetween(earlier.end, later.start);
}

/** What removing a Must match fixes, as a reason line words it: "Fixes Sam's rest (8 h)". */
export function matchFixText(match: ScheduleRuleMatch, context: ReasonContext): string {
  return fixText(match, context);
}

/** A Must rule's name: a breakdown row's for the named rows, else the kind "Other Must rules" names. */
export function mustRuleLabel(rule: ScheduleRuleMatch["rule"], strings: SchedulerStrings): string {
  switch (rule) {
    case "restBetweenShifts":
      return strings.mustRowRest;
    case "daysInARow":
      return strings.mustRowDaysInARow;
    case "skills":
      return strings.mustRowSkills;
    case "onLeaveOrUnavailable":
      return strings.mustRowOnLeave;
    case "overlap":
      return strings.mustKindOverlap;
    case "maximumHours":
      return strings.mustKindMaximumHours;
    case "splitParts":
      return strings.mustKindSplitParts;
    default:
      return strings.mustKindUnlisted;
  }
}

function fixText(match: ScheduleRuleMatch, context: ReasonContext): string {
  const { strings } = context;
  const name = match.resourceId !== undefined ? context.nameOf(match.resourceId) : undefined;
  if (match.rule === "restBetweenShifts" && name !== undefined) {
    const gap = restGapMinutes(match, context);
    return gap === undefined
      ? strings.reasonFixesMust
      : formatString(strings.reasonFixesRest, { hours: formatHours(gap), name });
  }
  if (match.rule === "daysInARow" && name !== undefined) {
    return formatString(strings.reasonFixesDaysInARow, { name });
  }
  if (match.rule === "skills") {
    return strings.reasonFixesSkill;
  }
  return strings.reasonFixesMust;
}

function addText(match: ScheduleRuleMatch, context: ReasonContext): string {
  const { strings } = context;
  const name = match.resourceId !== undefined ? context.nameOf(match.resourceId) : undefined;
  const gap = match.rule === "restBetweenShifts" ? restGapMinutes(match, context) : undefined;
  return name !== undefined && gap !== undefined
    ? formatString(strings.reasonAddsRest, { hours: formatHours(gap), name })
    : strings.reasonAddsMust;
}

/** What one change fixes and adds: matches naming its shift, in one roster and not the other. */
export function changeMatches(
  change: ProposalChange,
  analysis: ScheduleSolveAnalysis,
): { readonly added: readonly ScheduleRuleMatch[]; readonly fixed: readonly ScheduleRuleMatch[] } {
  const id = change.current.id;
  const before = analysis.current.matches ?? [];
  const after = analysis.proposed.matches ?? [];
  const beforeKeys = new Set(before.map(matchKey));
  const afterKeys = new Set(after.map(matchKey));
  return {
    added: after.filter((match) => match.shiftIds.includes(id) && !beforeKeys.has(matchKey(match))),
    fixed: before.filter((match) => match.shiftIds.includes(id) && !afterKeys.has(matchKey(match))),
  };
}

/**
 * One reason line per change, by its current id. A Must breach the
 * change adds comes first, so a reason never hides one; then the Must
 * breach it fixes, then the person's unpreferred time it gives or
 * avoids, then an open shift it fills.
 */
export function proposalReasons(
  changes: readonly ProposalChange[],
  analysis: ScheduleSolveAnalysis | undefined,
  context: ReasonContext,
): ReadonlyMap<string, ProposalReason> {
  const reasons = new Map<string, ProposalReason>();
  if (!analysis || analysis.countsOnly || (!analysis.current.matches && !analysis.proposed.matches)) {
    return reasons;
  }
  const { strings } = context;
  for (const change of changes) {
    const { added, fixed } = changeMatches(change, analysis);
    const mustAdded = added.find((match) => isMustRule(match.rule));
    const mustFixed = fixed.find((match) => isMustRule(match.rule));
    const strained = added.find((match) => match.rule === "unpreferredTime" && match.resourceId !== undefined);
    const avoided = fixed.find((match) => match.rule === "unpreferredTime" && match.resourceId !== undefined);
    let reason: ProposalReason | undefined;
    if (mustAdded) {
      reason = { text: addText(mustAdded, context), tone: "add" };
    } else if (mustFixed) {
      reason = { text: fixText(mustFixed, context), tone: "fix" };
    } else if (strained?.resourceId !== undefined) {
      reason = {
        text: formatString(strings.reasonUnpreferred, { name: context.nameOf(strained.resourceId) }),
        tone: "strain",
      };
    } else if (avoided?.resourceId !== undefined) {
      reason = {
        text: formatString(strings.reasonAvoidsUnpreferred, { name: context.nameOf(avoided.resourceId) }),
        tone: "fix",
      };
    } else if (change.kind === "assign") {
      reason = { text: strings.reasonFillsOpen, tone: "fix" };
    }
    if (reason) {
      reasons.set(change.current.id, reason);
    }
  }
  return reasons;
}

/**
 * The Must breaches a person's changes fix, for the change list's line
 * per person in a long proposal: each breach once, by the person the
 * change gives the shift to, or takes it from when it leaves it open.
 */
export function personFixCounts(
  changes: readonly ProposalChange[],
  analysis: ScheduleSolveAnalysis | undefined,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  if (!analysis || analysis.countsOnly || !analysis.current.matches) {
    return counts;
  }
  const byPerson = new Map<string, Set<string>>();
  for (const change of changes) {
    const side = change.proposed.status === "needsCover" ? change.current : change.proposed;
    const fixed = changeMatches(change, analysis).fixed.filter((match) => isMustRule(match.rule));
    if (fixed.length === 0) {
      continue;
    }
    const own = byPerson.get(side.resourceId) ?? new Set<string>();
    for (const match of fixed) {
      own.add(matchKey(match));
    }
    byPerson.set(side.resourceId, own);
  }
  byPerson.forEach((keys, resourceId) => counts.set(resourceId, keys.size));
  return counts;
}

/** Up to this many entries in a drill-down group; the rest are counted. */
export const DRILL_DOWN_LIMIT = 50;

/** One entry of a breakdown row's group in the change list. */
export interface DrillDownEntry {
  readonly key: string;
  readonly label: string;
  /** The entry's shifts that are on the board; history shifts are not. */
  readonly shiftIds: readonly string[];
}

export interface DrillDownContext extends ReasonContext {
  readonly names: DateNames;
}

const pad = (value: number): string => value.toString().padStart(2, "0");
const clock = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const range = (event: SchedulerUiEvent): string => `${clock(event.start)}-${clock(event.end)}`;

/** "YYYY-MM-DD" as that day's board date. */
function boardDay(date: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

/** The kind a match of "Other Must rules" names. */
function otherKind(match: ScheduleRuleMatch, strings: SchedulerStrings): string {
  switch (match.rule) {
    case "overlap":
      return strings.mustKindOverlap;
    case "maximumHours":
      return strings.mustKindMaximumHours;
    case "splitParts":
      return strings.mustKindSplitParts;
    default:
      return strings.mustKindUnlisted;
  }
}

/**
 * A breakdown row's matches as change-list entries (design Pass 1 call
 * 4): who and when, from the shifts on the board. A short rest reads
 * from the end of one shift to the start of the next, a run of days
 * from its first day to its last; a match of "Other Must rules" leads
 * with its kind. A match naming a shift the board does not hold (the
 * look-back before the period) shows what the board has.
 */
export function drillDownEntries(
  matches: readonly ScheduleRuleMatch[],
  context: DrillDownContext,
): readonly DrillDownEntry[] {
  const { eventsById, names, strings } = context;
  return matches.map((match, index) => {
    const shifts = match.shiftIds
      .map((id) => eventsById.get(id))
      .filter((event): event is SchedulerUiEvent => event !== undefined)
      .sort((first, second) => first.start.getTime() - second.start.getTime());
    const people =
      match.resourceId !== undefined
        ? context.nameOf(match.resourceId)
        : [...new Set(shifts.map((shift) => context.nameOf(shift.resourceId)))].join(" + ");
    const first = shifts[0];
    const last = shifts[shifts.length - 1];
    let when = "";
    if (match.rule === "restBetweenShifts" && shifts.length === 2 && first && last) {
      when = `${formatDayLabel(first.end, names)} ${clock(first.end)} → ${formatDayLabel(last.start, names)} ${clock(last.start)}`;
    } else if (match.days && match.days.length > 0) {
      const firstDay = boardDay(match.days[0] as string);
      const lastDay = boardDay(match.days[match.days.length - 1] as string);
      when =
        firstDay && lastDay
          ? `${formatDayLabel(firstDay, names)} – ${formatDayLabel(lastDay, names)}`
          : "";
    } else if (first && last && first !== last && match.rule === "maximumHours") {
      when = `${formatDayLabel(first.start, names)} – ${formatDayLabel(last.start, names)}`;
    } else if (first) {
      when = `${first.title} · ${formatDayLabel(first.start, names)} ${shifts.map(range).join(", ")}`;
    }
    const parts = [
      mustRowOfRule(match) === "other" ? otherKind(match, strings) : "",
      people,
      when,
    ].filter((part) => part.length > 0);
    return {
      key: `${matchKey(match)}#${index}`,
      label: parts.join(" · "),
      shiftIds: shifts.map((shift) => shift.id),
    };
  });
}

function mustRowOfRule(match: ScheduleRuleMatch): "named" | "other" {
  return match.rule === "restBetweenShifts" ||
    match.rule === "daysInARow" ||
    match.rule === "skills" ||
    match.rule === "onLeaveOrUnavailable"
    ? "named"
    : "other";
}
