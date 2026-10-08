/**
 * "Why not…?" (E2, A2; design DR2 calls 1 to 4, 11, 12, DR2-Q2): the
 * planner picks a person for a shift and the solver says what that
 * would add and remove, all rules weighed. This module turns the answer
 * into the lines the change list shows, verdict first, and works out
 * what the board can offer on the current roster: assign the person
 * when they are free, swap two people when both moves pass the board's
 * own Must checks, or name the shift that would be left open. Nothing
 * here calls the solver; the extension asks it.
 */
import { formatHours } from "./compactChip";
import { formatDayLabel, type DateNames } from "./dateNames";
import { allowVerdict, type TimelineChange, type ValidateChange } from "./interactions";
import { isPinned } from "./locks";
import { matchFixText, matchKey, mustRuleLabel, restGapMinutes, type ReasonContext } from "./proposalReasons";
import {
  isMustRule,
  type ScheduleCandidateCheck,
  type ScheduleRuleMatch,
  type ShouldRuleName,
} from "./schedulingContract";
import { shiftsOverlap } from "./scheduleRules";
import { formatString, type SchedulerStrings } from "./stringResources";
import type { SchedulerResource, SchedulerUiEvent } from "./types";

/**
 * "fix" = a breach removed or time gained, "add" = a Must breach added,
 * "strain" = a Should rule strained, "move" = who takes which shift.
 */
export type WhyNotTone = "add" | "fix" | "move" | "strain";

/** One line of an answer: a 16px status icon and its text, as the change list's reason lines. */
export interface WhyNotLine {
  readonly text: string;
  readonly tone: WhyNotTone;
}

/** The answer's first line, with its status: "info" = as good a fit. */
export interface WhyNotVerdict {
  readonly text: string;
  readonly tone: "add" | "fix" | "info" | "strain";
}

/**
 * The verdict, first in the answer (design DR2 call 3): a Must rule the
 * move would break, else a Should rule it strains, else as good or a
 * better fit. In review an equal fit adds that Optimize had to pick.
 */
export function whyNotVerdict(
  check: ScheduleCandidateCheck,
  name: string,
  strings: SchedulerStrings,
  reviewing: boolean,
): WhyNotVerdict {
  const mustAdded = check.added.filter((match) => isMustRule(match.rule)).length;
  if (mustAdded > 0) {
    return {
      text:
        mustAdded === 1
          ? formatString(strings.whyNotVerdictMustOne, { name })
          : formatString(strings.whyNotVerdictMust, { count: String(mustAdded), name }),
      tone: "add",
    };
  }
  if (check.fit === "worse") {
    return { text: formatString(strings.whyNotVerdictShould, { name }), tone: "strain" };
  }
  if (check.fit === "equal") {
    return {
      text: formatString(reviewing ? strings.whyNotVerdictEqualReview : strings.whyNotVerdictEqual, { name }),
      tone: "info",
    };
  }
  return { text: formatString(strings.whyNotVerdictBetter, { name }), tone: "fix" };
}

export interface WhyNotLineContext extends ReasonContext {
  /**
   * The extension's own words for a Must match the move adds, such as
   * the agreement's limit; undefined = the rule's name.
   */
  readonly describe?: (match: ScheduleRuleMatch) => string | undefined;
  /** The person taken off the shift; absent on an open shift. */
  readonly takenOffId?: string;
}

/** The answer's rule lines: the person picked first, then the person taken off. */
export interface WhyNotLines {
  readonly picked: readonly WhyNotLine[];
  readonly takenOff: readonly WhyNotLine[];
}

const SPREAD: ShouldRuleName = "spreadOfShifts";

/** A Must match the move adds, in the board's words: a short rest with its gap, else the rule. */
function addedText(match: ScheduleRuleMatch, context: ReasonContext): string {
  const gap = match.rule === "restBetweenShifts" ? restGapMinutes(match, context) : undefined;
  return gap !== undefined && match.resourceId !== undefined
    ? formatString(context.strings.reasonAddsRest, { hours: formatHours(gap), name: context.nameOf(match.resourceId) })
    : mustRuleLabel(match.rule, context.strings);
}

/** A Should rule's name in the answer; the preference rules read as reasons instead. */
function shouldRuleLabel(rule: ShouldRuleName, strings: SchedulerStrings): string | undefined {
  switch (rule) {
    case "spreadOfShifts":
      return strings.ruleSpreadOfShifts;
    case "minimumHours":
      return strings.ruleMinimumHours;
    case "splitPartsOnePerson":
      return strings.mustKindSplitParts;
    default:
      return undefined;
  }
}

