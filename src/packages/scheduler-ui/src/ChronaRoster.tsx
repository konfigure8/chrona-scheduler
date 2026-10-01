import * as React from "react";

import {
  allowVerdict,
  computeCellDropResult,
  type ChangeVerdict,
  type ValidateChange,
} from "./interactions";
import { dateNamesFrom } from "./dateNames";
import { buildRosterDays, layoutRoster } from "./rosterLayout";
import { isDragLocked, isLocked } from "./locks";
import { FlagGlyph } from "./FlagGlyph";
import { flagReasonText } from "./stringResources";
import { PinGlyph } from "./PinGlyph";
import { useSchedulerStrings } from "./strings";
import {
  isSameDay,
  resolveEventColor,
  type StatusColorRule,
} from "./viewConfig";
import type { TimelineChange } from "./ChronaTimeline";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  TimeWindow,
} from "./types";

export interface ChronaRosterProps {
  readonly editable?: boolean;
  readonly events: readonly SchedulerUiEvent[];
  readonly onEventChange?: (change: TimelineChange) => void;
  readonly onEventClick?: (event: SchedulerUiEvent) => void;
  readonly resources: readonly SchedulerResource[];
  readonly showWeekends?: boolean;
  readonly statusColorRules?: readonly StatusColorRule[];
  readonly today?: Date;
  readonly validateChange?: ValidateChange;
  readonly window: TimeWindow;
}

interface CellDragState {
  readonly event: SchedulerUiEvent;
  readonly originDayIndex: number;
}

interface CellHover {
  readonly dayIndex: number;
  readonly resourceId: string;
  readonly verdict: ChangeVerdict;
}

