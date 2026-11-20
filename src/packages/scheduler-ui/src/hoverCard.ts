/**
 * What a shift's hover card shows, row by row (Matt 2026-11-13; decisions 2026-11-16: "yes, take
 * recommendations"). Every extra row shows only when the shift has it; the full detail stays one click
 * away in the shift dialog, so the card has no "More" expander. The card is shared by the free board and
 * the Workforce board: an extension's own rows come in as entries (BoardExtension.hoverEntries).
 *
 * - The status as a chip beside the title, never also as a row: the field keyed "status".
 * - Pinned as a mark beside the title; On call, night, split shift and busy elsewhere as chips.
 * - One Times row: the day, start and end, and the length in brackets. A shift past midnight names its
 *   end day. Time worked and the span both show when breaks make them differ.
 * - Breaks as tags, paid or unpaid in brackets; the board's time zone.
 */
import { formatClock } from "./clock";
import { formatDayLabel, type DateNames } from "./dateNames";
import { showsPin } from "./locks";
import { normalizeGaps, spanMinutes, workedMinutes } from "./spans";
import { formatString, type SchedulerStrings } from "./stringResources";
import type { HourFormat } from "./timeAxis";
import { clockMinutesBetween } from "./timeZone";
import type { SchedulerEventField, SchedulerUiEvent } from "./types";

/** A tag in a hover card row: filled (a Must skill) or outlined. */
export interface HoverCardTag {
  readonly label: string;
  /** Absent = outlined. */
  readonly look?: "filled";
}

/** A line of a shift's hover card. */
export interface HoverCardEntry {
  readonly label: string;
  /** The line's words; with `tags`, the tags' words for a reader that reads no tags. */
  readonly value: string;
  /** Full width, on a line of its own. */
  readonly wide?: boolean;
  /** Shown as tags in place of the value. */
  readonly tags?: readonly HoverCardTag[];
  /**
   * Shown as the card's chip of this kind, in its own words (the value), in place of a row: a Workforce duty ("On call
   * from home") is the On call chip.
   */
  readonly chip?: "onCall";
}

/** A chip under the title: what kind of shift it is. */
export interface HoverCardChip {
  readonly kind: "elsewhere" | "night" | "onCall" | "split";
  readonly label: string;
}

/** The status chip's look: assigned, needing cover (the board's warm attention), or plain. */
export type HoverCardStatusTone = "assigned" | "needsCover" | "neutral";

export interface HoverCardModel {
  readonly title: string;
  readonly status?: { readonly text: string; readonly tone: HoverCardStatusTone };
  readonly pinned: boolean;
  readonly chips: readonly HoverCardChip[];
  /** Times, breaks and the time zone. */
  readonly when: readonly HoverCardEntry[];
  /** Who works it and the shift's own details. */
  readonly details: readonly HoverCardEntry[];
}

export type HoverCardStrings = Pick<
  SchedulerStrings,
  | "assignedTo"
  | "hoverBreak"
  | "hoverBreakPaid"
  | "hoverBreakUnpaid"
  | "hoverBreaks"
  | "hoverDayTime"
  | "hoverHours"
  | "hoverHoursMinutes"
  | "hoverSplitShift"
  | "hoverTimeRange"
  | "hoverTimes"
  | "hoverTimesLength"
  | "hoverWorkedAndSpan"
  | "legendBusyElsewhere"
  | "legendOnCall"
  | "needsCover"
  | "nightShift"
  | "requiredSkills"
  | "timeZoneChip"
  | "unassigned"
>;

export interface HoverCardInput {
  readonly strings: HoverCardStrings;
  readonly dateNames: DateNames;
  readonly hourFormat: HourFormat;
  /** The board's time zone (the toolbar's chip). Absent = the board shows none. */
  readonly timeZoneLabel?: string;
  /** The assigned worker's name. */
  readonly resourceName?: string;
  /** Open work that is no gap in cover (on call, or an extension's open kind): "Unassigned", not "Needs cover". */
  readonly openWork: boolean;
  /** An extension's own rows, in place of the shift's fields (BoardExtension.hoverEntries). Absent = the fields. */
  readonly extensionEntries?: readonly HoverCardEntry[];
}

/** The field the status chip shows. */
export const STATUS_FIELD_KEY = "status";

/** A break of 1 hour or more makes a split shift (Matt 2026-11-14). */
const SPLIT_BREAK_MINUTES = 60;

/**
 * Hours and minutes in the board's language (W2-P12: never the component's own "h" and "m"). One amount never splits
 * over two lines ("8 Std. 30 Min."): its spaces are no-break spaces. The Unscheduled panel uses it too.
 */
export function formatHoursMinutes(totalMinutes: number, words: Pick<SchedulerStrings, "hoverHours" | "hoverHoursMinutes">): string {
  const minutes = Math.round(totalMinutes);
  const hours = String(Math.floor(minutes / 60));
  const rest = minutes % 60;
  const amount = rest === 0 ? formatString(words.hoverHours, { hours }) : formatString(words.hoverHoursMinutes, { hours, minutes: String(rest) });
  return amount.replace(/ /g, " ");
}

const sameDay = (first: Date, second: Date): boolean =>
  first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();