/**
 * The rule lines of an answer (design DR2 calls 3 and 4): each Must
 * match the move adds, in the extension's words when it has them; each
 * Must match it removes, as the change list words a fix; preferred and
 * unpreferred time as reasons; every other Should rule as its name and
 * a direction word, never a count. A Should rule's matches net out per
 * person, so a rule the move leaves as it was shows nothing.
 */
export function whyNotLines(check: ScheduleCandidateCheck, context: WhyNotLineContext): WhyNotLines {
  const { strings, takenOffId } = context;
  const picked: WhyNotLine[] = [];
  const takenOff: WhyNotLine[] = [];
  const side = (match: ScheduleRuleMatch): WhyNotLine[] =>
    takenOffId !== undefined && match.resourceId === takenOffId ? takenOff : picked;

  for (const match of check.added) {
    if (isMustRule(match.rule)) {
      side(match).push({ text: context.describe?.(match) ?? addedText(match, context), tone: "add" });
    }
  }
  for (const match of check.removed) {
    if (isMustRule(match.rule)) {
      side(match).push({ text: matchFixText(match, context), tone: "fix" });
    }
  }

  // Should rules: added minus removed, per rule and person.
  const net = new Map<string, { readonly match: ScheduleRuleMatch; count: number }>();
  const tally = (match: ScheduleRuleMatch, step: number): void => {
    if (isMustRule(match.rule)) {
      return;
    }
    const key = `${match.rule}|${match.resourceId ?? ""}`;
    const entry = net.get(key);
    if (entry) {
      entry.count += step;
    } else {
      net.set(key, { count: step, match });
    }
  };
  check.added.forEach((match) => tally(match, 1));
  check.removed.forEach((match) => tally(match, -1));
  for (const { count, match } of net.values()) {
    if (count === 0) {
      continue;
    }
    const strained = count > 0;
    const name = match.resourceId !== undefined ? context.nameOf(match.resourceId) : undefined;
    if (match.rule === "unpreferredTime" || match.rule === "preferredTime") {
      if (name === undefined) {
        continue;
      }
      // Unpreferred time given strains; preferred time is a reward, so losing it strains.
      const strains = match.rule === "unpreferredTime" ? strained : !strained;
      const text =
        match.rule === "unpreferredTime"
          ? formatString(strained ? strings.reasonUnpreferred : strings.reasonAvoidsUnpreferred, { name })
          : formatString(strings.whyNotPrefers, { name });
      side(match).push({ text, tone: strains ? "strain" : "fix" });
      continue;
    }
    const rule = shouldRuleLabel(match.rule as ShouldRuleName, strings);
    if (rule === undefined) {
      continue;
    }
    const template =
      match.rule === SPREAD
        ? strained
          ? strings.whyNotLessEven
          : strings.whyNotMoreEven
        : strained
          ? strings.whyNotWorse
          : strings.whyNotBetter;
    side(match).push({ text: formatString(template, { rule }), tone: strained ? "strain" : "fix" });
  }
  return { picked, takenOff };
}

/**
 * The version of a roster for "Why not…?" (S4-2): it changes whenever a
 * shift's person, times or status changes, and only then, so a
 * re-render that hands the board equal items keeps an answer on screen.
 * A 53-bit hash of each shift's facts, in the order given.
 */
