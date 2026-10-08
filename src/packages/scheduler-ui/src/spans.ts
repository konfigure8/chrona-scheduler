import type { DragResult } from "./interactions";
import { snapDate } from "./timeAxis";
import { clockMinutesBetween } from "./timeZone";
import type { SchedulerUiEvent, ShiftGap } from "./types";

/**
 * A shift is a SHAPE: `start`/`end` are the envelope, and its rostered
 * breaks are gaps inside it (Docs/domain_model.md section 4). A split
 * shift is not a gap: it is two linked shifts (F48 Split shifts).
 *
 * Three measures come off that shape, and each caller states which one
 * it means. This module is the single place they are computed, because
 * "do breaks count?" has three different right answers:
 *   - spanMinutes     envelope, gaps included    (span-of-hours limits)
 *   - workedMinutes   spans plus PAID gaps       (hours, overtime, cost)
 *   - coverageMinutes the whole shift            (ratios, demand)
 * People take short breaks in turn, so a break cuts paid time but
 * leaves no hole in cover. For one shift, coverage and span agree; they
 * part only across a split, whose parts are separate shifts with a hole
 * between them.
 *
 * All three count by the clock on the site's wall: an overnight shift
 * across a daylight saving change keeps its clock length, as Fair Work
 * pays it.
 */

export interface TimeSpan {
  readonly end: Date;
  readonly start: Date;
}

/** Fractional position of a gap within the bar, 0..1 from the envelope start. */
export interface GapFraction {
  readonly endFraction: number;
  readonly gap: ShiftGap;
  readonly startFraction: number;
}

const minutes = (from: Date, to: Date): number =>
  Math.max(0, clockMinutesBetween(from, to));

/**
 * Gaps sorted, clipped to the envelope and stripped of anything
 * degenerate. Hosts map customer data, so tolerate reversed, zero-length
 * and out-of-range rows rather than trusting the feed.
 */
export function normalizeGaps(event: SchedulerUiEvent): readonly ShiftGap[] {
  if (!event.gaps || event.gaps.length === 0) {
    return [];
  }
  const envelopeStart = event.start.getTime();
  const envelopeEnd = event.end.getTime();
  const clipped: ShiftGap[] = [];
  for (const gap of event.gaps) {
    const start = Math.max(envelopeStart, gap.start.getTime());
    const end = Math.min(envelopeEnd, gap.end.getTime());
    if (!(end > start)) {
      continue;
    }
    clipped.push({ ...gap, end: new Date(end), start: new Date(start) });
  }
  return clipped.sort(
    (first, second) => first.start.getTime() - second.start.getTime(),
  );
}

/** The working parts: the envelope minus its gaps. */
export function workSpans(event: SchedulerUiEvent): readonly TimeSpan[] {
  const gaps = normalizeGaps(event);
  if (gaps.length === 0) {
    return [{ end: event.end, start: event.start }];
  }
  const spans: TimeSpan[] = [];
  let cursor = event.start.getTime();
  for (const gap of gaps) {
    if (gap.start.getTime() > cursor) {
      spans.push({ end: new Date(gap.start.getTime()), start: new Date(cursor) });
    }
    cursor = Math.max(cursor, gap.end.getTime());
  }
  if (event.end.getTime() > cursor) {
    spans.push({ end: event.end, start: new Date(cursor) });
  }
  return spans;
}

/** Envelope: first start to last end, gaps included. */
export function spanMinutes(event: SchedulerUiEvent): number {
  return minutes(event.start, event.end);
}

/** Spans plus paid gaps - a paid tea break is time worked. */
export function workedMinutes(event: SchedulerUiEvent): number {
  const worked = workSpans(event).reduce(
    (total, span) => total + minutes(span.start, span.end),
    0,
  );
  const paidGaps = normalizeGaps(event)
    .filter((gap) => gap.paid === true)
    .reduce((total, gap) => total + minutes(gap.start, gap.end), 0);
  return worked + paidGaps;
}

/** The whole shift: a break leaves no hole in cover (people take breaks in turn). */
export function coverageMinutes(event: SchedulerUiEvent): number {
  return minutes(event.start, event.end);
}

/**
 * Gap positions as fractions of the bar, so one helper serves both the
 * horizontal timeline and the vertical day/top-down views - the axis is
 * the caller's business, the proportions are not.
 */
