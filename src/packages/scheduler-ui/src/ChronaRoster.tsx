import * as React from "react";
import { Shifts20Regular } from "@fluentui/react-icons";

import {
  allowVerdict,
  computeCellDropResult,
  type ChangeVerdict,
  type DragResult,
  type ValidateChange,
} from "./interactions";
import { chipCode, chipStartTime } from "./compactChip";
import { dateNamesFrom } from "./dateNames";
import type { RosterExtension, RosterGroup, RosterStatColumn } from "./extension";
import {
  buildRosterDays,
  layoutOpenRow,
  layoutRoster,
  type RosterRowLayout,
} from "./rosterLayout";
import { isDragLocked, showsPin } from "./locks";
import { FlagGlyph } from "./FlagGlyph";
import { flagReasonText } from "./stringResources";
import { PinGlyph } from "./PinGlyph";
import { useSchedulerStrings } from "./strings";
import type { HourFormat } from "./timeAxis";
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

/**
 * The Roster grid's widths, as styles.css sets them
 * (--chrona-roster-day, --chrona-roster-people).
 */
export const rosterDayWidthPx = 66;
export const rosterPeopleWidthPx = 196;

export type { RosterStatColumn } from "./extension";

export interface ChronaRosterProps {
  /** Review: the shifts the proposal leaves alone step back. */
  readonly changesOnly?: boolean;
  readonly editable?: boolean;
  readonly events: readonly SchedulerUiEvent[];
  /** A scenario package's columns, groups and person details. */
  readonly extension?: RosterExtension;
  readonly hourFormat?: HourFormat;
  readonly onEventChange?: (change: TimelineChange) => void;
  readonly onEventClick?: (event: SchedulerUiEvent) => void;
  /**
   * The shifts nobody works, in their own row above the people, in
   * both products (F41). Absent = no row.
   */
  readonly openEvents?: readonly SchedulerUiEvent[];
  /** The host's id for nobody: a drop on the open row takes the person off. */
  readonly openResourceId?: string;
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
    changesOnly = false,
    editable = true,
    events,
    extension,
    hourFormat,
    onEventChange,
    onEventClick,
    openEvents,
    openResourceId,
    resources,
    showWeekends = true,
    statusColorRules,
    today,
    validateChange,
    window,
  } = props;
  const strings = useSchedulerStrings();
  const days = buildRosterDays(window, showWeekends, dateNamesFrom(strings));
  // The review marks each change with a ring and a dot, and Hold to
  // compare shows where it was, so the grid shows no ghosts.
  const shownEvents = events.filter((event) => event.review !== "ghost");
  const rows = layoutRoster(resources, shownEvents, days);
  const openCells = openEvents ? layoutOpenRow(openEvents, days) : undefined;
  const groups = extension?.groups?.({
    days,
    events: shownEvents,
    openEvents: openEvents ?? [],
    resources,
  });
  const stats = extension?.columns;
  const [hover, setHover] = React.useState<CellHover | undefined>();
  const effectiveToday = today ?? new Date();
  const todayDayIndex = days.findIndex((day) =>
    isSameDay(day.start, effectiveToday),
  );

  /*
   * The stats take the room right of the last day, one day wide each:
   * measured on the grid's own box (the control sizes to its
   * container), from the widths the stylesheet sets.
   */
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [statRoom, setStatRoom] = React.useState(0);
  const statCount = stats?.length ?? 0;
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || statCount === 0) {
      return undefined;
    }
    const measure = (): void => {
      const table = root.querySelector(".chrona-sched__roster-table");
      const style = table ? getComputedStyle(table) : undefined;
      const day = parseFloat(style?.getPropertyValue("--chrona-roster-day") ?? "") || rosterDayWidthPx;
      const people =
        parseFloat(style?.getPropertyValue("--chrona-roster-people") ?? "") || rosterPeopleWidthPx;
      setStatRoom(Math.max(0, Math.floor((root.clientWidth - people - days.length * day) / day)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [days.length, statCount]);
  const shownStats = (stats ?? []).slice(0, statRoom);
  const statClass = (index: number): string =>
    index === 0
      ? "chrona-sched__roster-stat chrona-sched__roster-stat--first"
      : "chrona-sched__roster-stat";

  // The open row is nobody: a move there cannot break a person's rule.
  const dropVerdict = (event: SchedulerUiEvent, result: DragResult): ChangeVerdict =>
    result.resourceId === openResourceId
      ? allowVerdict
      : (validateChange?.(event, result) ?? allowVerdict);

  const cellDrag = useCellDrag({
    onDrop: (drag, cell) => {
      const result = computeCellDropResult(
        drag.event,
        cell.dayIndex - drag.originDayIndex,
        cell.resourceId,
      );
      const verdict = dropVerdict(drag.event, result);
      if (verdict.kind === "block") {
        return;
      }
      // Nothing moves: the same day and person, or an open shift back on the open row.
      if (
        result.start.getTime() === drag.event.start.getTime() &&
        (result.resourceId === drag.event.resourceId ||
          (result.resourceId === openResourceId &&
            drag.event.status === "needsCover"))
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
      const verdict = dropVerdict(drag.event, result);
      setHover({ dayIndex: cell.dayIndex, resourceId: cell.resourceId, verdict });
    },
  });

  const renderChip = (event: SchedulerUiEvent, dayIndex: number): JSX.Element => {
    const color = resolveEventColor(event, statusColorRules);
    return (
      <button
        aria-label={`${event.title}, ${formatTimeRange(event)}`}
        data-event-id={event.id}
        className={[
          "chrona-sched__chip",
          "chrona-sched__chip--compact",
          color ? "chrona-sched__chip--colored" : "",
          event.status === "needsCover" ? "chrona-sched__chip--needs-cover" : "",
          event.flag ? "chrona-sched__chip--flagged" : "",
          cellDrag.draggingEventId === event.id ? "chrona-sched__chip--dragging" : "",
          editable ? "chrona-sched__bar--editable" : "",
          event.review === "proposed" ? "chrona-sched__chip--proposed" : "",
          changesOnly && event.review !== "proposed" ? "chrona-sched__chip--dim" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        key={event.id}
        onClick={onEventClick ? () => onEventClick(event) : undefined}
        onPointerDown={
          editable && !isDragLocked(event)
            ? (downEvent) => cellDrag.begin(downEvent, { event, originDayIndex: dayIndex })
            : undefined
        }
        style={{ background: color }}
        type="button"
      >
        {showsPin(event) ? <PinGlyph /> : null}
        {event.flag ? <FlagGlyph title={flagReasonText(strings, event.flag)} /> : null}
        <span className="chrona-sched__chip-code">{chipCode(event)}</span>
        <span className="chrona-sched__chip-time">
          {chipStartTime(event.start, hourFormat)}
        </span>
      </button>
    );
  };

  /*
   * A shift dragged off a person drops into its own group's open row,
   * so only that row lights up under the pointer.
   */
  const draggedEvent = groups
    ? [...events, ...(openEvents ?? [])].find((event) => event.id === cellDrag.draggingEventId)
    : undefined;
  const draggingGroup = draggedEvent ? extension?.groupOf?.(draggedEvent) : undefined;

  const renderOpenRow = (
    cells: readonly (readonly SchedulerUiEvent[])[],
    key: string,
    lightsUp: boolean,
  ): JSX.Element => (
    <tr className="chrona-sched__roster-open" data-testid="roster-open-row" key={key}>
      <td className="chrona-sched__roster-resource">
        <div className="chrona-sched__roster-name chrona-sched__roster-open-name">
          <Shifts20Regular />
          {strings.rosterOpenShifts}
        </div>
      </td>
      {cells.map((cell, dayIndex) => {
        const isHovered =
          lightsUp &&
          hover !== undefined &&
          openResourceId !== undefined &&
          hover.dayIndex === dayIndex &&
          hover.resourceId === openResourceId;
        return (
          <td
            className={
              isHovered
                ? `chrona-sched__cell-drop chrona-sched__cell-drop--${hover.verdict.kind}`
                : undefined
            }
            data-cell-day-index={openResourceId === undefined ? undefined : dayIndex}
            data-cell-resource-id={openResourceId}
            key={days[dayIndex]?.start.getTime() ?? dayIndex}
          >
            {cell.map((event) => renderChip(event, dayIndex))}
          </td>
        );
      })}
      {shownStats.map((stat, index) => (
        <td className={statClass(index)} key={stat.id} />
      ))}
    </tr>
  );

  const renderPersonRow = (row: RosterRowLayout): JSX.Element => {
    const statValues =
      shownStats.length > 0
        ? (extension?.columnValues?.(row.resource, shownStats.map((stat) => stat.id)) ?? {})
        : {};
    return (
      <tr key={row.resource.id}>
        <td className="chrona-sched__roster-resource">
          <div className="chrona-sched__roster-name">
            {row.resource.name}
          </div>
          {extension?.personDetail?.(row.resource)}
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
                  days[dayIndex]?.weekend
                    ? "chrona-sched__roster-cell--weekend"
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
              {cell.map((event) => renderChip(event, dayIndex))}
            </td>
          );
        })}
        {shownStats.map((stat, index) => (
          <td className={statClass(index)} key={stat.id}>
            {statValues[stat.id]}
          </td>
        ))}
      </tr>
    );
  };

  // A group's heading, its open shifts, its people, then its footer.
  const renderGroup = (group: RosterGroup): JSX.Element => {
    const members = new Set(group.resources.map((resource) => resource.id));
    return (
      <React.Fragment key={`group-${group.id}`}>
        <tr className="chrona-sched__roster-group" data-testid="roster-group">
          <td className="chrona-sched__roster-resource">{group.heading}</td>
          <td colSpan={days.length + shownStats.length} />
        </tr>
        {openEvents
          ? renderOpenRow(layoutOpenRow(group.open, days), `open-${group.id}`, draggingGroup === group.id)
          : null}
        {rows.filter((row) => members.has(row.resource.id)).map(renderPersonRow)}
        {group.footer ? (
          <tr className="chrona-sched__roster-need" data-testid="roster-need-row">
            <td className="chrona-sched__roster-resource">
              <div className="chrona-sched__roster-need-label">{group.footer.label}</div>
            </td>
            {group.footer.cells.map((cell, dayIndex) => (
              <td key={days[dayIndex]?.start.getTime() ?? dayIndex}>{cell}</td>
            ))}
            {shownStats.map((stat, index) => (
              <td className={statClass(index)} key={stat.id} />
            ))}
          </tr>
        ) : null}
      </React.Fragment>
    );
  };

  if (resources.length === 0) {
    return (
      <div className="chrona-sched__roster">
        <div className="chrona-sched__empty">{strings.emptyResources}</div>
      </div>
    );
  }

  return (
    <div className="chrona-sched__roster" ref={rootRef}>
      <table
        className="chrona-sched__roster-table"
        // The column count sizes the fixed-layout table (see styles.css).
        style={{ ["--chrona-roster-columns" as string]: days.length + shownStats.length } as React.CSSProperties}
      >
        <thead>
          <tr>
            <th className="chrona-sched__roster-resource">{strings.resourceHeader}</th>
            {days.map((day, dayIndex) => (
              <th
                className={
                  [
                    dayIndex === todayDayIndex
                      ? "chrona-sched__roster-day--today"
                      : "",
                    day.weekend ? "chrona-sched__roster-day--weekend" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                key={day.start.getTime()}
              >
                {/* The space keeps "Mon 17 Aug" as the header's text. */}
                <span className="chrona-sched__roster-dow">{day.weekday}</span>{" "}
                {day.date}
              </th>
            ))}
            {shownStats.map((stat, index) => (
              <th className={statClass(index)} key={stat.id} title={stat.title}>
                {stat.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups ? (
            groups.map(renderGroup)
          ) : (
            <>
              {openCells ? renderOpenRow(openCells, "open", true) : null}
              {rows.map(renderPersonRow)}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
