import * as React from "react";

import { useCellDrag } from "./ChronaRoster";
import { isDragLocked, isLocked } from "./locks";
import { PinGlyph } from "./PinGlyph";
import { formatString, useSchedulerStrings } from "./strings";
import {
  allowVerdict,
  computeCellDropResult,
  type ChangeVerdict,
  type ValidateChange,
} from "./interactions";
import { dateNamesFrom, weekdayShort } from "./dateNames";
import { buildMonthMatrix, eventsForDay } from "./monthLayout";
import {
  isSameDay,
  resolveEventColor,
  type StatusColorRule,
} from "./viewConfig";
import type { TimelineChange } from "./ChronaTimeline";
import type { SchedulerUiEvent } from "./types";

export interface MonthViewProps {
  readonly anchor: Date;
  readonly editable?: boolean;
  readonly events: readonly SchedulerUiEvent[];
  readonly maxChipsPerDay?: number;
  readonly onEventChange?: (change: TimelineChange) => void;
  readonly onEventClick?: (event: SchedulerUiEvent) => void;
  readonly showWeekends?: boolean;
  readonly statusColorRules?: readonly StatusColorRule[];
  readonly today?: Date;
  readonly validateChange?: ValidateChange;
}

function formatStart(event: SchedulerUiEvent): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(event.start.getHours())}:${pad(event.start.getMinutes())}`;
}

function dayNumber(date: Date): number {
  const midnight = new Date(date.getTime());
  midnight.setHours(0, 0, 0, 0);
  return Math.round(midnight.getTime() / 86_400_000);
}

export function MonthView(props: MonthViewProps): JSX.Element {
  const {
    anchor,
    editable = true,
    events,
    maxChipsPerDay = 3,
    onEventChange,
    onEventClick,
    showWeekends = true,
    statusColorRules,
    today,
    validateChange,
  } = props;
  const strings = useSchedulerStrings();
  const weeks = React.useMemo(
    () => buildMonthMatrix(anchor, showWeekends),
    [anchor, showWeekends],
  );
  const headers = weeks[0] ?? [];
  const effectiveToday = today ?? new Date();
  const [hover, setHover] = React.useState<
    { readonly dayIndex: number; readonly verdict: ChangeVerdict } | undefined
  >();

  /*
   * Month cells have no resource axis; the drop keeps the event's resource
   * and the cell's day index is the absolute day number of its date.
   */
  const cellDrag = useCellDrag({
    onDrop: (drag, cell) => {
      const result = computeCellDropResult(
        drag.event,
        cell.dayIndex - drag.originDayIndex,
      );
      const verdict = validateChange?.(drag.event, result) ?? allowVerdict;
      if (verdict.kind === "block") {
        return;
      }
      if (result.start.getTime() === drag.event.start.getTime()) {
        return;
      }
      onEventChange?.({ event: drag.event, result, verdict });
    },
    onHover: (drag, cell) => {
      if (!cell) {
        setHover(undefined);
        return;
      }
      const result = computeCellDropResult(
        drag.event,
        cell.dayIndex - drag.originDayIndex,
      );
      const verdict = validateChange?.(drag.event, result) ?? allowVerdict;
      setHover({ dayIndex: cell.dayIndex, verdict });
    },
  });

  return (
    <div className="chrona-sched__month">
      <table className="chrona-sched__month-table">
        <thead>
          <tr>
            {headers.map((cell) => (
              <th key={cell.date.getTime()}>
                {weekdayShort(cell.date, dateNamesFrom(strings))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((cell) => {
                const dayEvents = eventsForDay(events, cell.date);
                const overflow = dayEvents.length - maxChipsPerDay;
                const cellDayNumber = dayNumber(cell.date);
                const isHovered = hover && hover.dayIndex === cellDayNumber;
                const isToday = isSameDay(cell.date, effectiveToday);
                return (
                  <td
                    className={[
                      "chrona-sched__month-cell",
                      cell.inMonth ? "" : "chrona-sched__month-cell--outside",
                      isToday ? "chrona-sched__month-cell--today" : "",
                      isHovered
                        ? `chrona-sched__cell-drop chrona-sched__cell-drop--${hover.verdict.kind}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-cell-day-index={cellDayNumber}
                    data-cell-resource-id="-"
                    key={cell.date.getTime()}
                    title={isHovered ? hover.verdict.reason : undefined}
                  >
                    <div
                      className={
                        isToday
                          ? "chrona-sched__month-day chrona-sched__month-day--today"
                          : "chrona-sched__month-day"
                      }
                    >
                      {cell.dayOfMonth}
                    </div>
                    {dayEvents.slice(0, maxChipsPerDay).map((event) => (
                      <button
                        aria-label={`${event.title}, ${formatStart(event)}`}
                        data-event-id={event.id}
                        disabled={event.review === "ghost"}
                        className={[
                          "chrona-sched__chip",
                          event.status === "needsCover"
                            ? "chrona-sched__chip--needs-cover"
                            : "",
                          cellDrag.draggingEventId === event.id
                            ? "chrona-sched__chip--dragging"
                            : "",
                          editable ? "chrona-sched__bar--editable" : "",
                          event.review === "proposed"
                            ? "chrona-sched__chip--proposed"
                            : "",
                          event.review === "ghost"
                            ? "chrona-sched__chip--ghost"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={event.id}
                        onClick={
                          onEventClick ? () => onEventClick(event) : undefined
                        }
                        onPointerDown={
                          editable && !isDragLocked(event)
                            ? (downEvent) =>
                                cellDrag.begin(downEvent, {
                                  event,
                                  originDayIndex: dayNumber(event.start),
                                })
                            : undefined
                        }
                        style={{
                          background:
                            event.review === "ghost"
                              ? undefined
                              : resolveEventColor(event, statusColorRules),
                        }}
                        type="button"
                      >
                        {isLocked(event) ? <PinGlyph /> : null}
                        <span className="chrona-sched__chip-time">
                          {formatStart(event)}
                        </span>{" "}
                        {event.title}
                      </button>
                    ))}
                    {overflow > 0 ? (
                      <div className="chrona-sched__month-more">
                        {formatString(strings.monthMore, { count: overflow })}
                      </div>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
