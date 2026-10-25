import * as React from "react";

import { useBoardHourFormat } from "./boardLocale";
import { formatClock } from "./clock";
import { dateNamesFrom, formatDayLabel } from "./dateNames";
import { useBoardExtension, type ShiftMark } from "./extension";
import type { OpenShiftKindOf } from "./solve";
import { formatString, useSchedulerStrings } from "./strings";
import type { SchedulerUiEvent } from "./types";

/** The extension's read-only mark on a shift (BoardExtension.shiftMark), if any. */
export function useShiftMarks(): (event: SchedulerUiEvent) => ShiftMark | undefined {
  const shiftMark = useBoardExtension()?.shiftMark;
  return React.useCallback((event: SchedulerUiEvent) => (event.review === undefined ? shiftMark?.(event) : undefined), [shiftMark]);
}

/** The extension's kinds of shift (BoardExtension.openShift), if any. */
export function useOpenShiftKind(): OpenShiftKindOf | undefined {
  return useBoardExtension()?.openShift;
}

const markClass = (mark: ShiftMark): string =>
  mark.tone === "attention" ? "chrona-sched__shift-mark chrona-sched__shift-mark--attention" : "chrona-sched__shift-mark";

/** The mark's glyph after a shift's title; its tooltip is the mark's words. */
export function ShiftMarkGlyph({ mark }: { readonly mark: ShiftMark | undefined }): JSX.Element | null {
  return mark && !mark.quiet ? (
    <span aria-hidden="true" className={markClass(mark)} title={mark.label}>
      {mark.glyph}
    </span>
  ) : null;
}

/** The mark in a shift's hover card or dialog: its glyph and words, then its times. */
export function ShiftMarkNote({ className, mark }: { readonly className?: string; readonly mark: ShiftMark }): JSX.Element {
  const hourFormat = useBoardHourFormat();
  const dateNames = dateNamesFrom(useSchedulerStrings());
  const [first, ...rest] = (mark.times ?? []).map((time) =>
    formatString(time.label, { date: formatDayLabel(time.at, dateNames), time: formatClock(time.at, hourFormat) }),
  );
  return (
    <p className={className ? `chrona-sched__shift-mark-note ${className}` : "chrona-sched__shift-mark-note"}>
      {mark.glyph ? (
        <span aria-hidden="true" className={markClass(mark)}>
          {mark.glyph}
        </span>
      ) : null}
      <span>{[first ? `${mark.label} ${first}` : mark.label, ...rest].join(" · ")}</span>
    </p>
  );
}

/** The legend's entries for the marks on the shifts in view: one per kind of mark, in the order first met. */
export function useShiftMarkLegend(events: readonly SchedulerUiEvent[]): readonly ShiftMark[] {
  const markOf = useShiftMarks();
  const seen = new Map<string, ShiftMark>();
  for (const event of events) {
    const mark = markOf(event);
    if (mark && !mark.quiet && !seen.has(mark.label)) {
      seen.set(mark.label, mark);
    }
  }
  return [...seen.values()];
}
