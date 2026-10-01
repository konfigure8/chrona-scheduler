import * as React from "react";

import { useDragController } from "./dragContext";
import { VerticalSplitter } from "./Splitter";
import { FlagGlyph } from "./FlagGlyph";
import { flagReasonText } from "./stringResources";
import { useSchedulerStrings } from "./strings";
import { tagPillStyle, type TagColorMap } from "./tagColors";
import { beginAssignSession } from "./interactions";
import { dateNamesFrom, formatDayLabel } from "./dateNames";
import { eventIntersectsWindow } from "./timelineLayout";
import type { SchedulerUiEvent, TimeWindow } from "./types";

export type UnscheduledFilter = "all" | "window";

export interface UnscheduledPanelProps {
  readonly events: readonly SchedulerUiEvent[];
  /** "window" lists only items intersecting the visible window. */
  readonly filter?: UnscheduledFilter;
  /** Renders the All / In view toggle; the host persists the choice. */
  readonly onFilterChange?: (filter: UnscheduledFilter) => void;
  /** Active primary grouping set; buckets the list like the board. */
  readonly groupSet?: string;
  /** Renders the header dismiss; the host persists the visibility. */
  readonly onClose?: () => void;
  /** Plain click (no drag): hosts navigate the calendar to the item. */
  readonly onItemClick?: (event: SchedulerUiEvent) => void;
  /** Renders the left-edge splitter; the host owns and persists the width. */
  readonly onWidthChange?: (width: number) => void;
  /** Maker-configured colors for skill/tag pills. */
  readonly tagColors?: TagColorMap;
  readonly title?: string;
  /** Panel width in px; user-resizable when the callback is set. */
  readonly width?: number;
  /** Visible window, required for the "window" filter to apply. */
  readonly window?: TimeWindow;
}

const defaultPanelWidth = 200;
/** The bucket key for rows with no dates; never a group name a host sends. */
const UNDATED_GROUP = "chrona:undated";
const panelMinWidth = 160;
const panelMaxWidth = 480;

function formatTimeRange(event: SchedulerUiEvent): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${pad(event.start.getHours())}:${pad(event.start.getMinutes())}-${pad(event.end.getHours())}:${pad(event.end.getMinutes())}`;
}

function formatDuration(event: SchedulerUiEvent): string {
  const minutes = Math.round(
    (event.end.getTime() - event.start.getTime()) / 60_000,
  );
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${rest}m`;
}

/**
 * Open/unassigned work. Drag an item onto a matching row to assign it; the
 * drop goes through the same validateChange verdict seam as any edit, and
 * items carry the same context menu and hover card as scheduled events.
 */
