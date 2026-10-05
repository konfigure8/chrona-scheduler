import { buildLegendEntries, type RowDecoration } from "./decorations";
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
    props.events.some((event) => event.status === "needsCover"),
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
  if (entries.length === 0) {
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
    </div>
  );
}
