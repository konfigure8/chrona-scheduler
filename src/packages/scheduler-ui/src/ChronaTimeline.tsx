import * as React from "react";

import { useDragController } from "./dragContext";
import { groupSetNames, groupValue, UNGROUPED } from "./groupSets";
import {
  allowVerdict,
  beginCreateSession,
  beginLaneAssignSession,
  beginMoveSession,
  beginResizeSession,
  buildGroupChanges,
  computeDragResult,
  dragResultChangesEvent,
  type ChangeVerdict,
  type DragResult,
  type DragSession as DragSessionType,
  type TimelineChange,
  type ValidateChange,
} from "./interactions";

export type { TimelineChange } from "./interactions";
import {
  decorationsForResource,
  type RowDecoration,
} from "./decorations";
import {
  bucketCoverage,
  computeCoverage,
  coverageTitle,
  type CoverageBucket,
  type DemandRow,
} from "./coverage";
import { dateNamesFrom } from "./dateNames";
import {
  buildTimeTicksEvery,
  buildWeekSpans,
  dateToOffset,
  fitPxPerHour,
  formatDayLabelToFit,
  formatHourLabel,
  offsetToDate,
  MIN_PX_PER_HOUR,
  resolveTimeResolution,
  snapDate,
  stepZoom,
  windowWidth,
  type HourFormat,
} from "./timeAxis";
import { buildResourceGroups, groupCollapseKey } from "./resourceGrouping";
import { formatString, useSchedulerStrings } from "./strings";
import {
  isDeleteLocked,
  isDragLocked,
  isLocked,
  isTimeLocked,
} from "./locks";
import { gapFractions, normalizeGaps } from "./spans";
import { FlagGlyph } from "./FlagGlyph";
import { flagReasonText } from "./stringResources";
import { PinGlyph } from "./PinGlyph";
import { VerticalSplitter } from "./Splitter";
import { tagClassName, tagPillStyle, type TagColorMap } from "./tagColors";
import { computeVisibleEntryRange } from "./rowVirtualization";
import { assignedHours, missingRequiredTags } from "./skills";
import { packEventLanes, type TimelineRowLayout } from "./timelineLayout";
import {
  isSameDay,
  resolveEventColor,
  resolveInitialScrollHour,
  type StatusColorRule,
} from "./viewConfig";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  TimelineConfig,
  TimeWindow,
} from "./types";

export interface ChronaTimelineProps {
  readonly config: TimelineConfig;
  /** Slice size for the coverage strip grid (default 30). */
  readonly coverageSliceMinutes?: number;
  readonly decorations?: readonly RowDecoration[];
  /**
   * Expanded demand rows (domain model section 4). When present, a
   * coverage strip renders per group header (or one strip above flat
   * rows): required vs scheduled per slice, deficits red by shortfall,
   * over-cap amber, worst-state buckets at coarse zoom.
   */
  readonly demand?: readonly DemandRow[];
  /** Temporary create-dialog range rendered as a ghost until confirmed. */
  readonly draftRange?: DragResult;
  readonly editable?: boolean;
  readonly events: readonly SchedulerUiEvent[];
  readonly hourFormat?: HourFormat;
  readonly now?: Date;
  /** Roster-period starts to mark as vertical boundary lines. */
  readonly periodBoundaries?: readonly Date[];
  /**
   * A drag, double-click, or long-press proposed a new item. The host (the
   * surface) opens the create dialog; nothing is created until it saves.
   */
  readonly onDraftRange?: (result: DragResult) => void;
  readonly onDeleteEvent?: (event: SchedulerUiEvent) => void;
  /** Group delete in one host transaction; falls back to onDeleteEvent per event. */
  readonly onDeleteEvents?: (events: readonly SchedulerUiEvent[]) => void;
  readonly onEventChange?: (change: TimelineChange) => void;
  /** Group move in one host transaction; falls back to onEventChange per change. */
  readonly onEventsChange?: (changes: readonly TimelineChange[]) => void;
  readonly onEventClick?: (event: SchedulerUiEvent) => void;
  readonly onOpenEvent?: (event: SchedulerUiEvent) => void;
  /** Selection is a set: click replaces, ctrl toggles, shift extends. */
  readonly onSelectionChange?: (ids: readonly string[]) => void;
  /**
   * Enables ctrl+wheel zoom: reports the next pxPerHour; the host owns
   * the config value. The time under the pointer stays put.
   */
  readonly onZoomChange?: (pxPerHour: number) => void;
  /** Group rows by resource group with collapsible headers. Defaults to on when any resource has a group. */
  /**
   * Ordered grouping-set names (two honored): [] = flat,
   * ["Teams"] = one level, ["Regions", "Teams"] = nested. Omitted:
   * the first set found in the data.
   */
  readonly groupBy?: readonly string[];
  /**
   * Hour of day the view opens scrolled to, re-applied on navigation so
   * the time-of-day position holds. Defaults to one hour before the
   * earliest visible event (08:00 when empty).
   */
  readonly initialScrollHour?: number;
  /** Resource column width in px; user-resizable when the callback is set. */
  readonly labelColumnWidth?: number;
  /** Renders the column splitter; the host owns and persists the width. */
  readonly onLabelColumnWidthChange?: (width: number) => void;
  /**
   * Imperative scroll request: bring this instant into view. The nonce
   * lets repeated requests for the same date re-trigger.
   */
  readonly scrollToRequest?: { readonly date: Date; readonly nonce: number };
  readonly resources: readonly SchedulerResource[];
  readonly selectedEventIds?: readonly string[];
  /** Effective time scale; drives sub-hour tick lines at readable zooms. */
  readonly slotMinutes?: number;
  readonly statusColorRules?: readonly StatusColorRule[];
  /** Maker-configured colors for skill/tag pills. */
  readonly tagColors?: TagColorMap;
  /**
   * Unassigned demand rendered as pale bars in an "Unscheduled" lane
   * at the top of each group (single lane when grouping is off).
   */
  readonly unscheduledEvents?: readonly SchedulerUiEvent[];
  /** Deterministic "today" for the column highlight; defaults to the real clock. */
  readonly today?: Date;
  readonly validateChange?: ValidateChange;
  readonly window: TimeWindow;
}

interface DisplayEntry {
  /** Collapse-state key for header entries (group or group+subgroup). */
  readonly collapseKey?: string;
  /** 0 = group header, 1 = subgroup header. */
  readonly depth?: number;
  readonly groupName?: string;
  readonly height: number;
  readonly kind: "coverage" | "header" | "lane" | "row";
  readonly memberCount?: number;
  readonly row?: TimelineRowLayout;
  readonly top: number;
}

const groupHeaderHeight = 28;
/** Unscheduled-lane rows are denser than resource rows. */
const laneRowHeight = 34;

interface DragPreview {
  /** Number of events moving together; badge shown when above one. */
  readonly groupCount: number;
  readonly result: DragResult;
  readonly verdict: ChangeVerdict;
}

const defaultLabelColumnWidth = 168;
const labelColumnMinWidth = 96;
const labelColumnMaxWidth = 480;
const axisRowHeight = 22;
const resizeZoneWidth = 8;
const dragStartThresholdPx = 3;
const autoScrollZonePx = 40;
const autoScrollStepPx = 24;