export function UnscheduledPanel(props: UnscheduledPanelProps): JSX.Element {
  const drag = useDragController();
  const strings = useSchedulerStrings();
  const {
    events,
    filter = "all",
    onFilterChange,
    onItemClick,
    onWidthChange,
    tagColors,
    groupSet,
    title = strings.unscheduledTitle,
    width,
  } = props;
  const windowFilterActive = filter === "window" && props.window !== undefined;
  const visibleEvents = React.useMemo(
    () =>
      windowFilterActive && props.window
        ? events.filter((event) => eventIntersectsWindow(event, props.window as TimeWindow))
        : events,
    [events, windowFilterActive, props.window],
  );
  const panelWidth = width ?? defaultPanelWidth;
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  // Groups collapse like resource groups on the canvas.
  const [collapsedGroups, setCollapsedGroups] = React.useState<
    ReadonlySet<string>
  >(new Set());
  const toggleGroup = (name: string): void => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };
  const pointerDownRef = React.useRef<{ x: number; y: number } | undefined>(
    undefined,
  );

  /*
   * Items bucket by the event's organizational group in first-seen
   * order; ungrouped items trail without a header, and undated rows
   * close the list under their own header. Cross-group drop policy is
   * the host's rule via validateChange, not a panel wall.
   */
  const groups = React.useMemo(() => {
    const order: (string | undefined)[] = [];
    const buckets = new Map<string | undefined, SchedulerUiEvent[]>();
    for (const event of visibleEvents) {
      const key = event.undated
        ? UNDATED_GROUP
        : groupSet
          ? event.groups?.[groupSet]
          : undefined;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(event);
      } else {
        buckets.set(key, [event]);
        order.push(key);
      }
    }
    // Ungrouped trail the named groups; undated rows come last.
    const rank = (key: string | undefined): number =>
      key === UNDATED_GROUP ? 2 : key === undefined ? 1 : 0;
    order.sort((first, second) => rank(first) - rank(second));
    return order.map((name) => ({
      items: buckets.get(name) ?? [],
      label: name === UNDATED_GROUP ? strings.noDate : name,
      name,
    }));
  }, [visibleEvents, groupSet, strings.noDate]);

  return (
    <div className="chrona-sched__unscheduled-wrap" ref={panelRef}>
    {onWidthChange ? (
      <VerticalSplitter
        ariaLabel={strings.resizeUnscheduled}
        className="chrona-sched__splitter--panel"
        defaultValue={defaultPanelWidth}
        max={panelMaxWidth}
        min={panelMinWidth}
        onChange={onWidthChange}
        toWidth={(clientX) =>
          (panelRef.current?.getBoundingClientRect().right ?? 0) - clientX
        }
        value={panelWidth}
      />
    ) : null}
    <aside
      aria-label={title}
      className="chrona-sched__unscheduled"
      style={{ flex: `0 0 ${panelWidth}px`, width: panelWidth }}
    >
      <h3 className="chrona-sched__unscheduled-title">
        {title} ({visibleEvents.length})
        {props.onClose ? (
          <button
            aria-label={strings.hideUnscheduledPanel}
            className="chrona-sched__panel-close"
            data-testid="panel-close"
            onClick={props.onClose}
            type="button"
          >
            ×
          </button>
        ) : null}
      </h3>
      {onFilterChange && props.window ? (
        <div
          aria-label={strings.unscheduledFilterLabel}
          className="chrona-sched__unscheduled-filter"
          role="group"
        >
          <button
            aria-pressed={!windowFilterActive}
            className="chrona-sched__unscheduled-filter-option"
            onClick={() => onFilterChange("all")}
            type="button"
          >
            {strings.unscheduledAll}
          </button>
          <button
            aria-pressed={windowFilterActive}
            className="chrona-sched__unscheduled-filter-option"
            onClick={() => onFilterChange("window")}
            type="button"
          >
            {strings.unscheduledInView}
          </button>
        </div>
      ) : null}
      {visibleEvents.length === 0 ? (
        <p className="chrona-sched__unscheduled-empty">
          {windowFilterActive && events.length > 0
            ? strings.unscheduledEmptyInView
            : strings.unscheduledEmpty}
        </p>
      ) : null}
      {groups.map((group) => (
      <React.Fragment key={group.name ?? "__ungrouped__"}>
      {group.name !== undefined ? (
        <h4 className="chrona-sched__unscheduled-group">
          <button
            aria-expanded={!collapsedGroups.has(group.name)}
            className="chrona-sched__unscheduled-group-toggle"
            onClick={() => toggleGroup(group.name as string)}
            type="button"
          >
            <span aria-hidden="true" className="chrona-sched__unscheduled-caret">
              &#9662;
            </span>
            {group.label} ({group.items.length})
          </button>
        </h4>
      ) : null}
      {group.name !== undefined && collapsedGroups.has(group.name) ? null : (
      <ul className="chrona-sched__unscheduled-list">
        {group.items.map((event) => (
          <li key={event.id}>
            <button
              aria-label={`${event.title}, ${event.undated ? strings.noDate : formatTimeRange(event)}, ${formatDuration(event)}`}
              className={`${
                drag.session?.sourceEvent?.id === event.id
                  ? "chrona-sched__unscheduled-item chrona-sched__unscheduled-item--dragging"
                  : "chrona-sched__unscheduled-item"
              }${event.flag ? " chrona-sched__unscheduled-item--flagged" : ""}`}
              data-event-id={event.id}
              onClick={(clickEvent) => {
                const down = pointerDownRef.current;
                if (
                  down &&
                  Math.abs(clickEvent.clientX - down.x) <= 4 &&
                  Math.abs(clickEvent.clientY - down.y) <= 4
                ) {
                  onItemClick?.(event);
                }
              }}
              onPointerDown={(downEvent) => {
                if (downEvent.button !== 0) {
                  return;
                }
                downEvent.preventDefault();
                pointerDownRef.current = {
                  x: downEvent.clientX,
                  y: downEvent.clientY,
                };
                drag.begin(beginAssignSession(event));
              }}
              type="button"
            >
              <span className="chrona-sched__unscheduled-head">
                {event.flag ? (
                  <FlagGlyph title={flagReasonText(strings, event.flag)} />
                ) : null}
                <span className="chrona-sched__unscheduled-name">
                  {event.title}
                </span>
                <span className="chrona-sched__unscheduled-duration">
                  {formatDuration(event)}
                </span>
              </span>
              {event.undated ? (
                <span className="chrona-sched__unscheduled-time">{strings.noDate}</span>
              ) : (
                <span className="chrona-sched__unscheduled-time">
                  <span className="chrona-sched__unscheduled-date">
                    {formatDayLabel(event.start, dateNamesFrom(strings))}
                  </span>{" "}
                  {formatTimeRange(event)}
                </span>
              )}
              {event.requiredTags && event.requiredTags.length > 0 ? (
                <span className="chrona-sched__unscheduled-tags">
                  {event.requiredTags.map((tag) => {
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
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      )}
      </React.Fragment>
      ))}
    </aside>
    </div>
  );
}
