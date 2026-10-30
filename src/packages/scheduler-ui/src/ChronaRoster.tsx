import * as React from "react";
import { Shifts20Regular } from "@fluentui/react-icons";

import {
  allowVerdict,
  computeCellDropResult,
  type ChangeVerdict,
  type DragResult,
  type ValidateChange,
} from "./interactions";
import { formatClockRange } from "./clock";
import { chipCode, chipStartTime } from "./compactChip";
import { dateNamesFrom } from "./dateNames";
import {
  useBoardExtension,
  type RosterExtension,
  type RosterGroup,
  type RosterStatColumn,
} from "./extension";
import {
  buildRosterDays,
  layoutOpenRow,
  layoutRoster,
  rosterGroupRows,
  rosterMarkPlacement,
  type RosterRowLayout,
} from "./rosterLayout";
import { isDragLocked, showsPin } from "./locks";
import { FlagGlyph } from "./FlagGlyph";
import { flagReasonText } from "./stringResources";
import { NightGlyph } from "./NightGlyph";
import { ShiftMarkGlyph, useOpenShiftKind, useShiftMarks } from "./ShiftMark";
import { PinGlyph } from "./PinGlyph";
import { openShiftClass } from "./solve";
import { useSchedulerStrings } from "./strings";
import type { HourFormat } from "./timeAxis";
import {
  isSameDay,
  resolveEventColor,
  type StatusColorRule,
} from "./viewConfig";
import { readableTextOn } from "./theme";
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
  /** Under the empty grid's message: what to do about it (an extension's action). */
  readonly emptyAction?: React.ReactNode;
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
  /** People the dragged shift does not fit on the hovered day: their cells hatch, as the Timeline's rows do. */
  readonly misfits: ReadonlySet<string>;
  readonly resourceId: string;
  readonly verdict: ChangeVerdict;
}