export function rosterVersionOf(events: readonly SchedulerUiEvent[]): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const mix = (text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
  };
  for (const event of events) {
    mix(`${event.id}|${event.resourceId}|${event.status}|${event.start.getTime()}|${event.end.getTime()};`);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${events.length}:${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

const pad = (value: number): string => value.toString().padStart(2, "0");
const clock = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** "Night · Tue 3 Nov 22:00-06:00": a shift as the answer names it. */
export function whyNotShiftLabel(event: SchedulerUiEvent, names: DateNames): string {
  return `${event.title} · ${formatDayLabel(event.start, names)} ${clock(event.start)}-${clock(event.end)}`;
}

/**
 * What the answer offers on the current roster (DR2-Q2):
 * - assign: the person is free then; they take the shift and whoever
 *   held it comes off;
 * - swap: the person works one overlapping shift that the person taken
 *   off can take, and the board's Must checks find nothing new after
 *   both moves; the lines say who takes what and what it fixes;
 * - leftOpen: otherwise; names the shift the person would leave open;
 * - blocked: the maker's rules refuse the assignment;
 * - none: a pinned shift, which no move changes.
 */
export type WhyNotAction =
  | { readonly change: TimelineChange; readonly kind: "assign" }
  | {
      readonly changes: readonly [TimelineChange, TimelineChange];
      readonly kind: "swap";
      readonly lines: readonly WhyNotLine[];
      /** The person taken off, who takes the picked person's shift. */
      readonly other: SchedulerResource;
    }
  | { readonly kind: "blocked"; readonly text: string }
  | { readonly kind: "leftOpen"; readonly text: string }
  | { readonly kind: "none" };

export interface WhyNotActionInput {
  /**
   * The board's Must count of a roster, with its matches (the review
   * slot's): both moves of a swap must add no Must match. Absent = no
   * swap is offered.
   */
  readonly checkMust?: (events: readonly SchedulerUiEvent[]) => { readonly matches: readonly ScheduleRuleMatch[] };
  /** The roster as it stands: every item, open ones included. */
  readonly events: readonly SchedulerUiEvent[];
  readonly names: DateNames;
  readonly nameOf: (resourceId: string) => string;
  readonly picked: SchedulerResource;
  readonly resources: readonly SchedulerResource[];
  /** The shift asked about, as the roster holds it. */
  readonly shift: SchedulerUiEvent;
  readonly strings: SchedulerStrings;
  /** A board date back to the real moment, for the fix lines' rest gaps. */
  readonly toInstant?: (display: Date) => Date;
  /** The maker's rules on a hand edit; a block keeps the assignment off. */
  readonly validateChange?: ValidateChange;
}

const works = (event: SchedulerUiEvent): boolean =>
  event.status !== "needsCover" && event.undated !== true && event.review !== "ghost";

/** A move of one shift to one person, at its own times. */
function moveTo(
  event: SchedulerUiEvent,
  resourceId: string,
  validateChange: ValidateChange | undefined,
): TimelineChange {
  const result = { end: event.end, resourceId, start: event.start };
  return { event, result, verdict: validateChange?.(event, result) ?? allowVerdict };
}

export function whyNotAction(input: WhyNotActionInput): WhyNotAction {
  const { events, picked, shift, strings } = input;
  if (isPinned(shift)) {
    return { kind: "none" };
  }
  const busy = events.filter(
    (event) => works(event) && event.resourceId === picked.id && event.id !== shift.id && shiftsOverlap(event, shift),
  );
  const pickedName = input.nameOf(picked.id);
  if (busy.length === 0) {
    const change = moveTo(shift, picked.id, input.validateChange);
    return change.verdict.kind === "block"
      ? { kind: "blocked", text: change.verdict.reason ?? strings.dialogNotAllowed }
      : { change, kind: "assign" };
  }
  const first = busy[0] as SchedulerUiEvent;
  const leftOpen: WhyNotAction = {
    kind: "leftOpen",
    text: formatString(strings.whyNotLeftOpen, {
      name: pickedName,
      shift: whyNotShiftLabel(first, input.names),
    }),
  };
  const holder = works(shift) ? input.resources.find((resource) => resource.id === shift.resourceId) : undefined;
  if (busy.length > 1 || !holder || isPinned(first) || !input.checkMust) {
    return leftOpen;
  }
  // The person taken off must be free for the other shift.
  const holderBusy = events.some(
    (event) => works(event) && event.resourceId === holder.id && event.id !== shift.id && shiftsOverlap(event, first),
  );
  if (holderBusy) {
    return leftOpen;
  }
  const swapped = events.map((event) =>
    event.id === shift.id
      ? { ...event, resourceId: picked.id }
      : event.id === first.id
        ? { ...event, resourceId: holder.id }
        : event,
  );
  const before = input.checkMust(events);
  const after = input.checkMust(swapped);
  const beforeKeys = new Set(before.matches.map(matchKey));
  const afterKeys = new Set(after.matches.map(matchKey));
  if (after.matches.some((match) => !beforeKeys.has(matchKey(match)))) {
    return leftOpen;
  }
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const context: ReasonContext = {
    eventsById,
    nameOf: input.nameOf,
    strings,
    toInstant: input.toInstant,
  };
  const fixes = before.matches
    .filter((match) => !afterKeys.has(matchKey(match)))
    .map((match): WhyNotLine => ({ text: matchFixText(match, context), tone: "fix" }));
  return {
    changes: [moveTo(shift, picked.id, undefined), moveTo(first, holder.id, undefined)],
    kind: "swap",
    lines: [
      { text: formatString(strings.whyNotTakes, { name: pickedName, shift: whyNotShiftLabel(shift, input.names) }), tone: "move" },
      {
        text: formatString(strings.whyNotTakes, { name: input.nameOf(holder.id), shift: whyNotShiftLabel(first, input.names) }),
        tone: "move",
      },
      ...fixes,
    ],
    other: holder,
  };
}
