import { buildLegendEntries, type RowDecoration } from "./decorations";
import { NightGlyph } from "./NightGlyph";
import { ShiftMarkGlyph, useOpenShiftKind, useShiftMarkLegend } from "./ShiftMark";
import { isOpenOnCall, isOpenRequired, openKindOf } from "./solve";
import { useSchedulerStrings } from "./strings";
import type { SchedulerUiEvent } from "./types";

export interface SchedulerLegendProps {
  readonly decorations?: readonly RowDecoration[];
  readonly events: readonly SchedulerUiEvent[];
}

/**
 * Compact legend explaining the shading in view. Swatches reuse the actual
 * decoration styles so the legend can never drift from the rendering.
 */
export function SchedulerLegend(props: SchedulerLegendProps): JSX.Element | null {
  const strings = useSchedulerStrings();
  const kindOf = useOpenShiftKind();
  const entries = buildLegendEntries(
    props.decorations,
    props.events.some((event) => isOpenRequired(event, kindOf)),
    {
      busyElsewhere: strings.legendBusyElsewhere,
      custom: strings.legendCustom,
      holiday: strings.legendHoliday,
      nonWorking: strings.legendNonWorking,
      preferred: strings.legendPreferred,
      unavailable: strings.legendUnavailable,
      unpreferred: strings.legendUnpreferred,
    },
    strings.legendNeedsCover,
  );
  // Night shifts (night rules design): the moon the chips carry.
  const nights = props.events.some((event) => event.night === true);
  // F24 Repair mode: an on-call shift left open, backup cover rather than work that needs it.
  const onCall = props.events.some(isOpenOnCall);
  // An extension's kinds of open shift in view (BoardExtension.openShift), one entry each, in the order first met.
  const kinds = [
    ...new Map(
      props.events.flatMap((event) => {
        const kind = openKindOf(event, kindOf);
        return kind ? [[kind.kind, kind] as const] : [];
      }),
    ).values(),
  ];
  // An extension's marks on the shifts in view (BoardExtension.shiftMark), such as clock marks.
  const marks = useShiftMarkLegend(props.events);
  if (entries.length === 0 && !nights && !onCall && kinds.length === 0 && marks.length === 0) {
    return null;
  }

  return (
    <div aria-label={strings.legendName} className="chrona-sched__legend" role="note">
      {entries.map((entry) => (
        <span className="chrona-sched__legend-item" key={entry.kind}>
          <span
            aria-hidden="true"
            className={
              entry.kind === "needsCover"
                ? "chrona-sched__legend-swatch chrona-sched__bar--needs-cover"
                : `chrona-sched__legend-swatch chrona-sched__decoration--${entry.kind}`
            }
          />
          {entry.label}
        </span>
      ))}
      {onCall ? (
        <span className="chrona-sched__legend-item" key="on-call">
          <span aria-hidden="true" className="chrona-sched__legend-swatch chrona-sched__bar--on-call-open" />
          {strings.legendOnCall}
        </span>
      ) : null}
      {kinds.map((kind) => (
        <span className="chrona-sched__legend-item" key={`kind-${kind.kind}`}>
          <span aria-hidden="true" className={`chrona-sched__legend-swatch chrona-sched__bar--${kind.kind}-open`} />
          {kind.label}
        </span>
      ))}
      {nights ? (
        <span className="chrona-sched__legend-item" key="night">
          <NightGlyph />
          {strings.nightShift}
        </span>
      ) : null}
      {marks.map((mark) => (
        <span className="chrona-sched__legend-item" key={`mark-${mark.label}`}>
          <ShiftMarkGlyph mark={mark} />
          {mark.label}
        </span>
      ))}
    </div>
  );
}