export function gapFractions(event: SchedulerUiEvent): readonly GapFraction[] {
  const totalMs = event.end.getTime() - event.start.getTime();
  if (totalMs <= 0) {
    return [];
  }
  const origin = event.start.getTime();
  return normalizeGaps(event).map((gap) => ({
    endFraction: (gap.end.getTime() - origin) / totalMs,
    gap,
    startFraction: (gap.start.getTime() - origin) / totalMs,
  }));
}

/**
 * Resize keeps gaps where they are: an edge stops one slot of the
 * board's grid short of a gap, so a resize can never swallow a rostered
 * break (Matt, 2026-08-21). A break that touched an end of its shift
 * would be dropped on save (alignGaps). Returns the clamped edge; an
 * edge with no room to move toward the gap stays where it is.
 */
export function clampResizeStart(
  event: SchedulerUiEvent,
  proposedStart: Date,
  snapMinutes = 1,
): Date {
  const first = normalizeGaps(event)[0];
  if (!first) {
    return proposedStart;
  }
  const limit = Math.max(event.start.getTime(), slotBefore(first.start, snapMinutes));
  return proposedStart.getTime() <= limit ? proposedStart : new Date(limit);
}

export function clampResizeEnd(
  event: SchedulerUiEvent,
  proposedEnd: Date,
  snapMinutes = 1,
): Date {
  const gaps = normalizeGaps(event);
  const last = gaps[gaps.length - 1];
  if (!last) {
    return proposedEnd;
  }
  const limit = Math.min(event.end.getTime(), slotAfter(last.end, snapMinutes));
  return proposedEnd.getTime() >= limit ? proposedEnd : new Date(limit);
}

/** The last time on the board's grid before `edge`. */
function slotBefore(edge: Date, snapMinutes: number): number {
  const snapped = snapDate(edge, snapMinutes).getTime();
  return snapped < edge.getTime() ? snapped : snapped - snapMinutes * 60_000;
}

/** The first time on the board's grid after `edge`. */
function slotAfter(edge: Date, snapMinutes: number): number {
  const snapped = snapDate(edge, snapMinutes).getTime();
  return snapped > edge.getTime() ? snapped : snapped + snapMinutes * 60_000;
}

/**
 * Where a shift's gaps go when its start and end change, from any
 * client: the rule the server applies on every save (F48 Split shifts),
 * so a host shows what the row holds after its save.
 *
 * MOVE: the gaps travel with the shift. A shift moved an hour later
 * keeps its lunch an hour later; the break does not stay behind at the
 * old clock time.
 * NEW START OR NEW END: the gaps stay put, because the planner is
 * editing one edge and the break is not moving (Matt, 2026-08-21).
 * BOTH, BY DIFFERENT AMOUNTS: the gaps move with the start.
 * A gap that no longer sits strictly inside the shift is dropped, and
 * the work around it closes up. No change, or no gaps: given back as is.
 */
export function alignGaps(
  gaps: readonly ShiftGap[] | undefined,
  from: TimeSpan,
  to: TimeSpan,
): readonly ShiftGap[] | undefined {
  if (!gaps || gaps.length === 0) {
    return gaps;
  }
  const startMoved = to.start.getTime() - from.start.getTime();
  const endMoved = to.end.getTime() - from.end.getTime();
  const until = to.end.getTime();
  if ((startMoved === 0 && endMoved === 0) || until <= to.start.getTime()) {
    return gaps;
  }
  const shift = startMoved !== 0 && endMoved !== 0 ? startMoved : 0;
  const kept: ShiftGap[] = [];
  let cursor = to.start.getTime();
  const sorted = [...gaps].sort(
    (first, second) => first.start.getTime() - second.start.getTime(),
  );
  for (const gap of sorted) {
    const start = gap.start.getTime() + shift;
    const end = gap.end.getTime() + shift;
    if (start <= cursor || end >= until || end <= start) {
      continue;
    }
    kept.push(
      shift === 0
        ? gap
        : { ...gap, end: new Date(end), start: new Date(start) },
    );
    cursor = end;
  }
  return kept;
}

/**
 * Where the gaps end up after a board change (alignGaps). A resize
 * cannot carry an edge onto a gap: `clampResizeStart`/`clampResizeEnd`
 * stop it a slot short.
 */
export function gapsForChange(
  event: SchedulerUiEvent,
  result: DragResult,
): readonly ShiftGap[] | undefined {
  return alignGaps(event.gaps, event, result);
}
