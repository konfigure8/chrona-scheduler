import { dateToOffset } from "./timeAxis";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  TimeWindow,
} from "./types";

export interface PositionedTimelineEvent {
  readonly event: SchedulerUiEvent;
  readonly lane: number;
  readonly left: number;
  readonly width: number;
}

export interface TimelineRowLayout {
  readonly events: readonly PositionedTimelineEvent[];
  readonly laneCount: number;
  readonly resource: SchedulerResource;
}

const minimumBarWidth = 4;

export function eventIntersectsWindow(
  event: SchedulerUiEvent,
  window: TimeWindow,
): boolean {
  return (
    event.start.getTime() < window.end.getTime() &&
    event.end.getTime() > window.start.getTime()
  );
}

export interface PackedLanes {
  readonly events: readonly PositionedTimelineEvent[];
  readonly laneCount: number;
}

/**
 * Greedy lane packing: events sorted by start fill the first lane whose last
 * event ends at or before this event's start. Overlapping events stack into
 * additional lanes so nothing is hidden. Offsets are along the time axis in
 * pixels - horizontal for the timeline, vertical for top-down/day views.
 */
export function packEventLanes(
  events: readonly SchedulerUiEvent[],
  window: TimeWindow,
  pxPerHour: number,
): PackedLanes {
  const visible = events
    .filter((event) => eventIntersectsWindow(event, window))
    .sort((first, second) => first.start.getTime() - second.start.getTime());

  const laneEnds: number[] = [];
  const positioned: PositionedTimelineEvent[] = [];

  for (const event of visible) {
    let lane = laneEnds.findIndex(
      (laneEnd) => laneEnd <= event.start.getTime(),
    );
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = event.end.getTime();

    const clampedStart = Math.max(
      event.start.getTime(),
      window.start.getTime(),
    );
    const clampedEnd = Math.min(event.end.getTime(), window.end.getTime());
    const left = dateToOffset(new Date(clampedStart), window, pxPerHour);
    const right = dateToOffset(new Date(clampedEnd), window, pxPerHour);

    positioned.push({
      event,
      lane,
      left,
      width: Math.max(right - left, minimumBarWidth),
    });
  }

  return {
    events: positioned,
    laneCount: Math.max(laneEnds.length, 1),
  };
}

export function layoutTimelineRow(
  resource: SchedulerResource,
  events: readonly SchedulerUiEvent[],
  window: TimeWindow,
  pxPerHour: number,
): TimelineRowLayout {
  const packed = packEventLanes(
    events.filter((event) => event.resourceId === resource.id),
    window,
    pxPerHour,
  );
  return {
    events: packed.events,
    laneCount: packed.laneCount,
    resource,
  };
}

export function layoutTimeline(
  resources: readonly SchedulerResource[],
  events: readonly SchedulerUiEvent[],
  window: TimeWindow,
  pxPerHour: number,
): readonly TimelineRowLayout[] {
  return resources.map((resource) =>
    layoutTimelineRow(resource, events, window, pxPerHour),
  );
}
