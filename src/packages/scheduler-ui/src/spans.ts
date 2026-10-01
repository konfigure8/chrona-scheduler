import type { DragResult } from "./interactions";
import type { SchedulerUiEvent, ShiftGap } from "./types";

/**
 * A shift is a SHAPE: `start`/`end` are the envelope, and rostered gaps
 * punch holes in it (Docs/domain_model.md section 4). A break and a
 * split shift are the same thing - a gap - differing only in length.
 *
 * Three measures come off that shape, and each caller states which one
 * it means. This module is the single place they are computed, because
 * "do breaks count?" has three different right answers:
 *   - spanMinutes     envelope, gaps included    (span-of-hours limits)
 *   - workedMinutes   spans plus PAID gaps       (hours, overtime, cost)
 *   - coverageMinutes spans only, paid or not    (ratios, demand)
 * A paid smoko is worked time and is still not covering a ratio, so
 * "paid" and "covering" are independent - which is exactly why this is
 * arithmetic in one module rather than a flag on the event.
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

const minutes = (fromMs: number, toMs: number): number =>
  Math.max(0, (toMs - fromMs) / 60000);

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
  return minutes(event.start.getTime(), event.end.getTime());
}

/** Spans plus paid gaps - a paid tea break is time worked. */
export function workedMinutes(event: SchedulerUiEvent): number {
  const worked = workSpans(event).reduce(
    (total, span) => total + minutes(span.start.getTime(), span.end.getTime()),
    0,
  );
  const paidGaps = normalizeGaps(event)
    .filter((gap) => gap.paid === true)
    .reduce(
      (total, gap) => total + minutes(gap.start.getTime(), gap.end.getTime()),
      0,
    );
  return worked + paidGaps;
}

/** Spans only. Paid or not, nobody covers a ratio while on a break. */
export function coverageMinutes(event: SchedulerUiEvent): number {
  return workSpans(event).reduce(
    (total, span) => total + minutes(span.start.getTime(), span.end.getTime()),
    0,
  );
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
 * Resize keeps gaps where they are: the envelope may shrink up to a gap
 * boundary and no further, so a resize can never swallow a rostered
 * break or close a split (Matt, 2026-08-21). Returns the clamped edge.
 */
export function clampResizeStart(
  event: SchedulerUiEvent,
  proposedStart: Date,
): Date {
  const gaps = normalizeGaps(event);
  const first = gaps[0];
  if (!first || proposedStart.getTime() <= first.start.getTime()) {
    return proposedStart;
  }
  return new Date(first.start.getTime());
}

export function clampResizeEnd(
  event: SchedulerUiEvent,
  proposedEnd: Date,
): Date {
  const gaps = normalizeGaps(event);
  const last = gaps[gaps.length - 1];
  if (!last || proposedEnd.getTime() >= last.end.getTime()) {
    return proposedEnd;
  }
  return new Date(last.end.getTime());
}

/**
 * Where the gaps end up after a change - the rule hosts would otherwise
 * each have to remember, and get wrong.
 *
 * MOVE (duration unchanged): the gaps travel with the shift. A chef's
 * split moved an hour later is still 9-2 / 5-10 shifted by an hour; the
 * break does not stay behind at the old clock time.
 * RESIZE (duration changed): the gaps stay put, because resize is
 * editing one edge and the break is not moving (Matt, 2026-08-21).
 * `clampResizeStart`/`clampResizeEnd` already stop an edge from
 * swallowing a gap, so nothing is orphaned.
 */
export function gapsForChange(
  event: SchedulerUiEvent,
  result: DragResult,
): readonly ShiftGap[] | undefined {
  if (!event.gaps || event.gaps.length === 0) {
    return event.gaps;
  }
  const oldDuration = event.end.getTime() - event.start.getTime();
  const newDuration = result.end.getTime() - result.start.getTime();
  if (oldDuration !== newDuration) {
    return event.gaps;
  }
  const deltaMs = result.start.getTime() - event.start.getTime();
  if (deltaMs === 0) {
    return event.gaps;
  }
  return event.gaps.map((gap) => ({
    ...gap,
    end: new Date(gap.end.getTime() + deltaMs),
    start: new Date(gap.start.getTime() + deltaMs),
  }));
}