function formatTimeRange(event: SchedulerUiEvent): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(event.start.getHours())}:${pad(event.start.getMinutes())}-${pad(event.end.getHours())}:${pad(event.end.getMinutes())}`;
}

/**
 * Shared cell-drag hook for grid views (roster, month). Listeners attach
 * synchronously on pointer-down, so same-frame releases cannot strand a
 * drag; cells are targeted with elementFromPoint via data attributes.
 */
export function useCellDrag(input: {
  readonly onDrop: (
    drag: CellDragState,
    cell: { dayIndex: number; resourceId: string },
  ) => void;
  readonly onHover: (
    drag: CellDragState,
    cell: { dayIndex: number; resourceId: string } | undefined,
  ) => void;
}): {
  readonly begin: (
    downEvent: React.PointerEvent<HTMLElement>,
    state: CellDragState,
  ) => void;
  readonly draggingEventId: string | undefined;
} {
  const { onDrop, onHover } = input;
  const [draggingEventId, setDraggingEventId] = React.useState<
    string | undefined
  >();
  const movedRef = React.useRef(false);

  const begin = React.useCallback(
    (
      downEvent: React.PointerEvent<HTMLElement>,
      state: CellDragState,
    ): void => {
      if (downEvent.button !== 0) {
        return;
      }
      downEvent.preventDefault();
      const startX = downEvent.clientX;
      const startY = downEvent.clientY;
      movedRef.current = false;
      setDraggingEventId(state.event.id);

      const cellAt = (
        clientX: number,
        clientY: number,
      ): { dayIndex: number; resourceId: string } | undefined => {
        const cell = document
          .elementFromPoint(clientX, clientY)
          ?.closest<HTMLElement>("[data-cell-day-index]");
        if (!cell) {
          return undefined;
        }
        const dayIndex = Number(cell.dataset["cellDayIndex"]);
        const resourceId = cell.dataset["cellResourceId"];
        if (!Number.isFinite(dayIndex) || !resourceId) {
          return undefined;
        }
        return { dayIndex, resourceId };
      };

      const handleMove = (moveEvent: PointerEvent): void => {
        movedRef.current =
          movedRef.current ||
          Math.abs(moveEvent.clientX - startX) > 3 ||
          Math.abs(moveEvent.clientY - startY) > 3;
        onHover(state, cellAt(moveEvent.clientX, moveEvent.clientY));
      };

      const cleanup = (): void => {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
        document.removeEventListener("keydown", handleKey);
        setDraggingEventId(undefined);
        onHover(state, undefined);
      };

      const handleUp = (upEvent: PointerEvent): void => {
        const cell = cellAt(upEvent.clientX, upEvent.clientY);
        const moved = movedRef.current;
        cleanup();
        if (moved && cell) {
          onDrop(state, cell);
        }
      };

      const handleKey = (keyEvent: KeyboardEvent): void => {
        if (keyEvent.key === "Escape") {
          cleanup();
        }
      };

      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
      document.addEventListener("keydown", handleKey);
    },
    [onDrop, onHover],
  );

  return { begin, draggingEventId };
}

export function ChronaRoster(props: ChronaRosterProps): JSX.Element {
  const {
    editable = true,
    events,
    onEventChange,
    onEventClick,
    resources,
    showWeekends = true,
    statusColorRules,
    today,
    validateChange,
    window,
  } = props;
  const strings = useSchedulerStrings();
  const days = buildRosterDays(window, showWeekends, dateNamesFrom(strings));
  const rows = layoutRoster(resources, events, days);
  const [hover, setHover] = React.useState<CellHover | undefined>();
  const effectiveToday = today ?? new Date();
  const todayDayIndex = days.findIndex((day) =>
    isSameDay(day.start, effectiveToday),
  );

  const cellDrag = useCellDrag({
    onDrop: (drag, cell) => {
      const result = computeCellDropResult(
        drag.event,
        cell.dayIndex - drag.originDayIndex,
        cell.resourceId,
      );
      const verdict = validateChange?.(drag.event, result) ?? allowVerdict;
      if (verdict.kind === "block") {
        return;
      }
      if (
        result.resourceId === drag.event.resourceId &&
        result.start.getTime() === drag.event.start.getTime()
      ) {
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
        cell.resourceId,
      );
      const verdict = validateChange?.(drag.event, result) ?? allowVerdict;
      setHover({ dayIndex: cell.dayIndex, resourceId: cell.resourceId, verdict });
    },
  });

  if (resources.length === 0) {
    return (
      <div className="chrona-sched__roster">
        <div className="chrona-sched__empty">{strings.emptyResources}</div>
      </div>
    );
  }

  return (
    <div className="chrona-sched__roster">
      <table className="chrona-sched__roster-table">
        <thead>
          <tr>
            <th className="chrona-sched__roster-resource">{strings.resourceHeader}</th>
            {days.map((day, dayIndex) => (
              <th
                className={
                  dayIndex === todayDayIndex
                    ? "chrona-sched__roster-day--today"
                    : undefined
                }
                key={day.start.getTime()}
              >
                {day.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.resource.id}>
              <td className="chrona-sched__roster-resource">
                {row.resource.name}
              </td>
              {row.cells.map((cell, dayIndex) => {
                const isHovered =
                  hover &&
                  hover.dayIndex === dayIndex &&
                  hover.resourceId === row.resource.id;
                return (
                  <td
                    className={
                      [
                        isHovered
                          ? `chrona-sched__cell-drop chrona-sched__cell-drop--${hover.verdict.kind}`
                          : "",
                        dayIndex === todayDayIndex
                          ? "chrona-sched__roster-cell--today"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    data-cell-day-index={dayIndex}
                    data-cell-resource-id={row.resource.id}
                    key={days[dayIndex]?.start.getTime() ?? dayIndex}
                    title={isHovered ? hover.verdict.reason : undefined}
                  >
                    {cell.map((event) => (
                      <button
                        aria-label={`${event.title}, ${formatTimeRange(event)}`}
                        data-event-id={event.id}
                        disabled={event.review === "ghost"}
                        className={[
                          "chrona-sched__chip",
                          event.status === "needsCover"
                            ? "chrona-sched__chip--needs-cover"
                            : "",
                          event.flag ? "chrona-sched__chip--flagged" : "",
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
                                  originDayIndex: dayIndex,
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
                        {event.flag ? (
                          <FlagGlyph
                            title={flagReasonText(strings, event.flag)}
                          />
                        ) : null}
                        <span>{event.title}</span>{" "}
                        <span className="chrona-sched__chip-time">
                          {formatTimeRange(event)}
                        </span>
                      </button>
                    ))}
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
