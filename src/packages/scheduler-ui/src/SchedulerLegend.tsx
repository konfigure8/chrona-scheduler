import { buildLegendEntries, type RowDecoration } from "./decorations";
import { NightGlyph } from "./NightGlyph";
import { isOpenOnCall, isOpenRequired } from "./solve";
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
  const entries = buildLegendEntries(
    props.decorations,
    props.events.some(isOpenRequired),
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
  if (entries.length === 0 && !nights && !onCall) {
    return null;
  }

  return (
    <div aria-label="Legend" className="chrona-sched__legend" role="note">
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
      {nights ? (
        <span className="chrona-sched__legend-item" key="night">
          <NightGlyph />
          {strings.nightShift}
        </span>
      ) : null}
    </div>
  );
}