function formatTimeRange(event: SchedulerUiEvent, hourFormat: HourFormat | undefined): string {
  return formatClockRange(event.start, event.end, hourFormat);
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
  // A mark after a person's name, such as a scenario's glyph with its reason.
  const personMark = useBoardExtension()?.personMark;
  const fit = useBoardExtension()?.fit;
  const shiftMarkOf = useShiftMarks();
  const kindOf = useOpenShiftKind();
  const chipStyle = props.extension?.chip;
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
   * Every picked stat shows after the last day. When the period is
   * wider than the board, the stats stay at its right edge and the days
   * scroll under them: each cell is pinned by the stats to its right
   * (see styles.css). A stat column is a day wide, or wider when its
   * header would not fit in two lines, as a word does not wrap
   * ("Überstunden", "Max. dagen op rij"), or its total would not: a
   * total is the widest
   * figure in its column, as a sum is at least any of its parts
   * ("145.030 AU$"). Both are measured in their own fonts once they
   * render, and again when they change.
   */
  const shownStats = stats ?? [];
  const headRef = React.useRef<HTMLTableRowElement | null>(null);
  const footRef = React.useRef<HTMLTableRowElement | null>(null);
  const [statWidths, setStatWidths] = React.useState<readonly number[]>([]);
  React.useLayoutEffect(() => {
    const heads = headRef.current?.querySelectorAll<HTMLElement>("th.chrona-sched__roster-stat");
    const feet = footRef.current?.querySelectorAll<HTMLElement>("td.chrona-sched__roster-stat");
    const context =
      typeof document === "undefined" ? null : document.createElement("canvas").getContext?.("2d") ?? null;
    const fits = (cell: HTMLElement | undefined, header: boolean): number => {
      if (!cell || !context) {
        return 0;
      }
      const style = getComputedStyle(cell);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const text = (cell.textContent ?? "").trim();
      const width = (part: string): number => context.measureText(part).width;
      const words = text.split(/\s+/);
      const widest = header
        ? Math.max(
            // A header word gets 4 px more each side, so it does not touch the lines.
            Math.max(0, ...words.map(width)) + 8,
            // Two lines at most: the narrowest break of the words into a first and a second line.
            words.length > 1
              ? Math.min(...words.slice(1).map((_word, index) =>
                  Math.max(width(words.slice(0, index + 1).join(" ")), width(words.slice(index + 1).join(" ")))))
              : 0,
          )
        : width(text);
      const room =
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.borderRightWidth);
      return Math.ceil(widest + room + 2);
    };
    const widths = [...(heads ?? [])].map((head, index): number =>
      Math.max(rosterDayWidthPx, fits(head, true), fits(feet?.[index], false)),
    );
    setStatWidths((previous) =>
      previous.length === widths.length && previous.every((width, index) => width === widths[index]) ? previous : widths,
    );
  });
  const statWidth = (index: number): number => statWidths[index] ?? rosterDayWidthPx;
  const statsWidth = shownStats.reduce((sum, _stat, index) => sum + statWidth(index), 0);
  const statCell = (index: number): { className: string; style: React.CSSProperties } => {
    let right = 0;
    for (let after = index + 1; after < shownStats.length; after += 1) {
      right += statWidth(after);
    }
    return {
      className: [
        "chrona-sched__roster-stat",
        index === 0 ? "chrona-sched__roster-stat--first" : "",
        shownStats[index]?.align === "end" ? "chrona-sched__roster-stat--end" : "",
      ]
        .filter(Boolean)
        .join(" "),
      style: {
        ["--chrona-roster-stat-right" as string]: `${right}px`,
        ["--chrona-roster-stat-width" as string]: `${statWidth(index)}px`,
      } as React.CSSProperties,
    };
  };
  const totals = extension?.totals;
  const totalValues = totals ? totals.values(shownStats.map((stat) => stat.id)) : {};

  // While days lie under the stats, the board marks it, and the divider casts a shadow.
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const markDaysUnder = React.useCallback((): void => {
    const root = rootRef.current;
    const firstStat = root?.querySelector("thead .chrona-sched__roster-stat--first");
    const lastDay = firstStat?.previousElementSibling;
    root?.classList.toggle(
      "chrona-sched__roster--days-under",
      Boolean(
        firstStat &&
          lastDay &&
          firstStat.getBoundingClientRect().left < lastDay.getBoundingClientRect().right - 1,
      ),
    );
  }, []);
  React.useLayoutEffect(() => {
    markDaysUnder();
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(markDaysUnder);
    observer.observe(root);
    return () => observer.disconnect();
  }, [days.length, markDaysUnder, shownStats.length]);

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
      // Who the shift does not fit on that day, judged as the Timeline judges its rows.
      const misfits = new Set(
        fit
          ? resources
              .filter((resource) => {
                const moved = computeCellDropResult(drag.event, cell.dayIndex - drag.originDayIndex, resource.id);
                return fit.missing(resource, { ...drag.event, end: moved.end, resourceId: resource.id, start: moved.start }).length > 0;
              })
              .map((resource) => resource.id)
          : [],
      );
      setHover({ dayIndex: cell.dayIndex, misfits, resourceId: cell.resourceId, verdict });
    },
  });

  const renderChip = (event: SchedulerUiEvent, dayIndex: number): JSX.Element => {
    const color = resolveEventColor(event, statusColorRules);
    // Text that reads on the maker's colour in any theme.
    const ink = readableTextOn(color);
    const shiftMark = shiftMarkOf(event);
    const chipMarks = (
      <>
        {showsPin(event) ? <PinGlyph /> : null}
        {event.flag ? <FlagGlyph title={flagReasonText(strings, event.flag)} /> : null}
        <span className="chrona-sched__chip-code">{chipCode(event)}</span>
        {event.night ? <NightGlyph size={10} title={strings.nightShift} /> : null}
        <ShiftMarkGlyph mark={shiftMark} />
      </>
    );
    return (
      <button
        aria-label={`${event.title}, ${formatTimeRange(event, hourFormat)}${event.night ? `, ${strings.nightShift}` : ""}${shiftMark ? `, ${shiftMark.label}` : ""}`}
        data-event-id={event.id}
        className={[
          "chrona-sched__chip",
          "chrona-sched__chip--compact",
          chipStyle?.className ?? "",
          color ? "chrona-sched__chip--colored" : "",
          openShiftClass(event, "chip", kindOf),
          event.flag ? "chrona-sched__chip--flagged" : "",
          cellDrag.draggingEventId === event.id ? "chrona-sched__chip--dragging" : "",
          editable ? "chrona-sched__bar--editable" : "",
          event.review === "proposed" ? "chrona-sched__chip--proposed" : "",
          // A pin and a moon: tighter spacing keeps the start hour whole in a day column.
          event.night && showsPin(event) ? "chrona-sched__chip--dense" : "",
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
        data-on-color={ink ? "" : undefined}
        style={{ background: color, color: ink }}
        type="button"
      >
        {chipStyle ? (
          // An extension's chip: the code and its marks in a line of their own.
          <span className="chrona-sched__chip-line">{chipMarks}</span>
        ) : (
          chipMarks
        )}
        <span className="chrona-sched__chip-time">
          {chipStyle ? chipStyle.time(event.start, hourFormat) : chipStartTime(event.start, hourFormat)}
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
    <tr
      className={
        // A day stacking more than three chips keeps the row's label at the top, by the first of them.
        cells.some((cell) => cell.length > 3)
          ? "chrona-sched__roster-open chrona-sched__roster-open--tall"
          : "chrona-sched__roster-open"
      }
      data-testid="roster-open-row"
      key={key}
    >
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
        <td {...statCell(index)} key={stat.id} />
      ))}
    </tr>
  );

  // The name, then the extension's mark; a long name gives way, never the mark.
  const renderName = (resource: SchedulerResource): JSX.Element => {
    const mark = personMark?.(resource, { resources, window });
    return mark === undefined || mark === null || mark === false ? (
      <div className="chrona-sched__roster-name">{resource.name}</div>
    ) : (
      <div className="chrona-sched__roster-name chrona-sched__roster-name--marked">
        <span className="chrona-sched__roster-name-text">{resource.name}</span>
        {mark}
      </div>
    );
  };

  const renderPersonRow = (row: RosterRowLayout): JSX.Element => {
    const statValues =
      shownStats.length > 0
        ? (extension?.columnValues?.(row.resource, shownStats.map((stat) => stat.id)) ?? {})
        : {};
    return (
      <tr key={row.resource.id}>
        <td className="chrona-sched__roster-resource" data-resource-id={row.resource.id}>
          {renderName(row.resource)}
          {extension?.personDetail?.(row.resource)}
        </td>
        {row.cells.map((cell, dayIndex) => {
          // The extension's marks: the person's day across the cell, behind the shifts.
          const day = days[dayIndex];
          const marks = (day ? (extension?.dayMarks?.(row.resource, day) ?? []) : []).flatMap((mark) => {
            const placement = rosterMarkPlacement(mark);
            return placement ? [{ ...mark, placement }] : [];
          });
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
                  hover && hover.dayIndex === dayIndex && hover.misfits.has(row.resource.id)
                    ? "chrona-sched__roster-cell--mismatch"
                    : "",
                  dayIndex === todayDayIndex
                    ? "chrona-sched__roster-cell--today"
                    : "",
                  days[dayIndex]?.weekend
                    ? "chrona-sched__roster-cell--weekend"
                    : "",
                  marks.length > 0 ? "chrona-sched__roster-cell--marked" : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              data-cell-day-index={dayIndex}
              data-cell-resource-id={row.resource.id}
              key={days[dayIndex]?.start.getTime() ?? dayIndex}
              title={isHovered ? hover.verdict.reason : undefined}
            >
              {marks.map((mark, index) => (
                <span
                  aria-hidden="true"
                  className={`chrona-sched__decoration chrona-sched__decoration--${mark.kind} chrona-sched__roster-mark${mark.from <= 0 && mark.to >= 1 ? "" : " chrona-sched__roster-mark--part"}`}
                  data-roster-mark={mark.kind}
                  key={`mark-${index}`}
                  style={mark.placement}
                  title={mark.label}
                />
              ))}
              {marks.length > 0 ? <span className="chrona-sched__sr-only">{marks.map((mark) => mark.label).join(", ")}</span> : null}
              {cell.length === 0 && marks.some((mark) => mark.caption) ? (
                <span aria-hidden="true" className="chrona-sched__roster-mark-caption">
                  {marks.find((mark) => mark.caption)?.caption}
                </span>
              ) : null}
              {cell.map((event) => renderChip(event, dayIndex))}
            </td>
          );
        })}
        {shownStats.map((stat, index) => (
          <td {...statCell(index)} key={stat.id}>
            {statValues[stat.id]}
          </td>
        ))}
      </tr>
    );
  };

  // A group's heading, its open shifts, its people, then its footer.
  const renderGroup = (group: RosterGroup): JSX.Element => {
    const members = new Set(group.resources.map((resource) => resource.id));
    const shows = rosterGroupRows(group, openEvents !== undefined);
    return (
      <React.Fragment key={`group-${group.id}`}>
        <tr
          className={group.collapsed ? "chrona-sched__roster-group chrona-sched__roster-group--collapsed" : "chrona-sched__roster-group"}
          data-group-id={group.id}
          data-level={group.level ?? 1}
          data-testid="roster-group"
        >
          <td className="chrona-sched__roster-resource">{group.header ? group.header.resource : group.heading}</td>
          <td colSpan={days.length + shownStats.length}>{group.header?.days}</td>
        </tr>
        {shows.open && openEvents
          ? renderOpenRow(layoutOpenRow(group.open, days), `open-${group.id}`, draggingGroup === group.id)
          : null}
        {shows.people ? rows.filter((row) => members.has(row.resource.id)).map(renderPersonRow) : null}
        {group.footer ? (
          <tr className="chrona-sched__roster-need" data-testid="roster-need-row">
            <td className="chrona-sched__roster-resource">
              <div className="chrona-sched__roster-need-label">{group.footer.label}</div>
            </td>
            {group.footer.cells.map((cell, dayIndex) => (
              <td key={days[dayIndex]?.start.getTime() ?? dayIndex}>{cell}</td>
            ))}
            {shownStats.map((stat, index) => (
              <td {...statCell(index)} key={stat.id} />
            ))}
          </tr>
        ) : null}
      </React.Fragment>
    );
  };

  // Open shifts on the grid's days fill the open row, so a grid with no people is empty only without them.
  if (resources.length === 0 && !(openCells ?? []).some((cell) => cell.length > 0)) {
    return (
      <div className="chrona-sched__roster">
        <div className="chrona-sched__empty">
          <span>{strings.emptyResources}</span>
          {props.emptyAction}
        </div>
      </div>
    );
  }

  return (
    <div
      className="chrona-sched__roster"
      onScroll={shownStats.length > 0 ? markDaysUnder : undefined}
      ref={rootRef}
      // The stats' width and the totals row, so a focused chip scrolls clear of them (see styles.css).
      style={
        {
          ["--chrona-roster-foot" as string]: totals ? "37px" : "0px",
          ["--chrona-roster-stats-width" as string]: `${statsWidth}px`,
        } as React.CSSProperties
      }
    >
      <table
        className="chrona-sched__roster-table"
        // The day count and the stats' width size the fixed-layout table (see styles.css).
        style={
          {
            ["--chrona-roster-columns" as string]: days.length,
            ["--chrona-roster-stats-width" as string]: `${statsWidth}px`,
          } as React.CSSProperties
        }
      >
        <thead>
          <tr ref={headRef}>
            <th className="chrona-sched__roster-resource">
              {strings.resourceHeader}
              {groups ? extension?.groupsHeader : null}
            </th>
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
              <th {...statCell(index)} key={stat.id} title={stat.title}>
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
        {totals ? (
          <tfoot>
            <tr className="chrona-sched__roster-totals" data-testid="roster-totals" ref={footRef}>
              <td className="chrona-sched__roster-resource">
                <div className="chrona-sched__roster-name">{totals.label}</div>
              </td>
              <td className="chrona-sched__roster-totals-note" colSpan={days.length}>
                {totals.note ? <span className="chrona-sched__roster-totals-text">{totals.note}</span> : null}
              </td>
              {shownStats.map((stat, index) => (
                <td {...statCell(index)} key={stat.id}>
                  {totalValues[stat.id]}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
