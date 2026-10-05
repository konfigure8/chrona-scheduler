import * as React from "react";

import { useDragController } from "./dragContext";
import {
  allowVerdict,
  beginCreateSession,
  beginMoveSession,
  beginResizeSession,
  computeDragResult,
  dragResultChangesEvent,
  type ChangeVerdict,
  type DragResult,
  type DragSession,
  type ValidateChange,
} from "./interactions";
import { buildRosterDays } from "./rosterLayout";
import { isDragLocked, showsPin } from "./locks";
import { gapFractions } from "./spans";
import { PinGlyph } from "./PinGlyph";
import { useSchedulerStrings } from "./strings";
import {
  formatHourLabel,
  offsetToDate,
  resolveTimeResolution,
  snapDate,
  VERTICAL_RESOLUTION_LIMITS,
  type HourFormat,
} from "./timeAxis";
import { useBoardExtension } from "./extension";
import { packEventLanes } from "./timelineLayout";
import {
  isSameDay,
  resolveEventColor,
  resolveVerticalHourRange,
  type StatusColorRule,
} from "./viewConfig";
import type { TimelineChange } from "./ChronaTimeline";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  TimeWindow,
} from "./types";

interface VerticalColumn {
  readonly events: readonly SchedulerUiEvent[];
  readonly key: string;
  /** Set when the column IS a resource (top-down); drops reassign to it. */
  readonly resourceId?: string;
  readonly showResourceName: boolean;
  readonly title: string;
  readonly window: TimeWindow;
}

interface VerticalGridProps {
  readonly columns: readonly VerticalColumn[];
  readonly draftRange?: DragResult;
  readonly editable?: boolean;
  /** Shown when there are no columns (e.g. no resources configured). */
  readonly emptyMessage?: string;
  readonly endHour: number;
  readonly hourFormat: HourFormat;
  readonly onDraftRange?: (result: DragResult) => void;
  readonly onEventChange?: (change: TimelineChange) => void;
  readonly onEventClick?: (event: SchedulerUiEvent) => void;
  readonly pxPerHourVertical: number;
  readonly resourcesById: ReadonlyMap<string, SchedulerResource>;
  /** Effective time scale: slot gridlines and snapping follow it. */
  readonly slotMinutes?: number;
  readonly snapMinutes: number;
  readonly startHour: number;
  readonly statusColorRules?: readonly StatusColorRule[];
  readonly today?: Date;
  readonly validateChange?: ValidateChange;
}

interface VerticalPreview {
  readonly columnKey: string;
  readonly height: number;
  readonly label: string;
  readonly top: number;
  readonly verdict: ChangeVerdict;
}

const minimumLaneWidthPx = 96;
const resizeZonePx = 8;
const dragThresholdPx = 3;