function formatTimeRange(start: Date, end: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(start.getHours())}:${pad(start.getMinutes())}-${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

function flattenSelectableEvents(
  rows: readonly TimelineRowLayout[],
): readonly SchedulerUiEvent[] {
  const flattened: SchedulerUiEvent[] = [];
  for (const row of rows) {
    for (const positioned of row.events) {
      flattened.push(positioned.event);
    }
  }
  return flattened;
}

export function ChronaTimeline(props: ChronaTimelineProps): JSX.Element {
  const {
    config,
    coverageSliceMinutes,
    decorations,
    demand,
    draftRange,
    editable = true,
    events,
    groupBy,
    hourFormat = "24",
    initialScrollHour,
    labelColumnWidth: labelColumnWidthProp,
    now,
    onDeleteEvent,
    onDeleteEvents,
    onDraftRange,
    onEventChange,
    onEventsChange,
    onEventClick,
    onLabelColumnWidthChange,
    onOpenEvent,
    onSelectionChange,
    onZoomChange,
    resources,
    scrollToRequest,
    selectedEventIds,
    slotMinutes,
    statusColorRules,
    tagColors,
    today,
    unscheduledEvents,
    validateChange,
    window: timeWindow,
  } = props;

  const strings = useSchedulerStrings();
  const labelColumnWidth = labelColumnWidthProp ?? defaultLabelColumnWidth;
  const selection = React.useMemo(
    () => new Set(selectedEventIds ?? []),
    [selectedEventIds],
  );
  // Anchor of the last non-shift selection, for shift-click ranges.
  const selectionAnchorRef = React.useRef<string | undefined>(undefined);

  const drag = useDragController();
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const pointerMovedRef = React.useRef(false);
  const pointerDownLeftRef = React.useRef(0);
  const pointerDownTopRef = React.useRef(0);
  const [preview, setPreview] = React.useState<DragPreview | undefined>();
  const seededSessionRef = React.useRef<unknown>(null);
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(600);
  const scrollFrameRef = React.useRef(0);

  React.useEffect(() => {
    const outer = scrollRef.current;
    if (!outer) {
      return undefined;
    }
    const measure = (): void => setViewportHeight(outer.clientHeight || 600);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /*
   * Week and month open fitted to the board (ruled 2026-09-26): until the
   * planner zooms, the window fills the visible width. The zoom never goes
   * further out than that, since past it the board only gains empty space.
   */
  const [visibleWidth, setVisibleWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const outer = scrollRef.current;
    if (!outer) {
      return undefined;
    }
    const measure = (): void =>
      setVisibleWidth(Math.max(0, outer.clientWidth - labelColumnWidth));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [labelColumnWidth]);
  const fittedPxPerHour =
    visibleWidth > 0 ? fitPxPerHour(timeWindow, visibleWidth) : undefined;
  const pxPerHour =
    config.fitToWidth && fittedPxPerHour !== undefined
      ? fittedPxPerHour
      : config.pxPerHour;

  const handleScroll = React.useCallback((): void => {
    if (scrollFrameRef.current) {
      return;
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = 0;
      setScrollTop(scrollRef.current?.scrollTop ?? 0);
    });
  }, []);

  /*
   * The resolution follows the zoom (ruled 2026-09-26): zooming out steps
   * the slot and the labels up the ladder, never finer than the maker's
   * slot, so the header stays readable and a drag snaps to the lines the
   * planner sees.
   */
  const windowDays =
    (timeWindow.end.getTime() - timeWindow.start.getTime()) / 86_400_000;
  const resolution = React.useMemo(() => {
    const zoomed = resolveTimeResolution(pxPerHour, slotMinutes ?? 30);
    // Beyond ~10 days, hourly labels are thousands of cells no one reads: long windows label days.
    return windowDays > 10 ? { ...zoomed, labelMinutes: 1440 } : zoomed;
  }, [pxPerHour, slotMinutes, windowDays]);
  const dailyLabels = resolution.labelMinutes >= 1440;
  const dateNames = React.useMemo(
    () => dateNamesFrom(strings),
    [strings.monthsLong, strings.monthsShort, strings.weekdaysShort],
  );
  const timeCells = React.useMemo(
    () =>
      dailyLabels
        ? []
        : buildTimeTicksEvery(timeWindow, pxPerHour, resolution.labelMinutes, hourFormat, dateNames),
    [dailyLabels, timeWindow, pxPerHour, resolution.labelMinutes, hourFormat, dateNames],
  );
  const dayWidth = 24 * pxPerHour;
  // Past a comfortable column a centred date drifts out of view: wide days pin it left instead.
  const wideDays = dayWidth >= 240;
  const dayCells = React.useMemo(
    () => buildTimeTicksEvery(timeWindow, pxPerHour, 1440, hourFormat, dateNames),
    [timeWindow, pxPerHour, hourFormat, dateNames],
  );
  // Day-level labels drop the time row and gain an ISO week band above the dates.
  const showWeekBand = dailyLabels;
  const weekSpans = React.useMemo(
    () =>
      showWeekBand ? buildWeekSpans(timeWindow, pxPerHour) : [],
    [showWeekBand, timeWindow, pxPerHour],
  );
  const headerHeight = axisRowHeight * 2;
  /*
   * Grid lines are painted with repeating gradients instead of one div per
   * hour per row: at a month span the div approach produced 5,000+ nodes
   * and visible interval-switch lag.
   */
  const rowGridBackground = React.useMemo(() => {
    // Grid ramp (Fluent-2 review): day boundaries keep the stroke, label
    // lines substantially lighter, slot lines lighter still.
    const layers = ["linear-gradient(to right, var(--csui-grid-day) 1px, transparent 1px)"];
    const sizes = [`${24 * pxPerHour}px 100%`];
    if (!dailyLabels) {
      layers.push("linear-gradient(to right, var(--csui-grid-hour) 1px, transparent 1px)");
      sizes.push(`${(resolution.labelMinutes / 60) * pxPerHour}px 100%`);
    }
    if (resolution.slotMinutes < Math.min(resolution.labelMinutes, 1440)) {
      layers.push("linear-gradient(to right, var(--csui-grid-slot) 1px, transparent 1px)");
      sizes.push(`${(resolution.slotMinutes / 60) * pxPerHour}px 100%`);
    }
    return { backgroundImage: layers.join(", "), backgroundSize: sizes.join(", ") };
  }, [dailyLabels, pxPerHour, resolution.labelMinutes, resolution.slotMinutes]);
  const canvasWidth = windowWidth(timeWindow, pxPerHour);

  /*
   * Planners open at the working day, not 00:00, and navigation keeps the
   * time-of-day position (scheduler convention). Long spans render one cell
   * per day, where an hour offset is meaningless - they pin to the left.
   */
  const scrollHourRef = React.useRef(8);
  scrollHourRef.current = resolveInitialScrollHour(
    events,
    timeWindow,
    initialScrollHour,
  );
  /*
   * Ctrl+wheel zoom anchor: the hour under the pointer and where it sat
   * in the viewport, consumed by the effect below once the host applies
   * the new pxPerHour. While pending it suppresses the working-day
   * scroll reset.
   */
  const zoomAnchorRef = React.useRef<
    { hour: number; viewportX: number } | undefined
  >(undefined);
  const windowStartMs = timeWindow.start.getTime();
  React.useEffect(() => {
    const outer = scrollRef.current;
    if (!outer || zoomAnchorRef.current) {
      return;
    }
    // Deps are navigation and zoom only: event edits shift the derived
    // hour but must not yank the canvas mid-session.
    outer.scrollLeft = dailyLabels ? 0 : scrollHourRef.current * pxPerHour;
  }, [windowStartMs, pxPerHour, dailyLabels]);

  React.useEffect(() => {
    const outer = scrollRef.current;
    const anchor = zoomAnchorRef.current;
    if (!outer || !anchor) {
      return;
    }
    zoomAnchorRef.current = undefined;
    outer.scrollLeft = anchor.hour * pxPerHour - anchor.viewportX;
  }, [pxPerHour]);

  /*
   * Runs AFTER the working-day initial-scroll effect above, so on a
   * cross-window navigation the requested date wins the final position.
   */
  React.useEffect(() => {
    const outer = scrollRef.current;
    const target = scrollToRequest?.date;
    if (!outer || !target) {
      return;
    }
    if (
      target.getTime() < timeWindow.start.getTime() ||
      target.getTime() >= timeWindow.end.getTime()
    ) {
      return;
    }
    outer.scrollLeft = Math.max(
      0,
      dateToOffset(target, timeWindow, pxPerHour) - 48,
    );
    // Re-fire on the nonce only; window/zoom changes re-position via
    // their own effects.
  }, [scrollToRequest?.nonce]);

  React.useEffect(() => {
    const outer = scrollRef.current;
    if (!outer || !onZoomChange) {
      return undefined;
    }
    // Native non-passive listener: React's synthetic wheel cannot
    // preventDefault reliably, and without it ctrl+wheel zooms the page.
    const handleWheel = (wheelEvent: WheelEvent): void => {
      if (!wheelEvent.ctrlKey) {
        return;
      }
      wheelEvent.preventDefault();
      const next = stepZoom(
        pxPerHour,
        wheelEvent.deltaY < 0 ? "in" : "out",
        fittedPxPerHour ?? MIN_PX_PER_HOUR,
      );
      if (next === pxPerHour) {
        return;
      }
      const rect = outer.getBoundingClientRect();
      const viewportX =
        wheelEvent.clientX - rect.left - labelColumnWidth;
      const canvasX = viewportX + outer.scrollLeft;
      zoomAnchorRef.current = {
        hour: canvasX / pxPerHour,
        viewportX,
      };
      onZoomChange(next);
    };
    outer.addEventListener("wheel", handleWheel, { passive: false });
    return () => outer.removeEventListener("wheel", handleWheel);
  }, [onZoomChange, pxPerHour, fittedPxPerHour, labelColumnWidth]);

  const todayStart = React.useMemo(() => {
    const base = today ?? new Date();
    const midnight = new Date(base.getTime());
    midnight.setHours(0, 0, 0, 0);
    return midnight;
  }, [today]);
  const todayColumn = React.useMemo(() => {
    if (
      todayStart.getTime() < timeWindow.start.getTime() ||
      todayStart.getTime() >= timeWindow.end.getTime()
    ) {
      return undefined;
    }
    const left = dateToOffset(todayStart, timeWindow, pxPerHour);
    return {
      left,
      width: Math.min(24 * pxPerHour, canvasWidth - left),
    };
  }, [todayStart, timeWindow, pxPerHour, canvasWidth]);

  const [collapsedGroups, setCollapsedGroups] = React.useState<
    ReadonlySet<string>
  >(new Set());
  const setNames = React.useMemo(
    () => groupSetNames(resources, events),
    [resources, events],
  );
  const effectiveGroupBy = React.useMemo(
    () => groupBy ?? (setNames[0] !== undefined ? [setNames[0]] : []),
    [groupBy, setNames],
  );
  const primarySet = effectiveGroupBy[0];
  const groupingEnabled = effectiveGroupBy.length > 0;

  /*
   * Coverage buckets per top-level group (or one global set when flat).
   * Computed at slice granularity, rendered aggregated to a minimum
   * cell so a breach is never averaged away (worst state wins).
   */
  const coverageByGroup = React.useMemo<
    ReadonlyMap<string | undefined, readonly CoverageBucket[]> | undefined
  >(() => {
    if (!demand || demand.length === 0) {
      return undefined;
    }
    const sliceMin = coverageSliceMinutes ?? 30;
    const sliceWidth = (sliceMin / 60) * pxPerHour;
    const resourceGroups = new Map(
      resources.map((resource) => [
        resource.id,
        primarySet ? resource.groups?.[primarySet] : undefined,
      ]),
    );
    const build = (group?: string): readonly CoverageBucket[] =>
      bucketCoverage(
        computeCoverage(
          demand,
          events,
          timeWindow,
          sliceMin,
          group,
          resourceGroups,
          primarySet,
        ),
        sliceWidth,
        // Buckets stay wide enough to carry their numbers at any zoom;
        // worst-state aggregation keeps breaches visible regardless.
        20,
      );
    const map = new Map<string | undefined, readonly CoverageBucket[]>();
    if (groupingEnabled) {
      for (const group of buildResourceGroups(resources, effectiveGroupBy)) {
        map.set(group.name, build(group.name));
      }
    } else {
      map.set(undefined, build(undefined));
    }
    return map;
  }, [
    demand,
    events,
    timeWindow,
    pxPerHour,
    coverageSliceMinutes,
    groupingEnabled,
    resources,
  ]);

  const renderCoverageCells = (
    buckets: readonly CoverageBucket[] | undefined,
  ): readonly JSX.Element[] | null => {
    if (!buckets || buckets.length === 0) {
      return null;
    }
    const pad = (value: number): string => String(value).padStart(2, "0");
    const formatRange = (start: Date, end: Date): string =>
      `${pad(start.getHours())}:${pad(start.getMinutes())}-${pad(
        end.getHours(),
      )}:${pad(end.getMinutes())}`;
    return buckets.map((bucket) => {
      const left = dateToOffset(bucket.start, timeWindow, pxPerHour);
      const width =
        dateToOffset(bucket.end, timeWindow, pxPerHour) - left;
      const worstCurve =
        bucket.worst.curves.find((curve) => curve.state === bucket.state) ??
        bucket.worst.curves[0];
      const style: React.CSSProperties = { left, width };
      if (bucket.state === "under") {
        // Deficit intensity scales with the shortfall.
        style.opacity = Math.min(0.95, 0.45 + bucket.shortfall * 0.18);
      }
      return (
        <div
          aria-hidden="true"
          className={`chrona-sched__coverage-cell chrona-sched__coverage-cell--${bucket.state}`}
          key={bucket.start.getTime()}
          style={style}
          title={coverageTitle(bucket, formatRange)}
        >
          {width >= 18 && worstCurve
            ? `${worstCurve.scheduled}/${worstCurve.min}`
            : null}
        </div>
      );
    });
  };

  const displayEntries = React.useMemo<readonly DisplayEntry[]>(() => {
    const entries: DisplayEntry[] = [];
    let cursor = 0;

    const eventsByResource = new Map<string, SchedulerUiEvent[]>();
    for (const event of events) {
      const bucket = eventsByResource.get(event.resourceId);
      if (bucket) {
        bucket.push(event);
      } else {
        eventsByResource.set(event.resourceId, [event]);
      }
    }

    const laneBuckets = new Map<string, SchedulerUiEvent[]>();
    for (const event of unscheduledEvents ?? []) {
      const key = groupValue(event.groups, primarySet);
      const bucket = laneBuckets.get(key);
      if (bucket) {
        bucket.push(event);
      } else {
        laneBuckets.set(key, [event]);
      }
    }

    const pushLane = (bucket: readonly SchedulerUiEvent[]): void => {
      const packed = packEventLanes(bucket, timeWindow, pxPerHour);
      if (packed.events.length === 0) {
        return;
      }
      const row: TimelineRowLayout = {
        events: packed.events,
        laneCount: packed.laneCount,
        resource: { id: "__lane__", name: "" },
      };
      const height = row.laneCount * laneRowHeight;
      entries.push({ height, kind: "lane", row, top: cursor });
      cursor += height;
    };

    const pushRow = (resource: SchedulerResource): void => {
      const packed = packEventLanes(
        eventsByResource.get(resource.id) ?? [],
        timeWindow,
        pxPerHour,
      );
      const row: TimelineRowLayout = {
        events: packed.events,
        laneCount: packed.laneCount,
        resource,
      };
      const height = row.laneCount * config.rowHeight;
      entries.push({ height, kind: "row", row, top: cursor });
      cursor += height;
    };

    if (!groupingEnabled) {
      if (demand && demand.length > 0) {
        entries.push({ height: groupHeaderHeight, kind: "coverage", top: cursor });
        cursor += groupHeaderHeight;
      }
      pushLane([...laneBuckets.values()].flat());
      for (const resource of resources) {
        pushRow(resource);
      }
      return entries;
    }

    for (const group of buildResourceGroups(resources, effectiveGroupBy)) {
      entries.push({
        collapseKey: group.name,
        depth: 0,
        groupName: group.name,
        height: groupHeaderHeight,
        kind: "header",
        memberCount: group.subgroups.reduce(
          (count, subgroup) => count + subgroup.members.length,
          0,
        ),
        top: cursor,
      });
      cursor += groupHeaderHeight;
      if (collapsedGroups.has(group.name)) {
        continue;
      }
      pushLane(laneBuckets.get(group.name) ?? []);
      for (const subgroup of group.subgroups) {
        if (subgroup.name !== undefined) {
          const key = groupCollapseKey(group.name, subgroup.name);
          entries.push({
            collapseKey: key,
            depth: 1,
            groupName: subgroup.name,
            height: groupHeaderHeight,
            kind: "header",
            memberCount: subgroup.members.length,
            top: cursor,
          });
          cursor += groupHeaderHeight;
          if (collapsedGroups.has(key)) {
            continue;
          }
        }
        for (const resource of subgroup.members) {
          pushRow(resource);
        }
      }
    }
    return entries;
  }, [
    resources,
    events,
    timeWindow,
    pxPerHour,
    config.rowHeight,
    demand,
    groupingEnabled,
    effectiveGroupBy,
    primarySet,
    collapsedGroups,
    unscheduledEvents,
  ]);

  const rows = React.useMemo(
    () =>
      displayEntries
        .filter((entry) => entry.kind === "row" && entry.row)
        .map((entry) => entry.row as TimelineRowLayout),
    [displayEntries],
  );

  const geometry = React.useMemo(
    () => ({
      pxPerHour: pxPerHour,
      // Ruled 2026-09-26: a drag snaps to the visible slot.
      snapMinutes: resolution.slotMinutes,
      window: timeWindow,
    }),
    [pxPerHour, resolution.slotMinutes, timeWindow],
  );

  const pointerToCanvas = React.useCallback(
    (
      clientX: number,
      clientY: number,
    ): { left: number; resourceId: string | undefined } => {
      const outer = scrollRef.current;
      if (!outer) {
        return { left: 0, resourceId: undefined };
      }
      const rect = outer.getBoundingClientRect();
      const left = clientX - rect.left + outer.scrollLeft - labelColumnWidth;
      const y = clientY - rect.top + outer.scrollTop - headerHeight;
      let resourceId: string | undefined;
      for (const entry of displayEntries) {
        if (y >= entry.top && y < entry.top + entry.height) {
          resourceId = entry.kind === "row" ? entry.row?.resource.id : undefined;
          break;
        }
      }
      return { left, resourceId };
    },
    [displayEntries, headerHeight, labelColumnWidth],
  );

  const autoScroll = React.useCallback((clientX: number): void => {
    const outer = scrollRef.current;
    if (!outer) {
      return;
    }
    const rect = outer.getBoundingClientRect();
    // Only pan while the pointer is inside the timeline itself; approaching
    // from outside (e.g. dragging out of the unscheduled panel) must not
    // move the canvas under the pointer.
    if (clientX < rect.left || clientX > rect.right) {
      return;
    }
    if (clientX > rect.right - autoScrollZonePx) {
      outer.scrollLeft += autoScrollStepPx;
    } else if (
      clientX > rect.left + labelColumnWidth &&
      clientX < rect.left + labelColumnWidth + autoScrollZonePx
    ) {
      outer.scrollLeft -= autoScrollStepPx;
    }
  }, [labelColumnWidth]);

  const groupPartners = React.useCallback(
    (session: DragSessionType): readonly SchedulerUiEvent[] => {
      const source = session.sourceEvent;
      if (
        session.kind !== "move" ||
        !source ||
        !selection.has(source.id) ||
        selection.size < 2
      ) {
        return [];
      }
      return events.filter(
        (candidate) =>
          selection.has(candidate.id) && candidate.id !== source.id,
      );
    },
    [events, selection],
  );

  const processUp = React.useCallback(
    (upEvent: PointerEvent, session: DragSessionType): void => {
      setPreview(undefined);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      const pointer = pointerToCanvas(upEvent.clientX, upEvent.clientY);
      const result = computeDragResult(session, pointer, geometry);
      if (!result) {
        return;
      }
      if (session.kind === "create") {
        // A create drag only proposes a draft, and only when the pointer
        // actually traveled - a plain click must never conjure an item.
        if (pointerMovedRef.current) {
          onDraftRange?.(result);
        }
        return;
      }
      if (
        session.sourceEvent &&
        session.kind !== "assign" &&
        !pointerMovedRef.current
      ) {
        return;
      }
      if (
        session.sourceEvent &&
        session.kind !== "assign" &&
        !dragResultChangesEvent(session.sourceEvent, result)
      ) {
        return;
      }
      /*
       * Assign drops must be real drags released over the canvas. A
       * plain click on a panel item starts an assign session too, and
       * an unbounded release used to hit-test THROUGH the panel into
       * whatever row/time aligned with the pointer - scheduling the
       * item at a nonsense slot, often outside the visible window.
       */
      if (session.kind === "assign") {
        if (!pointerMovedRef.current) {
          return;
        }
        const rect = scrollRef.current?.getBoundingClientRect();
        if (
          !rect ||
          upEvent.clientX < rect.left + labelColumnWidth ||
          upEvent.clientX > rect.right ||
          upEvent.clientY < rect.top ||
          upEvent.clientY > rect.bottom
        ) {
          return;
        }
      }
      const partners = groupPartners(session);
      if (session.sourceEvent && partners.length > 0) {
        const group = buildGroupChanges(
          session.sourceEvent,
          result,
          partners,
          validateChange,
        );
        if (group.blocked) {
          return;
        }
        if (onEventsChange) {
          onEventsChange(group.changes);
        } else {
          for (const change of group.changes) {
            onEventChange?.(change);
          }
        }
        return;
      }
      const verdict =
        validateChange?.(session.sourceEvent, result) ?? allowVerdict;
      if (verdict.kind === "block") {
        return;
      }
      onEventChange?.({ event: session.sourceEvent, result, verdict });
    },
    [
      pointerToCanvas,
      geometry,
      validateChange,
      onEventChange,
      onEventsChange,
      onDraftRange,
      groupPartners,
    ],
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
    /*
     * Panel assign sessions start outside this component, so the
     * movement anchor is stale and gets seeded lazily from the first
     * move event. Lane sessions (preserveTime) start on our own
     * bars: their pointerdown anchor is fresh and must survive, or a
     * single decisive move would never arm the drop.
     */
    if (
      session.kind === "assign" &&
      !session.preserveTime &&
      seededSessionRef.current !== session
    ) {
      seededSessionRef.current = session;
      pointerMovedRef.current = false;
      pointerDownLeftRef.current = Number.NaN;
      pointerDownTopRef.current = Number.NaN;
    }

    const handleMove = (moveEvent: PointerEvent): void => {
      if (Number.isNaN(pointerDownLeftRef.current)) {
        pointerDownLeftRef.current = moveEvent.clientX;
      }
      if (Number.isNaN(pointerDownTopRef.current)) {
        pointerDownTopRef.current = moveEvent.clientY;
      }
      // Either axis counts: a lane drag is a deliberate VERTICAL
      // move (row changes, time stays), so x-only tracking would
      // never arm the drop.
      pointerMovedRef.current =
        pointerMovedRef.current ||
        Math.abs(moveEvent.clientX - pointerDownLeftRef.current) >
          dragStartThresholdPx ||
        Math.abs(moveEvent.clientY - pointerDownTopRef.current) >
          dragStartThresholdPx;
      autoScroll(moveEvent.clientX);
      const pointer = pointerToCanvas(moveEvent.clientX, moveEvent.clientY);
      const result = computeDragResult(session, pointer, geometry);
      if (!result) {
        setPreview(undefined);
        return;
      }
      const partners = groupPartners(session);
      if (session.sourceEvent && partners.length > 0) {
        const group = buildGroupChanges(
          session.sourceEvent,
          result,
          partners,
          validateChange,
        );
        const worst =
          group.blocked ??
          group.changes.find((change) => change.verdict.kind === "warn")
            ?.verdict ??
          allowVerdict;
        setPreview({
          groupCount: group.changes.length,
          result,
          verdict: worst,
        });
        return;
      }
      const verdict =
        validateChange?.(session.sourceEvent, result) ?? allowVerdict;
      setPreview({ groupCount: 1, result, verdict });
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
  }, [drag, geometry, pointerToCanvas, autoScroll, validateChange, groupPartners]);

  const handleBarPointerDown = (
    downEvent: React.PointerEvent<HTMLElement>,
    event: SchedulerUiEvent,
    barLeft: number,
    barWidth: number,
  ): void => {
    if (!editable || downEvent.button !== 0) {
      return;
    }
    if (isDragLocked(event)) {
      // Pinned items still take focus/selection but never start a drag.
      // Record the down position so the click handler can tell a real
      // click from an attempted (ignored) drag - no session tracks
      // movement here.
      scrollRef.current?.focus({ preventScroll: true });
      pointerMovedRef.current = false;
      pointerDownLeftRef.current = downEvent.clientX;
      pointerDownTopRef.current = downEvent.clientY;
      return;
    }
    downEvent.preventDefault();
    downEvent.stopPropagation();
    scrollRef.current?.focus({ preventScroll: true });
    pointerMovedRef.current = false;
    pointerDownLeftRef.current = downEvent.clientX;
    pointerDownTopRef.current = downEvent.clientY;
    const rect = downEvent.currentTarget.getBoundingClientRect();
    const withinBar = downEvent.clientX - rect.left;
    // Time-locked shifts drag by row only: no resize sessions.
    const resizable = !isTimeLocked(event);
    if (
      resizable &&
      withinBar <= resizeZoneWidth &&
      barWidth > resizeZoneWidth * 3
    ) {
      drag.begin(beginResizeSession(event, "start"));
      return;
    }
    if (
      withinBar >= rect.width - resizeZoneWidth &&
      barWidth > resizeZoneWidth * 3
    ) {
      drag.begin(beginResizeSession(event, "end"));
      return;
    }
    const pointer = pointerToCanvas(downEvent.clientX, downEvent.clientY);
    void barLeft;
    drag.begin(beginMoveSession(event, pointer.left, geometry));
  };

  const buildHourDraft = React.useCallback(
    (clientX: number, clientY: number): DragResult | undefined => {
      const pointer = pointerToCanvas(clientX, clientY);
      if (!pointer.resourceId) {
        return undefined;
      }
      const start = snapDate(
        offsetToDate(pointer.left, timeWindow, pxPerHour),
        resolution.slotMinutes,
      );
      return {
        end: new Date(start.getTime() + 3_600_000),
        resourceId: pointer.resourceId,
        start,
      };
    },
    [pointerToCanvas, timeWindow, pxPerHour, resolution.slotMinutes],
  );

  const handleCanvasPointerDown = (
    downEvent: React.PointerEvent<HTMLDivElement>,
  ): void => {
    if (!editable || downEvent.button !== 0) {
      return;
    }
    if (
      (downEvent.target as HTMLElement).closest(
        ".chrona-sched__bar, .chrona-sched__lane-bar",
      )
    ) {
      return;
    }
    scrollRef.current?.focus({ preventScroll: true });
    pointerMovedRef.current = false;
    pointerDownLeftRef.current = downEvent.clientX;
    pointerDownTopRef.current = downEvent.clientY;
    // Clicking empty canvas clears the selection (Outlook behavior).
    if (!downEvent.ctrlKey && !downEvent.metaKey && !downEvent.shiftKey) {
      applySelection([]);
    }
    const pointer = pointerToCanvas(downEvent.clientX, downEvent.clientY);
    if (!pointer.resourceId) {
      return;
    }
    // Long press without movement proposes a one-hour draft (touch path).
    const downX = downEvent.clientX;
    const downY = downEvent.clientY;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (!pointerMovedRef.current) {
        drag.end();
        const draft = buildHourDraft(downX, downY);
        if (draft) {
          onDraftRange?.(draft);
        }
      }
    }, 500);
    drag.begin(beginCreateSession(pointer.left, geometry));
  };

  const handleCanvasDoubleClick = (
    clickEvent: React.MouseEvent<HTMLDivElement>,
  ): void => {
    if (!editable) {
      return;
    }
    if ((clickEvent.target as HTMLElement).closest(".chrona-sched__bar")) {
      return;
    }
    const draft = buildHourDraft(clickEvent.clientX, clickEvent.clientY);
    if (draft) {
      onDraftRange?.(draft);
    }
  };

  const selectable = React.useMemo(() => flattenSelectableEvents(rows), [rows]);

  const applySelection = React.useCallback(
    (ids: readonly string[], anchorId?: string): void => {
      if (anchorId !== undefined) {
        selectionAnchorRef.current = anchorId;
      }
      onSelectionChange?.(ids);
    },
    [onSelectionChange],
  );

  const handleBarSelect = React.useCallback(
    (event: SchedulerUiEvent, modifiers: { ctrl: boolean; shift: boolean }): void => {
      if (modifiers.shift) {
        // Range in flattened row-then-time order from the anchor.
        const anchorId = selectionAnchorRef.current;
        const anchorIndex = selectable.findIndex(
          (candidate) => candidate.id === anchorId,
        );
        const targetIndex = selectable.findIndex(
          (candidate) => candidate.id === event.id,
        );
        if (anchorIndex >= 0 && targetIndex >= 0) {
          const [from, to] =
            anchorIndex <= targetIndex
              ? [anchorIndex, targetIndex]
              : [targetIndex, anchorIndex];
          applySelection(
            selectable.slice(from, to + 1).map((candidate) => candidate.id),
          );
          return;
        }
        applySelection([event.id], event.id);
        return;
      }
      if (modifiers.ctrl) {
        const next = new Set(selection);
        if (next.has(event.id)) {
          next.delete(event.id);
        } else {
          next.add(event.id);
        }
        applySelection([...next], event.id);
        return;
      }
      applySelection([event.id], event.id);
    },
    [selectable, selection, applySelection],
  );

  const selectedEvents = React.useMemo(
    () => selectable.filter((candidate) => selection.has(candidate.id)),
    [selectable, selection],
  );

  const handleKeyDown = (keyEvent: React.KeyboardEvent<HTMLDivElement>): void => {
    if (selectable.length === 0) {
      return;
    }
    // The focused item is the anchor when set, else the first selected.
    const focusId = selectionAnchorRef.current ?? selectedEvents[0]?.id;
    const currentIndex = selectable.findIndex(
      (candidate) => candidate.id === focusId && selection.has(candidate.id),
    );

    if (keyEvent.key === "ArrowRight" || keyEvent.key === "ArrowDown") {
      keyEvent.preventDefault();
      const next =
        selectable[Math.min(currentIndex + 1, selectable.length - 1)] ??
        selectable[0];
      if (next) {
        applySelection([next.id], next.id);
      }
      return;
    }
    if (keyEvent.key === "ArrowLeft" || keyEvent.key === "ArrowUp") {
      keyEvent.preventDefault();
      const previous =
        currentIndex <= 0 ? selectable[0] : selectable[currentIndex - 1];
      if (previous) {
        applySelection([previous.id], previous.id);
      }
      return;
    }
    if (keyEvent.key === "Enter" && selectedEvents.length === 1) {
      keyEvent.preventDefault();
      const only = selectedEvents[0];
      if (only) {
        onOpenEvent?.(only);
      }
      return;
    }
    if (
      (keyEvent.key === "Delete" || keyEvent.key === "Backspace") &&
      selectedEvents.length > 0
    ) {
      keyEvent.preventDefault();
      // Pins protect against deletion too; unpin first.
      const deletable = selectedEvents.filter((event) => !isDeleteLocked(event));
      if (deletable.length === 0) {
        return;
      }
      if (deletable.length > 1 && onDeleteEvents) {
        onDeleteEvents(deletable);
      } else {
        for (const event of deletable) {
          onDeleteEvent?.(event);
        }
      }
      applySelection([]);
    }
  };

  const previewByRow = (resourceId: string): DragPreview | undefined =>
    preview && preview.result.resourceId === resourceId ? preview : undefined;

  const boundaryOffsets = React.useMemo(
    () =>
      (props.periodBoundaries ?? [])
        .filter(
          (boundary) =>
            boundary >= timeWindow.start && boundary <= timeWindow.end,
        )
        .map((boundary) =>
          dateToOffset(boundary, timeWindow, pxPerHour),
        ),
    [pxPerHour, props.periodBoundaries, timeWindow],
  );
  const nowOffset =
    now && now >= timeWindow.start && now <= timeWindow.end
      ? dateToOffset(now, timeWindow, pxPerHour)
      : undefined;

  const virtualRange = React.useMemo(
    () => computeVisibleEntryRange(displayEntries, scrollTop, viewportHeight),
    [displayEntries, scrollTop, viewportHeight],
  );
  const visibleEntries = React.useMemo(
    () => displayEntries.slice(virtualRange.startIndex, virtualRange.endIndex),
    [displayEntries, virtualRange.startIndex, virtualRange.endIndex],
  );

  return (
    <div className="chrona-sched__timeline-wrap">
    <div
      aria-label={strings.timelineLabel}
      aria-rowcount={displayEntries.length}
      className="chrona-sched__timeline"
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
      ref={scrollRef}
      role="grid"
      tabIndex={0}
    >
      <div
        className="chrona-sched__timeline-grid"
        style={{
          gridTemplateColumns: `${labelColumnWidth}px 1fr`,
          minWidth: canvasWidth + labelColumnWidth,
        }}
      >
        <div className="chrona-sched__corner" />
        <div
          className="chrona-sched__axis"
          style={{ height: headerHeight, width: canvasWidth }}
        >
          {showWeekBand ? (
            <div className="chrona-sched__axis-weeks">
              {weekSpans.map((span) => (
                <div
                  className="chrona-sched__axis-cell chrona-sched__tick chrona-sched__tick--week"
                  key={span.left}
                  style={{ width: span.width }}
                >
                  {/* Sticky: a week cell can be wider than the viewport. */}
                  <span
                    className="chrona-sched__tick-label"
                    style={{ left: labelColumnWidth + 8 }}
                  >
                    {span.label}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="chrona-sched__axis-days">
            {dayCells.map((cell) => (
              <div
                className={[
                  "chrona-sched__axis-cell chrona-sched__tick--day",
                  wideDays ? "chrona-sched__tick--day-wide" : "",
                  isSameDay(cell.date, todayStart) ? "chrona-sched__axis-cell--today" : "",
                ].join(" ").trim()}
                key={cell.date.getTime()}
                style={{ width: dayWidth }}
              >
                {wideDays ? (
                  // Sticky, like the week band: a wide day keeps its date in view while scrolling.
                  <span className="chrona-sched__tick-label" style={{ left: labelColumnWidth + 8 }}>
                    {formatDayLabelToFit(cell.date, dayWidth, dateNames)}
                  </span>
                ) : (
                  formatDayLabelToFit(cell.date, dayWidth, dateNames)
                )}
              </div>
            ))}
          </div>
          {dailyLabels ? null : (
            <div className="chrona-sched__axis-times">
              {timeCells.map((cell) => (
                <div
                  className="chrona-sched__axis-cell chrona-sched__tick"
                  key={cell.date.getTime()}
                  style={{ width: (resolution.labelMinutes / 60) * pxPerHour }}
                >
                  {formatHourLabel(cell.date, hourFormat)}
                </div>
              ))}
            </div>
          )}
        </div>

        {virtualRange.topSpacer > 0 ? (
          <div
            aria-hidden="true"
            style={{
              gridColumn: "1 / -1",
              height: virtualRange.topSpacer,
            }}
          />
        ) : null}
        {visibleEntries.map((entry) => {
          if (entry.kind === "header") {
            const groupName = entry.groupName ?? "Other";
            const collapseKey = entry.collapseKey ?? groupName;
            const isCollapsed = collapsedGroups.has(collapseKey);
            const headerClass =
              entry.depth === 1
                ? "chrona-sched__group-label chrona-sched__group-label--sub"
                : "chrona-sched__group-label";
            return (
              <React.Fragment key={`header-${collapseKey}`}>
                <button
                  aria-expanded={!isCollapsed}
                  className={headerClass}
                  onClick={() =>
                    setCollapsedGroups((previous) => {
                      const next = new Set(previous);
                      if (next.has(collapseKey)) {
                        next.delete(collapseKey);
                      } else {
                        next.add(collapseKey);
                      }
                      return next;
                    })
                  }
                  style={{ height: groupHeaderHeight }}
                  type="button"
                >
                  <span aria-hidden="true">{isCollapsed ? "▸" : "▾"}</span>{" "}
                  {groupName === UNGROUPED ? strings.ungrouped : groupName} ({entry.memberCount})
                </button>
                <div
                  className="chrona-sched__group-canvas"
                  style={{ height: groupHeaderHeight, width: canvasWidth }}
                >
                  {entry.depth === 0
                    ? renderCoverageCells(coverageByGroup?.get(entry.groupName))
                    : null}
                </div>
              </React.Fragment>
            );
          }

          if (entry.kind === "coverage") {
            return (
              <React.Fragment key="coverage-strip">
                <div
                  className="chrona-sched__coverage-label"
                  style={{ height: groupHeaderHeight }}
                >
                  {strings.coverage}
                </div>
                <div
                  className="chrona-sched__group-canvas"
                  style={{ height: groupHeaderHeight, width: canvasWidth }}
                >
                  {renderCoverageCells(coverageByGroup?.get(undefined))}
                </div>
              </React.Fragment>
            );
          }

          if (entry.kind === "lane" && entry.row) {
            const lane = entry.row;
            const laneHeight = lane.laneCount * laneRowHeight;
            return (
              <React.Fragment key={`lane-${entry.top}`}>
                <div
                  className="chrona-sched__lane-label"
                  style={{ height: laneHeight }}
                >
                  {formatString(strings.unscheduledLaneLabel, {
                    count: lane.events.length,
                  })}
                </div>
                <div
                  className="chrona-sched__lane-canvas"
                  data-testid="unscheduled-lane"
                  style={{ height: laneHeight, width: canvasWidth }}
                >
                  {nowOffset !== undefined ? (
                    <div
                      className="chrona-sched__now"
                      style={{ left: nowOffset }}
                    />
                  ) : null}
                  {boundaryOffsets.map((offset) => (
                    <div
                      className="chrona-sched__period-boundary"
                      key={`lane-boundary-${offset}`}
                      style={{ left: offset }}
                    />
                  ))}
                  {lane.events.map((positioned) => (
                    <button
                      aria-haspopup="menu"
                      aria-label={[
                        positioned.event.title,
                        formatTimeRange(
                          positioned.event.start,
                          positioned.event.end,
                        ),
                        ...(positioned.event.requiredTags ?? []),
                      ].join(", ")}
                      className="chrona-sched__lane-bar"
                      data-event-id={positioned.event.id}
                      key={positioned.event.id}
                      onPointerDown={(downEvent) => {
                        if (!editable || downEvent.button !== 0) {
                          return;
                        }
                        pointerMovedRef.current = false;
                        pointerDownLeftRef.current = downEvent.clientX;
                        pointerDownTopRef.current = downEvent.clientY;
                        drag.begin(
                          beginLaneAssignSession(positioned.event),
                        );
                      }}
                      style={{
                        left: positioned.left,
                        top: positioned.lane * laneRowHeight + 5,
                        width: positioned.width,
                      }}
                      type="button"
                    >
                      <span className="chrona-sched__lane-bar-title">
                        {positioned.event.title}
                      </span>
                      <span className="chrona-sched__bar-time">
                        {formatTimeRange(
                          positioned.event.start,
                          positioned.event.end,
                        )}
                      </span>
                      {(positioned.event.requiredTags ?? []).map((tag) => {
                        const pill = tagPillStyle(tag, tagColors);
                        return (
                          <span
                            className={
                              pill
                                ? "chrona-sched__tag chrona-sched__tag--colored"
                                : "chrona-sched__tag"
                            }
                            key={tag}
                            style={pill}
                          >
                            {tag}
                          </span>
                        );
                      })}
                    </button>
                  ))}
                </div>
              </React.Fragment>
            );
          }

          const row = entry.row;
          if (!row) {
            return null;
          }
          const rowHeight = row.laneCount * config.rowHeight;
          const rowPreview = previewByRow(row.resource.id);
          const assignActive = drag.session?.kind === "assign";
          const sessionMismatch =
            drag.session &&
            (drag.session.kind === "assign" || drag.session.kind === "move")
              ? missingRequiredTags(
                  row.resource,
                  drag.session.sourceEvent?.requiredTags,
                ).length > 0
              : false;
          const rowCanvasClasses = [
            "chrona-sched__row-canvas",
            assignActive && !sessionMismatch
              ? "chrona-sched__row-canvas--droppable"
              : "",
            assignActive && rowPreview
              ? "chrona-sched__row-canvas--drop-hover"
              : "",
            sessionMismatch ? "chrona-sched__row-canvas--mismatch" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <React.Fragment key={row.resource.id}>
              <div
                className="chrona-sched__resource-label"
                style={{ height: rowHeight }}
              >
                <span className="chrona-sched__resource-name">
                  {row.resource.name}
                  {row.resource.capacityHours !== undefined ? (
                    <span className="chrona-sched__resource-load">
                      {assignedHours(events, row.resource.id, timeWindow)}/
                      {row.resource.capacityHours}h
                    </span>
                  ) : null}
                </span>
                {row.resource.tags && row.resource.tags.length > 0 ? (
                  <span
                    className="chrona-sched__resource-tags"
                    title={row.resource.tags.join(", ")}
                  >
                    {row.resource.tags.map((tag) => {
                      const pill = tagPillStyle(tag, tagColors);
                      const note = row.resource.tagNotes?.[tag];
                      return (
                        <span
                          className={tagClassName(
                            pill !== undefined,
                            note !== undefined,
                          )}
                          key={tag}
                          style={
                            note
                              ? { ...pill, borderColor: "var(--csui-warn)" }
                              : pill
                          }
                          title={note}
                        >
                          {tag}
                        </span>
                      );
                    })}
                  </span>
                ) : null}
              </div>
              <div
                className={rowCanvasClasses}
                onDoubleClick={handleCanvasDoubleClick}
                onPointerDown={handleCanvasPointerDown}
                role="row"
                style={{ height: rowHeight, width: canvasWidth }}
              >
                <div
                  aria-hidden="true"
                  className="chrona-sched__row-grid"
                  style={rowGridBackground}
                />
                {todayColumn ? (
                  <div
                    aria-hidden="true"
                    className="chrona-sched__today-col"
                    style={{
                      left: todayColumn.left,
                      width: todayColumn.width,
                    }}
                  />
                ) : null}
                {decorations
                  ? decorationsForResource(decorations, row.resource.id).map(
                      (decoration, decorationIndex) => {
                        const clampedStart = Math.max(
                          decoration.start.getTime(),
                          timeWindow.start.getTime(),
                        );
                        const clampedEnd = Math.min(
                          decoration.end.getTime(),
                          timeWindow.end.getTime(),
                        );
                        if (clampedEnd <= clampedStart) {
                          return null;
                        }
                        const left = dateToOffset(
                          new Date(clampedStart),
                          timeWindow,
                          pxPerHour,
                        );
                        const width =
                          dateToOffset(
                            new Date(clampedEnd),
                            timeWindow,
                            pxPerHour,
                          ) - left;
                        return (
                          <div
                            className={`chrona-sched__decoration chrona-sched__decoration--${decoration.kind}`}
                            key={`${decoration.kind}-${decorationIndex}-${clampedStart}`}
                            style={{ left, width }}
                            title={decoration.label}
                          />
                        );
                      },
                    )
                  : null}
                {nowOffset !== undefined ? (
                  <div
                    className="chrona-sched__now"
                    style={{ left: nowOffset }}
                  />
                ) : null}
                {boundaryOffsets.map((offset) => (
                  <div
                    className="chrona-sched__period-boundary"
                    key={`boundary-${offset}`}
                    style={{ left: offset }}
                  />
                ))}
                {row.events.map((positioned) => {
                  const isDragSource =
                    drag.session?.sourceEvent?.id === positioned.event.id;
                  const isPinned = isLocked(positioned.event);
                  const clipStart =
                    positioned.event.start.getTime() <
                    timeWindow.start.getTime();
                  const clipEnd =
                    positioned.event.end.getTime() > timeWindow.end.getTime();
                  const barClasses = [
                    "chrona-sched__bar",
                    positioned.event.status === "needsCover"
                      ? "chrona-sched__bar--needs-cover"
                      : "",
                    selection.has(positioned.event.id)
                      ? "chrona-sched__bar--selected"
                      : "",
                    isDragSource ? "chrona-sched__bar--drag-source" : "",
                    editable && !isPinned ? "chrona-sched__bar--editable" : "",
                    isPinned ? "chrona-sched__bar--pinned" : "",
                    positioned.event.flag ? "chrona-sched__bar--flagged" : "",
                    positioned.event.review === "proposed"
                      ? "chrona-sched__bar--proposed"
                      : "",
                    positioned.event.review === "ghost"
                      ? "chrona-sched__bar--ghost"
                      : "",
                    clipStart ? "chrona-sched__bar--clip-start" : "",
                    clipEnd ? "chrona-sched__bar--clip-end" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const barLabel = [
                    positioned.event.title,
                    formatTimeRange(
                      positioned.event.start,
                      positioned.event.end,
                    ),
                    ...(positioned.event.requiredTags ?? []),
                    ...normalizeGaps(positioned.event).map(
                      (gap) => gap.label ?? "break",
                    ),
                    ...(isPinned ? ["pinned"] : []),
                  ].join(", ");
                  return (
                    <button
                      aria-label={barLabel}
                      aria-selected={selection.has(positioned.event.id)}
                      className={barClasses}
                      data-event-id={positioned.event.id}
                      disabled={positioned.event.review === "ghost"}
                      key={positioned.event.id}
                      onClick={(clickEvent) => {
                        const travelled = Math.abs(
                          clickEvent.clientX - pointerDownLeftRef.current,
                        );
                        if (
                          !pointerMovedRef.current &&
                          (Number.isNaN(travelled) ||
                            travelled <= dragStartThresholdPx)
                        ) {
                          handleBarSelect(positioned.event, {
                            ctrl: clickEvent.ctrlKey || clickEvent.metaKey,
                            shift: clickEvent.shiftKey,
                          });
                          onEventClick?.(positioned.event);
                        }
                      }}
                      onPointerDown={(downEvent) =>
                        handleBarPointerDown(
                          downEvent,
                          positioned.event,
                          positioned.left,
                          positioned.width,
                        )
                      }
                      role="gridcell"
                      style={{
                        background:
                          positioned.event.review === "ghost"
                            ? undefined
                            : resolveEventColor(
                                positioned.event,
                                statusColorRules,
                              ),
                        height: config.rowHeight - 8,
                        left: positioned.left,
                        top: positioned.lane * config.rowHeight + 4,
                        width: positioned.width,
                      }}
                      type="button"
                    >
                      {gapFractions(positioned.event).map((fraction) => (
                        <span
                          className="chrona-sched__bar-gap"
                          key={fraction.gap.start.getTime()}
                          style={{
                            left: `${fraction.startFraction * 100}%`,
                            width: `${
                              (fraction.endFraction - fraction.startFraction) *
                              100
                            }%`,
                          }}
                          title={[
                            fraction.gap.label,
                            formatTimeRange(fraction.gap.start, fraction.gap.end),
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        />
                      ))}
                      {editable && !isPinned && positioned.width > 30 ? (
                        <span
                          aria-hidden="true"
                          className="chrona-sched__bar-handle chrona-sched__bar-handle--start"
                          onPointerDown={(downEvent) => {
                            if (downEvent.button !== 0) {
                              return;
                            }
                            downEvent.preventDefault();
                            downEvent.stopPropagation();
                            scrollRef.current?.focus({ preventScroll: true });
                            pointerMovedRef.current = false;
                            pointerDownLeftRef.current = downEvent.clientX;
                            pointerDownTopRef.current = downEvent.clientY;
                            drag.begin(
                              beginResizeSession(positioned.event, "start"),
                            );
                          }}
                        />
                      ) : null}
                      {clipStart ? (
                        <span
                          aria-hidden="true"
                          className="chrona-sched__bar-clip chrona-sched__bar-clip--start"
                        >
                          ‹
                        </span>
                      ) : null}
                      {isPinned ? <PinGlyph /> : null}
                      {positioned.event.flag ? (
                        <FlagGlyph
                          title={flagReasonText(strings, positioned.event.flag)}
                        />
                      ) : null}
                      <span>{positioned.event.title}</span>
                      <span className="chrona-sched__bar-time">
                        {formatTimeRange(
                          positioned.event.start,
                          positioned.event.end,
                        )}
                      </span>
                      {clipEnd ? (
                        <span
                          aria-hidden="true"
                          className="chrona-sched__bar-clip chrona-sched__bar-clip--end"
                        >
                          ›
                        </span>
                      ) : null}
                      {editable && !isPinned && positioned.width > 30 ? (
                        <span
                          aria-hidden="true"
                          className="chrona-sched__bar-handle chrona-sched__bar-handle--end"
                          onPointerDown={(downEvent) => {
                            if (downEvent.button !== 0) {
                              return;
                            }
                            downEvent.preventDefault();
                            downEvent.stopPropagation();
                            scrollRef.current?.focus({ preventScroll: true });
                            pointerMovedRef.current = false;
                            pointerDownLeftRef.current = downEvent.clientX;
                            pointerDownTopRef.current = downEvent.clientY;
                            drag.begin(
                              beginResizeSession(positioned.event, "end"),
                            );
                          }}
                        />
                      ) : null}
                    </button>
                  );
                })}
                {draftRange && draftRange.resourceId === row.resource.id ? (
                  <div
                    className="chrona-sched__preview chrona-sched__preview--allow chrona-sched__preview--draft"
                    style={{
                      height: config.rowHeight - 8,
                      left: dateToOffset(
                        draftRange.start,
                        timeWindow,
                        pxPerHour,
                      ),
                      top: 4,
                      width: Math.max(
                        dateToOffset(
                          draftRange.end,
                          timeWindow,
                          pxPerHour,
                        ) -
                          dateToOffset(
                            draftRange.start,
                            timeWindow,
                            pxPerHour,
                          ),
                        4,
                      ),
                    }}
                  >
                    <span>{strings.draftItem}</span>
                  </div>
                ) : null}
                {rowPreview ? (
                  <div
                    className={`chrona-sched__preview chrona-sched__preview--${rowPreview.verdict.kind}`}
                    style={{
                      height: config.rowHeight - 8,
                      left: dateToOffset(
                        rowPreview.result.start,
                        timeWindow,
                        pxPerHour,
                      ),
                      top: 4,
                      width: Math.max(
                        dateToOffset(
                          rowPreview.result.end,
                          timeWindow,
                          pxPerHour,
                        ) -
                          dateToOffset(
                            rowPreview.result.start,
                            timeWindow,
                            pxPerHour,
                          ),
                        4,
                      ),
                    }}
                  >
                    <span>
                      {formatTimeRange(
                        rowPreview.result.start,
                        rowPreview.result.end,
                      )}
                    </span>
                    {rowPreview.groupCount > 1 ? (
                      <span className="chrona-sched__preview-count">
                        x{rowPreview.groupCount}
                      </span>
                    ) : null}
                    {rowPreview.verdict.reason ? (
                      <span className="chrona-sched__preview-reason">
                        {rowPreview.verdict.reason}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
        {virtualRange.bottomSpacer > 0 ? (
          <div
            aria-hidden="true"
            style={{
              gridColumn: "1 / -1",
              height: virtualRange.bottomSpacer,
            }}
          />
        ) : null}
      </div>
      {resources.length === 0 ? (
        // Sibling of the wide grid, not a child: a block here is as wide
        // as the scrollport (not the canvas), and sticky keeps it in view
        // however far the axis is scrolled.
        <div className="chrona-sched__empty chrona-sched__empty--pinned">
          {strings.emptyResources}
        </div>
      ) : null}
    </div>
    {onLabelColumnWidthChange ? (
      <VerticalSplitter
        ariaLabel={strings.resizeResources}
        defaultValue={defaultLabelColumnWidth}
        max={labelColumnMaxWidth}
        min={labelColumnMinWidth}
        onChange={onLabelColumnWidthChange}
        style={{ left: labelColumnWidth - 3 }}
        toWidth={(clientX) =>
          clientX -
          (scrollRef.current?.getBoundingClientRect().left ?? 0)
        }
        value={labelColumnWidth}
      />
    ) : null}
    </div>
  );
}
