import * as React from "react";
import { Add16Regular, Shifts20Regular } from "@fluentui/react-icons";

import {
  allowVerdict,
  refusesChange,
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
  moveRosterFocus,
  rosterGroupRows,
  rosterMarkPlacement,
  type RosterCell,
  type RosterFocus,
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
  /** Enter on a focused shift opens it, as Enter does on the Timeline. Absent = Enter clicks it. */
  readonly onEventOpen?: (event: SchedulerUiEvent) => void;
  /**
   * A new item in a day cell: a double-click on the cell's empty space, its "+" or Enter on the focused cell, on a
   * person's row or an open row (never the Filled / needed rows or the stats). Absent = no create gesture.
   */
  readonly onCellCreate?: (cell: RosterCell) => void;
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

/** A row of day cells the keyboard walks and a new item can be made in: an open row, or a person's. */
interface GridRow {
  readonly cells: readonly (readonly SchedulerUiEvent[])[];
  /** The row's band (RosterGroup.groups and requiredTags). */
  readonly groups?: Readonly<Record<string, string>>;
  readonly requiredTags?: readonly string[];
  readonly open?: { readonly key: string; readonly lightsUp: boolean };
  readonly person?: RosterRowLayout;
}

/** The keys that move the grid's focus (moveRosterFocus); the grid takes them from the page's scrolling. */
const GRID_KEYS = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home"]);

let nextRosterId = 0;

/** The grid stop an element is, or is inside: a day cell, or a shift in one. */
function gridStopOf(target: EventTarget | null): RosterFocus | undefined {
  const element = target instanceof Element ? target : null;
  const cell = element?.closest<HTMLElement>("[data-grid-row]");
  if (!cell) {
    return undefined;
  }
  const row = Number(cell.dataset["gridRow"]);
  const col = Number(cell.dataset["gridCol"]);
  if (!Number.isFinite(row) || !Number.isFinite(col)) {
    return undefined;
  }
  const chip = element?.closest<HTMLElement>("[data-grid-chip]");
  return chip && cell.contains(chip) ? { chip: Number(chip.dataset["gridChip"]), col, row } : { col, row };
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
    onCellCreate,
    onEventChange,
    onEventClick,
    onEventOpen,
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
  const takesBlockedChanges = useBoardExtension()?.takesBlockedChanges;
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
  const [focusAt, setFocusAt] = React.useState<RosterFocus | undefined>();
  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const hintId = React.useRef(`chrona-roster-hint-${(nextRosterId += 1)}`).current;
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
      if (refusesChange(verdict, takesBlockedChanges)) {
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

  const renderChip = (event: SchedulerUiEvent, dayIndex: number, stop: RosterFocus): JSX.Element => {
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
        data-grid-chip={stop.chip}
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
        // The grid is one tab stop (the ARIA grid pattern): only its focused cell or shift is in the tab order.
        tabIndex={isActive(stop) ? 0 : -1}
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

  /*
   * The rows of day cells, in the grid's order: each group's open row and its people, or, with no groups, the open row
   * and the people. The keyboard walks them; the headings, the Filled / needed rows and the totals are not among them.
   */
  const gridRows: GridRow[] = [];
  const groupGridRows: (readonly number[])[] = [];
  if (groups) {
    for (const group of groups) {
      const shows = rosterGroupRows(group, openEvents !== undefined);
      const members = new Set(group.resources.map((resource) => resource.id));
      const band = { ...(group.groups ? { groups: group.groups } : {}), ...(group.requiredTags ? { requiredTags: group.requiredTags } : {}) };
      const at: number[] = [];
      if (shows.open && openEvents) {
        at.push(gridRows.length);
        gridRows.push({ cells: layoutOpenRow(group.open, days), ...band, open: { key: `open-${group.id}`, lightsUp: draggingGroup === group.id } });
      }
      if (shows.people) {
        for (const row of rows.filter((one) => members.has(one.resource.id))) {
          at.push(gridRows.length);
          gridRows.push({ cells: row.cells, ...band, person: row });
        }
      }
      groupGridRows.push(at);
    }
  } else {
    if (openCells) {
      gridRows.push({ cells: openCells, open: { key: "open", lightsUp: true } });
    }
    for (const row of rows) {
      gridRows.push({ cells: row.cells, person: row });
    }
  }
  const chipCounts = gridRows.map((row) => row.cells.map((cell) => cell.length));

  /*
   * Roving focus: the cell or shift focused last is the grid's one tab stop, so Tab comes back to it; before any, today's
   * cell on the first row (else its first day). A stop the grid no longer has gives way to the nearest one it has.
   */
  const active = ((): RosterFocus | undefined => {
    if (chipCounts.length === 0 || days.length === 0) {
      return undefined;
    }
    const wanted = focusAt ?? { col: Math.max(0, todayDayIndex), row: 0 };
    const row = Math.min(wanted.row, chipCounts.length - 1);
    const col = Math.min(wanted.col, (chipCounts[row]?.length ?? 1) - 1);
    const count = chipCounts[row]?.[col] ?? 0;
    return wanted.chip !== undefined && count > 0 ? { chip: Math.min(wanted.chip, count - 1), col, row } : { col, row };
  })();
  const isActive = (stop: RosterFocus): boolean =>
    active !== undefined && active.row === stop.row && active.col === stop.col && active.chip === stop.chip;

  // A cell on a person's row, or on an open row when the host has a nobody, takes a new item.
  const cellOf = (row: number, col: number): RosterCell | undefined => {
    const grid = gridRows[row];
    const day = days[col];
    if (!grid || !day || !onCellCreate || (grid.person === undefined && openResourceId === undefined)) {
      return undefined;
    }
    return {
      day,
      ...(grid.groups ? { groups: grid.groups } : {}),
      ...(grid.requiredTags ? { requiredTags: grid.requiredTags } : {}),
      ...(grid.person ? { resource: grid.person.resource } : {}),
    };
  };
  const createIn = (row: number, col: number): void => {
    const cell = cellOf(row, col);
    if (cell && cellDrag.draggingEventId === undefined) {
      onCellCreate?.(cell);
    }
  };
  const focusStop = (stop: RosterFocus): void => {
    const cell = tableRef.current?.querySelector<HTMLElement>(`[data-grid-row="${stop.row}"][data-grid-col="${stop.col}"]`);
    const target = stop.chip === undefined ? cell : cell?.querySelector<HTMLElement>(`[data-grid-chip="${stop.chip}"]`);
    target?.focus();
    setFocusAt(stop);
  };
  const onGridFocus = (focusEvent: React.FocusEvent<HTMLTableElement>): void => {
    const stop = gridStopOf(focusEvent.target);
    if (stop) {
      setFocusAt((previous) =>
        previous && previous.row === stop.row && previous.col === stop.col && previous.chip === stop.chip ? previous : stop,
      );
    }
  };
  const onGridKeyDown = (keyEvent: React.KeyboardEvent<HTMLTableElement>): void => {
    if (keyEvent.altKey || keyEvent.shiftKey || keyEvent.defaultPrevented) {
      return;
    }
    const stop = gridStopOf(keyEvent.target);
    const target = keyEvent.target as HTMLElement;
    // Only the cell or the shift itself: a control inside a cell keeps its own keys.
    if (!stop || !(target.matches("[data-grid-row]") || target.matches("[data-grid-chip]"))) {
      return;
    }
    if (keyEvent.key === "Enter" && stop.chip === undefined) {
      keyEvent.preventDefault();
      createIn(stop.row, stop.col);
      return;
    }
    const shift = stop.chip === undefined ? undefined : gridRows[stop.row]?.cells[stop.col]?.[stop.chip];
    if (keyEvent.key === "Enter" && shift && onEventOpen) {
      keyEvent.preventDefault();
      onEventOpen(shift);
      return;
    }
    if (!GRID_KEYS.has(keyEvent.key)) {
      return;
    }
    keyEvent.preventDefault();
    const next = moveRosterFocus(stop, { ctrlKey: keyEvent.ctrlKey || keyEvent.metaKey, key: keyEvent.key }, chipCounts);
    if (next) {
      focusStop(next);
    }
  };

  // A day cell's own keyboard stop, and its way to a new item.
  const gridCell = (row: number, col: number): {
    readonly add: JSX.Element | null;
    /** The cell's class when it takes a new item: it tints on hover. */
    readonly className: string;
    readonly props: React.TdHTMLAttributes<HTMLTableCellElement> & { readonly "data-grid-col": number; readonly "data-grid-row": number };
  } => {
    const creates = cellOf(row, col) !== undefined;
    return {
      className: creates ? "chrona-sched__roster-cell--creates" : "",
      // Only in a day with no shifts, where it covers none; a day with shifts takes a double-click on its empty space, or Enter.
      add: creates && (chipCounts[row]?.[col] ?? 0) === 0 ? (
        // The mouse's way in, in the cell's corner on hover; the keyboard's is Enter on the cell.
        <span
          aria-hidden="true"
          className="chrona-sched__roster-add"
          data-testid="roster-add"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            createIn(row, col);
          }}
          title={strings.draftItem}
        >
          <Add16Regular />
        </span>
      ) : null,
      props: {
        "data-grid-col": col,
        "data-grid-row": row,
        ...(creates
          ? {
              onDoubleClick: (clickEvent: React.MouseEvent<HTMLTableCellElement>) => {
                // A double-click on a shift is the shift's.
                if (!(clickEvent.target as HTMLElement).closest("[data-event-id]")) {
                  createIn(row, col);
                }
              },
              // A double-click makes an item, so it selects no text.
              onMouseDown: (downEvent: React.MouseEvent<HTMLTableCellElement>) => {
                if (downEvent.detail > 1) {
                  downEvent.preventDefault();
                }
              },
            }
          : {}),
        tabIndex: isActive({ col, row }) ? 0 : -1,
      },
    };
  };

  const renderOpenRow = (
    cells: readonly (readonly SchedulerUiEvent[])[],
    key: string,
    lightsUp: boolean,
    gridRow: number,
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
      <td className="chrona-sched__roster-resource" role="rowheader">
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
        const grid = gridCell(gridRow, dayIndex);
        return (
          <td
            {...grid.props}
            className={
              [isHovered ? `chrona-sched__cell-drop chrona-sched__cell-drop--${hover.verdict.kind}` : "", grid.className]
                .filter(Boolean)
                .join(" ") || undefined
            }
            data-cell-day-index={openResourceId === undefined ? undefined : dayIndex}
            data-cell-resource-id={openResourceId}
            key={days[dayIndex]?.start.getTime() ?? dayIndex}
          >
            {cell.map((event, chip) => renderChip(event, dayIndex, { chip, col: dayIndex, row: gridRow }))}
            {grid.add}
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

  const renderPersonRow = (row: RosterRowLayout, gridRow: number): JSX.Element => {
    const statValues =
      shownStats.length > 0
        ? (extension?.columnValues?.(row.resource, shownStats.map((stat) => stat.id)) ?? {})
        : {};
    return (
      <tr key={row.resource.id}>
        <td className="chrona-sched__roster-resource" data-resource-id={row.resource.id} role="rowheader">
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
          const grid = gridCell(gridRow, dayIndex);
          return (
            <td
              {...grid.props}
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
                  grid.className,
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
              {cell.map((event, chip) => renderChip(event, dayIndex, { chip, col: dayIndex, row: gridRow }))}
              {grid.add}
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
  const renderGridRow = (index: number): JSX.Element | null => {
    const grid = gridRows[index];
    if (grid?.open) {
      return renderOpenRow(grid.cells, grid.open.key, grid.open.lightsUp, index);
    }
    return grid?.person ? renderPersonRow(grid.person, index) : null;
  };

  const renderGroup = (group: RosterGroup, groupIndex: number): JSX.Element => {
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
        {(groupGridRows[groupIndex] ?? []).map(renderGridRow)}
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

  // The day header: the people column, a column per day, then the stats.
  const headRow = (
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
  );
  // The day count and the stats' width size the fixed-layout table (see styles.css).
  const tableStyle = {
    ["--chrona-roster-columns" as string]: days.length,
    ["--chrona-roster-stats-width" as string]: `${statsWidth}px`,
  } as React.CSSProperties;

  // Open shifts on the grid's days fill the open row, so a grid with no people is empty only without them. It keeps its
  // day header over the message, as the timeline does, so the planner still sees which days the board is on.
  if (resources.length === 0 && !(openCells ?? []).some((cell) => cell.length > 0)) {
    return (
      <div className="chrona-sched__roster">
        {/* The header and the message share one width, so the message sits under the days it belongs to. */}
        <div className="chrona-sched__roster-empty" style={tableStyle}>
          <table className="chrona-sched__roster-table" style={tableStyle}>
            <thead>{headRow}</thead>
          </table>
          <div className="chrona-sched__empty">
            <span>{strings.emptyResources}</span>
            {props.emptyAction}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      // While a shift is dragged, no cell offers a new one.
      className={cellDrag.draggingEventId ? "chrona-sched__roster chrona-sched__roster--dragging" : "chrona-sched__roster"}
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
        aria-describedby={onCellCreate ? hintId : undefined}
        className="chrona-sched__roster-table"
        onFocus={onGridFocus}
        onKeyDown={onGridKeyDown}
        ref={tableRef}
        // The ARIA grid pattern: one tab stop, the arrow keys move between the days and their shifts.
        role="grid"
        style={tableStyle}
      >
        <thead>{headRow}</thead>
        <tbody>
          {groups ? (
            groups.map(renderGroup)
          ) : (
            gridRows.map((_row, index) => renderGridRow(index))
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
      {onCellCreate ? (
        <span className="chrona-sched__sr-only" id={hintId}>
          {strings.rosterCreateHint}
        </span>
      ) : null}
    </div>
  );
}