/**
 * The Times row's value: "Tue 3 Nov, 1pm – 9:30pm (8 h)". A shift past midnight names its end day ("Tue 3 Nov, 8pm –
 * Wed 4 Nov, 6am (10 h)"). The length is TIME WORKED; when breaks make the span differ, both show ("(8 h worked, 9 h
 * span)"): a chef on 9-2 then 5-10 works 10 h across a 13 h span, and the span is what span-of-hours rules count
 * (Docs/domain_model.md section 4).
 */
export function formatShiftTimes(event: Pick<SchedulerUiEvent, "end" | "gaps" | "start">, input: Pick<HoverCardInput, "dateNames" | "hourFormat" | "strings">): string {
  const { dateNames, hourFormat, strings } = input;
  const start = formatClock(event.start, hourFormat);
  const end = formatClock(event.end, hourFormat);
  const startDay = formatDayLabel(event.start, dateNames);
  const times = sameDay(event.start, event.end)
    ? formatString(strings.hoverDayTime, { day: startDay, time: formatString(strings.hoverTimeRange, { end, start }) })
    : formatString(strings.hoverTimeRange, {
        end: formatString(strings.hoverDayTime, { day: formatDayLabel(event.end, dateNames), time: end }),
        start: formatString(strings.hoverDayTime, { day: startDay, time: start }),
      });
  const shift = event as SchedulerUiEvent;
  const worked = workedMinutes(shift);
  const span = spanMinutes(shift);
  const length =
    Math.round(worked) === Math.round(span)
      ? formatHoursMinutes(worked, strings)
      : formatString(strings.hoverWorkedAndSpan, { span: formatHoursMinutes(span, strings), worked: formatHoursMinutes(worked, strings) });
  // The length in brackets wraps as one piece, never "(8 h worked, 9 h" over "span)".
  return formatString(strings.hoverTimesLength, { length: length.replace(/ /g, " "), times });
}

/** The shift's breaks as tags: "Meal break (unpaid)"; a break with no name is "Break". */
export function breakTags(event: SchedulerUiEvent, strings: Pick<SchedulerStrings, "hoverBreak" | "hoverBreakPaid" | "hoverBreakUnpaid">): readonly HoverCardTag[] {
  return normalizeGaps(event).map((gap) => {
    const name = gap.label?.trim() ? gap.label.trim() : strings.hoverBreak;
    return { label: formatString(gap.paid === true ? strings.hoverBreakPaid : strings.hoverBreakUnpaid, { break: name }) };
  });
}

/** A split shift: one shift with a break of 1 hour or more (Matt 2026-11-14), never two linked rows. */
export function isSplitShift(event: SchedulerUiEvent): boolean {
  return normalizeGaps(event).some((gap) => clockMinutesBetween(gap.start, gap.end) >= SPLIT_BREAK_MINUTES);
}

/** The card's rows for one shift. */
export function hoverCardModel(event: SchedulerUiEvent, input: HoverCardInput): HoverCardModel {
  const { strings } = input;
  const statusField = (event.fields ?? []).find((field) => field.key === STATUS_FIELD_KEY && field.value.trim().length > 0);
  const tone: HoverCardStatusTone = event.status === "assigned" ? "assigned" : input.openWork ? "neutral" : "needsCover";
  const onCallEntry = input.extensionEntries?.find((entry) => entry.chip === "onCall");
  const onCall = onCallEntry?.value ?? (event.onCall === true ? strings.legendOnCall : undefined);
  const chips: HoverCardChip[] = [
    ...(onCall ? [{ kind: "onCall" as const, label: onCall }] : []),
    ...(event.night === true ? [{ kind: "night" as const, label: strings.nightShift }] : []),
    ...(isSplitShift(event) ? [{ kind: "split" as const, label: strings.hoverSplitShift }] : []),
    ...(event.elsewhere === true ? [{ kind: "elsewhere" as const, label: strings.legendBusyElsewhere }] : []),
  ];
  const breaks = breakTags(event, strings);
  const when: HoverCardEntry[] = [
    { label: strings.hoverTimes, value: formatShiftTimes(event, input), wide: true },
    ...(breaks.length > 0 ? [{ label: strings.hoverBreaks, tags: breaks, value: breaks.map((tag) => tag.label).join(", "), wide: true }] : []),
    // A full row: "Your time zone (UTC-08:00)" never breaks inside its offset.
    ...(input.timeZoneLabel ? [{ label: strings.timeZoneChip, value: input.timeZoneLabel, wide: true }] : []),
  ];
  // The status is the chip's: its field never shows again as a row.
  const fields = (event.fields ?? []).filter((field: SchedulerEventField) => field.key !== STATUS_FIELD_KEY);
  const details: HoverCardEntry[] = [
    {
      label: strings.assignedTo,
      value: event.status === "needsCover" ? (input.openWork ? strings.unassigned : strings.needsCover) : (input.resourceName ?? event.resourceId),
    },
    ...(event.requiredTags && event.requiredTags.length > 0 ? [{ label: strings.requiredSkills, value: event.requiredTags.join(", ") }] : []),
    ...(input.extensionEntries?.filter((entry) => entry.chip === undefined) ?? fields),
  ];
  return {
    chips,
    details,
    pinned: showsPin(event),
    ...(statusField ? { status: { text: statusField.value.trim(), tone } } : {}),
    title: event.title,
    when,
  };
}