function formatTimeRange(start: Date, end: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(start.getHours())}:${pad(start.getMinutes())}-${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

function VerticalGrid(props: VerticalGridProps): JSX.Element {
  const {
    columns,
    draftRange,
    editable = true,
    emptyMessage,
    endHour,
    hourFormat,
    onDraftRange,
    onEventChange,
    onEventClick,
    pxPerHourVertical,
    resourcesById,
    slotMinutes,
    snapMinutes,
    startHour,
    statusColorRules,
    today,
    validateChange,
  } = props;
  const columnHeight = (endHour - startHour) * pxPerHourVertical;
  // Ruled 2026-09-26: the resolution follows the zoom, and a drag snaps to the visible slot.
  const resolution = React.useMemo(
    () => resolveTimeResolution(pxPerHourVertical, slotMinutes ?? 30, VERTICAL_RESOLUTION_LIMITS),
    [pxPerHourVertical, slotMinutes],
  );
  const labelHours = Math.max(1, Math.round(resolution.labelMinutes / 60));
  const hours = Array.from(
    { length: endHour - startHour },
    (_, index) => startHour + index,
  ).filter((hour) => hour % labelHours === 0);
  /*
   * Hour and sub-hour slot lines are painted with repeating gradients,
   * not one div per line: a 5-minute scale across a week would otherwise
   * render thousands of nodes (the same regression the timeline hit).
   */
  const canvasGridBackground = React.useMemo(() => {
    const labelHeight = (resolution.labelMinutes / 60) * pxPerHourVertical;
    const showSlots = resolution.slotMinutes < resolution.labelMinutes;
    const labelLayer = `linear-gradient(to bottom, ${
      showSlots ? "var(--csui-stroke)" : "var(--csui-surface-hover)"
    } 1px, transparent 1px)`;
    if (!showSlots) {
      return {
        backgroundImage: labelLayer,
        backgroundSize: `100% ${labelHeight}px`,
      };
    }
    const slotHeight = (resolution.slotMinutes / 60) * pxPerHourVertical;
    const slotLayer =
      "linear-gradient(to bottom, var(--csui-surface-hover) 1px, transparent 1px)";
    return {
      backgroundImage: `${labelLayer}, ${slotLayer}`,
      backgroundSize: `100% ${labelHeight}px, 100% ${slotHeight}px`,
    };
  }, [resolution.labelMinutes, resolution.slotMinutes, pxPerHourVertical]);

  const strings = useSchedulerStrings();
  const drag = useDragController();
  const fit = useBoardExtension()?.fit;
  const canvasRefs = React.useRef(new Map<string, HTMLDivElement>());
  const pointerMovedRef = React.useRef(false);
  const pointerDownXRef = React.useRef(0);
  const pointerDownYRef = React.useRef(0);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [preview, setPreview] = React.useState<VerticalPreview | undefined>();

  const geometryFor = React.useCallback(
    (column: VerticalColumn) => ({
      pxPerHour: pxPerHourVertical,
      snapMinutes: resolution.slotMinutes,
      window: column.window,
    }),
    [pxPerHourVertical, resolution.slotMinutes],
  );

  const hitTestColumn = React.useCallback(
    (
      clientX: number,
      clientY: number,
    ): { column: VerticalColumn; offsetY: number } | undefined => {
      for (const column of columns) {
        const element = canvasRefs.current.get(column.key);
        if (!element) {
          continue;
        }
        const rect = element.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX < rect.right &&
          clientY >= rect.top - 40 &&
          clientY < rect.bottom + 40
        ) {
          return { column, offsetY: clientY - rect.top };
        }
      }
      return undefined;
    },
    [columns],
  );

  const processUp = React.useCallback(
    (upEvent: PointerEvent, session: DragSession): void => {
      setPreview(undefined);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      const hit = hitTestColumn(upEvent.clientX, upEvent.clientY);
      if (!hit) {
        return;
      }
      const result = computeDragResult(
        session,
        {
          left: hit.offsetY,
          resourceId:
            hit.column.resourceId ?? session.sourceEvent?.resourceId,
        },
        geometryFor(hit.column),
      );
      if (!result) {
        return;
      }
      if (session.kind === "create") {
        if (pointerMovedRef.current) {
          onDraftRange?.(result);
        }
        return;
      }
      if (session.sourceEvent && !pointerMovedRef.current) {
        return;
      }
      if (
        session.sourceEvent &&
        !dragResultChangesEvent(session.sourceEvent, result)
      ) {
        return;
      }
      const verdict =
        validateChange?.(session.sourceEvent, result) ?? allowVerdict;
      if (verdict.kind === "block") {
        return;
      }
      onEventChange?.({ event: session.sourceEvent, result, verdict });
    },
    [hitTestColumn, geometryFor, validateChange, onEventChange],
  );

  React.useEffect(() => {
    drag.registerUpHandler(processUp);
  });

  React.useEffect(() => {
    if (!drag.session) {
      setPreview(undefined);
      return undefined;
    }
    const session = drag.session;

    const handleMove = (moveEvent: PointerEvent): void => {
      pointerMovedRef.current =
        pointerMovedRef.current ||
        Math.abs(moveEvent.clientY - pointerDownYRef.current) >
          dragThresholdPx ||
        Math.abs(moveEvent.clientX - pointerDownXRef.current) >
          dragThresholdPx;
      const hit = hitTestColumn(moveEvent.clientX, moveEvent.clientY);
      if (!hit) {
        setPreview(undefined);
        return;
      }
      const result = computeDragResult(
        session,
        {
          left: hit.offsetY,
          resourceId:
            hit.column.resourceId ?? session.sourceEvent?.resourceId,
        },
        geometryFor(hit.column),
      );
      if (!result) {
        setPreview(undefined);
        return;
      }
      const verdict =
        validateChange?.(session.sourceEvent, result) ?? allowVerdict;
      const columnWindow = hit.column.window;
      const clampedStart = Math.max(
        result.start.getTime(),
        columnWindow.start.getTime(),
      );
      const clampedEnd = Math.min(
        result.end.getTime(),
        columnWindow.end.getTime(),
      );
      const top =
        ((clampedStart - columnWindow.start.getTime()) / 3_600_000) *
        pxPerHourVertical;
      const height = Math.max(
        ((clampedEnd - clampedStart) / 3_600_000) * pxPerHourVertical,
        12,
      );
      setPreview({
        columnKey: hit.column.key,
        height,
        label: formatTimeRange(result.start, result.end),
        top,
        verdict,
      });
    };

    const handleKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === "Escape") {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        drag.end();
        setPreview(undefined);
      }
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("keydown", handleKey);
    };
  }, [drag, hitTestColumn, geometryFor, validateChange, pxPerHourVertical]);

  const handleEventPointerDown = (
    downEvent: React.PointerEvent<HTMLElement>,
    event: SchedulerUiEvent,
    column: VerticalColumn,
  ): void => {
    if (!editable || downEvent.button !== 0) {
      return;
    }
    if (isDragLocked(event)) {
      // No session tracks movement for pinned items; record the down
      // position so the click handler can reject attempted drags.
      pointerMovedRef.current = false;
      pointerDownXRef.current = downEvent.clientX;
      pointerDownYRef.current = downEvent.clientY;
      return;
    }
    downEvent.preventDefault();
    downEvent.stopPropagation();
    pointerMovedRef.current = false;
    pointerDownXRef.current = downEvent.clientX;
    pointerDownYRef.current = downEvent.clientY;
    const rect = downEvent.currentTarget.getBoundingClientRect();
    const withinBar = downEvent.clientY - rect.top;
    if (withinBar <= resizeZonePx && rect.height > resizeZonePx * 3) {
      drag.begin(beginResizeSession(event, "start"));
      return;
    }
    if (
      withinBar >= rect.height - resizeZonePx &&
      rect.height > resizeZonePx * 3
    ) {
      drag.begin(beginResizeSession(event, "end"));
      return;
    }
    const canvas = canvasRefs.current.get(column.key);
    if (!canvas) {
      return;
    }
    const offsetY = downEvent.clientY - canvas.getBoundingClientRect().top;
    drag.begin(beginMoveSession(event, offsetY, geometryFor(column)));
  };

  const buildHourDraft = React.useCallback(
    (column: VerticalColumn, offsetY: number): DragResult => {
      const geometry = geometryFor(column);
      const start = snapDate(
        offsetToDate(offsetY, geometry.window, geometry.pxPerHour),
        geometry.snapMinutes,
      );
      return {
        end: new Date(start.getTime() + 3_600_000),
        resourceId: column.resourceId ?? "",
        start,
      };
    },
    [geometryFor],
  );

  const handleCanvasPointerDown = (
    downEvent: React.PointerEvent<HTMLDivElement>,
    column: VerticalColumn,
  ): void => {
    if (!editable || downEvent.button !== 0 || !column.resourceId) {
      return;
    }
    if (
      (downEvent.target as HTMLElement).closest(".chrona-sched__vertical-event")
    ) {
      return;
    }
    pointerMovedRef.current = false;
    pointerDownXRef.current = downEvent.clientX;
    pointerDownYRef.current = downEvent.clientY;
    const offsetY =
      downEvent.clientY - downEvent.currentTarget.getBoundingClientRect().top;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (!pointerMovedRef.current) {
        drag.end();
        onDraftRange?.(buildHourDraft(column, offsetY));
      }
    }, 500);
    drag.begin(beginCreateSession(offsetY, geometryFor(column)));
  };

  const handleCanvasDoubleClick = (
    clickEvent: React.MouseEvent<HTMLDivElement>,
    column: VerticalColumn,
  ): void => {
    if (!editable || !column.resourceId) {
      return;
    }
    if (
      (clickEvent.target as HTMLElement).closest(".chrona-sched__vertical-event")
    ) {
      return;
    }
    const offsetY =
      clickEvent.clientY - clickEvent.currentTarget.getBoundingClientRect().top;
    onDraftRange?.(buildHourDraft(column, offsetY));
  };

  if (columns.length === 0) {
    return (
      <div className="chrona-sched__vertical">
        <div className="chrona-sched__empty">
          {emptyMessage ?? strings.emptyResources}
        </div>
      </div>
    );
  }

  return (
    <div className="chrona-sched__vertical">
      <div className="chrona-sched__vertical-hours">
        <div className="chrona-sched__vertical-corner" />
        <div style={{ height: columnHeight, position: "relative" }}>
          {hours.map((hour) => (
            <div
              className="chrona-sched__vertical-hour"
              key={hour}
              style={{ top: (hour - startHour) * pxPerHourVertical }}
            >
              {formatHourLabel(new Date(2026, 0, 1, hour, 0, 0), hourFormat)}
            </div>
          ))}
        </div>
      </div>
      {columns.map((column) => {
        const packed = packEventLanes(
          column.events,
          column.window,
          pxPerHourVertical,
        );
        const columnMinWidth = Math.max(
          150,
          packed.laneCount * minimumLaneWidthPx,
        );
        const columnPreview =
          preview && preview.columnKey === column.key ? preview : undefined;
        const sourceEvent = drag.session?.sourceEvent;
        const columnMismatch =
          drag.session && column.resourceId && sourceEvent && fit
            ? fit.missing(resourcesById.get(column.resourceId), sourceEvent).length > 0
            : false;
        // Only day columns can be "today"; top-down columns are resources
        // sharing one day, where a whole-grid tint would be noise.
        const columnIsToday =
          column.resourceId === undefined &&
          isSameDay(column.window.start, today ?? new Date());
        return (
          <div
            className={
              columnMismatch
                ? "chrona-sched__vertical-column chrona-sched__vertical-column--mismatch"
                : "chrona-sched__vertical-column"
            }
            key={column.key}
            style={{ minWidth: columnMinWidth }}
          >
            <div
              className={
                columnIsToday
                  ? "chrona-sched__vertical-title chrona-sched__vertical-title--today"
                  : "chrona-sched__vertical-title"
              }
            >
              {column.title}
            </div>
            <div
              className={
                columnIsToday
                  ? "chrona-sched__vertical-canvas chrona-sched__vertical-canvas--today"
                  : "chrona-sched__vertical-canvas"
              }
              onDoubleClick={(clickEvent) =>
                handleCanvasDoubleClick(clickEvent, column)
              }
              onPointerDown={(downEvent) =>
                handleCanvasPointerDown(downEvent, column)
              }
              ref={(element) => {
                if (element) {
                  canvasRefs.current.set(column.key, element);
                } else {
                  canvasRefs.current.delete(column.key);
                }
              }}
              style={{ height: columnHeight, ...canvasGridBackground }}
            >
              {packed.events.map((positioned) => {
                const laneWidth = 100 / packed.laneCount;
                const resourceName = resourcesById.get(
                  positioned.event.resourceId,
                )?.name;
                const isDragSource =
                  drag.session?.sourceEvent?.id === positioned.event.id;
                const clipStart =
                  positioned.event.start.getTime() <
                  column.window.start.getTime();
                const clipEnd =
                  positioned.event.end.getTime() > column.window.end.getTime();
                return (
                  <button
                    aria-label={`${positioned.event.title}, ${formatTimeRange(positioned.event.start, positioned.event.end)}`}
                    data-event-id={positioned.event.id}
                    disabled={positioned.event.review === "ghost"}
                    className={[
                      "chrona-sched__vertical-event",
                      positioned.event.status === "needsCover"
                        ? "chrona-sched__bar--needs-cover"
                        : "",
                      editable && !isDragLocked(positioned.event)
                        ? "chrona-sched__bar--editable"
                        : "",
                      showsPin(positioned.event)
                        ? "chrona-sched__bar--pinned"
                        : "",
                      isDragSource ? "chrona-sched__bar--drag-source" : "",
                      positioned.event.review === "proposed"
                        ? "chrona-sched__bar--proposed"
                        : "",
                      positioned.event.review === "ghost"
                        ? "chrona-sched__bar--ghost"
                        : "",
                      clipStart ? "chrona-sched__vertical-event--clip-start" : "",
                      clipEnd ? "chrona-sched__vertical-event--clip-end" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={positioned.event.id}
                    onClick={(clickEvent) => {
                      const travelled = Math.max(
                        Math.abs(clickEvent.clientX - pointerDownXRef.current),
                        Math.abs(clickEvent.clientY - pointerDownYRef.current),
                      );
                      if (
                        !pointerMovedRef.current &&
                        (Number.isNaN(travelled) ||
                          travelled <= dragThresholdPx)
                      ) {
                        onEventClick?.(positioned.event);
                      }
                    }}
                    onPointerDown={(downEvent) =>
                      handleEventPointerDown(
                        downEvent,
                        positioned.event,
                        column,
                      )
                    }
                    style={{
                      background:
                        positioned.event.review === "ghost"
                          ? undefined
                          : resolveEventColor(
                              positioned.event,
                              statusColorRules,
                            ),
                      height: Math.max(positioned.width - 2, 14),
                      left: `${positioned.lane * laneWidth}%`,
                      top: positioned.left,
                      width: `${laneWidth}%`,
                    }}
                    title={formatTimeRange(
                      positioned.event.start,
                      positioned.event.end,
                    )}
                    type="button"
                  >
                    {gapFractions(positioned.event).map((fraction) => (
                      <span
                        className="chrona-sched__bar-gap chrona-sched__bar-gap--vertical"
                        key={fraction.gap.start.getTime()}
                        style={{
                          height: `${
                            (fraction.endFraction - fraction.startFraction) * 100
                          }%`,
                          top: `${fraction.startFraction * 100}%`,
                        }}
                        title={[
                          fraction.gap.label,
                          formatTimeRange(fraction.gap.start, fraction.gap.end),
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      />
                    ))}
                    {editable && !isDragLocked(positioned.event) && positioned.width > 30 ? (
                      <span
                        aria-hidden="true"
                        className="chrona-sched__vertical-handle chrona-sched__vertical-handle--start"
                        onPointerDown={(downEvent) => {
                          if (downEvent.button !== 0) {
                            return;
                          }
                          downEvent.preventDefault();
                          downEvent.stopPropagation();
                          pointerMovedRef.current = false;
                          pointerDownXRef.current = downEvent.clientX;
                          pointerDownYRef.current = downEvent.clientY;
                          drag.begin(
                            beginResizeSession(positioned.event, "start"),
                          );
                        }}
                      />
                    ) : null}
                    {clipStart ? (
                      <span
                        aria-hidden="true"
                        className="chrona-sched__vclip chrona-sched__vclip--start"
                      >
                        ⌃
                      </span>
                    ) : null}
                    <span className="chrona-sched__vertical-event-title">
                      {showsPin(positioned.event) ? <PinGlyph /> : null}
                      {positioned.event.title}
                    </span>
                    <span className="chrona-sched__bar-time">
                      {column.showResourceName && resourceName
                        ? resourceName
                        : formatTimeRange(
                            positioned.event.start,
                            positioned.event.end,
                          )}
                    </span>
                    {editable && !isDragLocked(positioned.event) && positioned.width > 30 ? (
                      <span
                        aria-hidden="true"
                        className="chrona-sched__vertical-handle chrona-sched__vertical-handle--end"
                        onPointerDown={(downEvent) => {
                          if (downEvent.button !== 0) {
                            return;
                          }
                          downEvent.preventDefault();
                          downEvent.stopPropagation();
                          pointerMovedRef.current = false;
                          pointerDownXRef.current = downEvent.clientX;
                          pointerDownYRef.current = downEvent.clientY;
                          drag.begin(
                            beginResizeSession(positioned.event, "end"),
                          );
                        }}
                      />
                    ) : null}
                    {clipEnd ? (
                      <span
                        aria-hidden="true"
                        className="chrona-sched__vclip chrona-sched__vclip--end"
                      >
                        ⌄
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {draftRange &&
              column.resourceId &&
              draftRange.resourceId === column.resourceId ? (
                <div
                  className="chrona-sched__preview chrona-sched__preview--allow chrona-sched__preview--vertical chrona-sched__preview--draft"
                  style={{
                    height: Math.max(
                      ((Math.min(
                        draftRange.end.getTime(),
                        column.window.end.getTime(),
                      ) -
                        Math.max(
                          draftRange.start.getTime(),
                          column.window.start.getTime(),
                        )) /
                        3_600_000) *
                        pxPerHourVertical,
                      12,
                    ),
                    top:
                      ((Math.max(
                        draftRange.start.getTime(),
                        column.window.start.getTime(),
                      ) -
                        column.window.start.getTime()) /
                        3_600_000) *
                      pxPerHourVertical,
                  }}
                >
                  <span>{strings.draftItem}</span>
                </div>
              ) : null}
              {columnPreview ? (
                <div
                  className={`chrona-sched__preview chrona-sched__preview--${columnPreview.verdict.kind} chrona-sched__preview--vertical`}
                  style={{
                    height: columnPreview.height,
                    top: columnPreview.top,
                  }}
                >
                  <span>{columnPreview.label}</span>
                  {columnPreview.verdict.reason ? (
                    <span className="chrona-sched__preview-reason">
                      {columnPreview.verdict.reason}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface TopDownViewProps {
  readonly draftRange?: DragResult;
  readonly editable?: boolean;
  readonly events: readonly SchedulerUiEvent[];
  readonly hourFormat?: HourFormat;
  readonly onDraftRange?: (result: DragResult) => void;
  readonly onEventChange?: (change: TimelineChange) => void;
  readonly onEventClick?: (event: SchedulerUiEvent) => void;
  readonly pxPerHourVertical?: number;
  readonly resources: readonly SchedulerResource[];
  readonly slotMinutes?: number;
  readonly snapMinutes?: number;
  readonly statusColorRules?: readonly StatusColorRule[];
  readonly today?: Date;
  readonly validateChange?: ValidateChange;
  readonly window: TimeWindow;
}

/** Calendar 365-style top-down view: one column per resource, vertical time. */
export function TopDownView(props: TopDownViewProps): JSX.Element {
  const hourRange = React.useMemo(
    () => resolveVerticalHourRange(props.events),
    [props.events],
  );
  const dayWindow: TimeWindow = React.useMemo(() => {
    const dayStart = new Date(props.window.start.getTime());
    dayStart.setHours(0, 0, 0, 0);
    const start = new Date(dayStart.getTime());
    start.setHours(hourRange.startHour, 0, 0, 0);
    const end = new Date(dayStart.getTime());
    end.setHours(hourRange.endHour, 0, 0, 0);
    return { end, start };
  }, [props.window.start, hourRange]);
  const resourcesById = React.useMemo(
    () => new Map(props.resources.map((resource) => [resource.id, resource])),
    [props.resources],
  );

  return (
    <VerticalGrid
      columns={props.resources.map((resource) => ({
        events: props.events.filter(
          (event) => event.resourceId === resource.id,
        ),
        key: resource.id,
        resourceId: resource.id,
        showResourceName: false,
        title: resource.name,
        window: dayWindow,
      }))}
      draftRange={props.draftRange}
      editable={props.editable}
      endHour={hourRange.endHour}
      hourFormat={props.hourFormat ?? "24"}
      onDraftRange={props.onDraftRange}
      onEventChange={props.onEventChange}
      onEventClick={props.onEventClick}
      pxPerHourVertical={props.pxPerHourVertical ?? 48}
      resourcesById={resourcesById}
      slotMinutes={props.slotMinutes}
      snapMinutes={props.snapMinutes ?? 15}
      startHour={hourRange.startHour}
      statusColorRules={props.statusColorRules}
      today={props.today}
      validateChange={props.validateChange}
    />
  );
}

export interface DayColumnsViewProps {
  readonly editable?: boolean;
  readonly events: readonly SchedulerUiEvent[];
  readonly hourFormat?: HourFormat;
  readonly onEventChange?: (change: TimelineChange) => void;
  readonly onEventClick?: (event: SchedulerUiEvent) => void;
  readonly pxPerHourVertical?: number;
  readonly resources: readonly SchedulerResource[];
  readonly showWeekends?: boolean;
  readonly slotMinutes?: number;
  readonly snapMinutes?: number;
  readonly statusColorRules?: readonly StatusColorRule[];
  readonly today?: Date;
  readonly validateChange?: ValidateChange;
  readonly window: TimeWindow;
}

/** Classic vertical day/week view: one column per day, all resources mixed. */
export function DayColumnsView(props: DayColumnsViewProps): JSX.Element {
  const days = buildRosterDays(props.window, props.showWeekends ?? true);
  const hourRange = React.useMemo(
    () => resolveVerticalHourRange(props.events),
    [props.events],
  );
  const resourcesById = React.useMemo(
    () => new Map(props.resources.map((resource) => [resource.id, resource])),
    [props.resources],
  );

  return (
    <VerticalGrid
      columns={days.map((day) => {
        const start = new Date(day.start.getTime());
        start.setHours(hourRange.startHour, 0, 0, 0);
        const end = new Date(day.start.getTime());
        end.setHours(hourRange.endHour, 0, 0, 0);
        return {
          events: props.events,
          key: day.start.toISOString(),
          showResourceName: true,
          title: day.label,
          window: { end, start },
        };
      })}
      editable={props.editable}
      endHour={hourRange.endHour}
      hourFormat={props.hourFormat ?? "24"}
      onEventChange={props.onEventChange}
      onEventClick={props.onEventClick}
      pxPerHourVertical={props.pxPerHourVertical ?? 48}
      resourcesById={resourcesById}
      slotMinutes={props.slotMinutes}
      snapMinutes={props.snapMinutes ?? 15}
      startHour={hourRange.startHour}
      statusColorRules={props.statusColorRules}
      today={props.today}
      validateChange={props.validateChange}
    />
  );
}
