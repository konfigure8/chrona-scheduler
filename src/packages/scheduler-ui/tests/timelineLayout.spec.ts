import { layoutTimeline, layoutTimelineRow } from "../src/timelineLayout";
import type {
  SchedulerResource,
  SchedulerUiEvent,
  TimeWindow,
} from "../src/types";

const window: TimeWindow = {
  end: new Date(2026, 7, 18, 0, 0),
  start: new Date(2026, 7, 17, 0, 0),
};

const resource: SchedulerResource = { id: "r-1", name: "Alex Chen" };

function buildEvent(
  id: string,
  startHour: number,
  endHour: number,
  overrides?: Partial<SchedulerUiEvent>,
): SchedulerUiEvent {
  return {
    end: new Date(2026, 7, 17, endHour, 0),
    id,
    resourceId: "r-1",
    start: new Date(2026, 7, 17, startHour, 0),
    status: "assigned",
    title: id,
    ...overrides,
  };
}

function stacksOverlappingEventsIntoLanes(): void {
  const row = layoutTimelineRow(
    resource,
    [
      buildEvent("a", 6, 14),
      buildEvent("b", 12, 20),
      buildEvent("c", 14, 22),
    ],
    window,
    60,
  );

  assertEqual(row.laneCount, 2);
  const byId = new Map(row.events.map((entry) => [entry.event.id, entry]));
  assertEqual(byId.get("a")?.lane, 0);
  assertEqual(byId.get("b")?.lane, 1);
  assertEqual(byId.get("c")?.lane, 0);
  assertEqual(byId.get("a")?.left, 360);
  assertEqual(byId.get("a")?.width, 480);
}

function clampsBarsToTheVisibleWindow(): void {
  const row = layoutTimelineRow(
    resource,
    [
      {
        ...buildEvent("early", 0, 2),
        start: new Date(2026, 7, 16, 20, 0),
      },
    ],
    window,
    60,
  );

  const bar = row.events[0];
  if (!bar) {
    throw new Error("Expected a positioned bar");
  }
  assertEqual(bar.left, 0);
  assertEqual(bar.width, 120);
}

function excludesEventsOutsideTheWindowAndOtherResources(): void {
  const rows = layoutTimeline(
    [resource, { id: "r-2", name: "Riley Patel" }],
    [
      buildEvent("mine", 6, 10),
      buildEvent("other", 6, 10, { id: "other", resourceId: "r-2" }),
      buildEvent("outside", 6, 10, {
        end: new Date(2026, 7, 19, 10, 0),
        id: "outside",
        start: new Date(2026, 7, 19, 6, 0),
      }),
    ],
    window,
    60,
  );

  assertEqual(rows.length, 2);
  assertEqual(rows[0]?.events.length, 1);
  assertEqual(rows[0]?.events[0]?.event.id, "mine");
  assertEqual(rows[1]?.events.length, 1);
  assertEqual(rows[1]?.events[0]?.event.id, "other");
  assertEqual(rows[1]?.laneCount, 1);
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

stacksOverlappingEventsIntoLanes();
clampsBarsToTheVisibleWindow();
excludesEventsOutsideTheWindowAndOtherResources();

console.log("timelineLayout tests passed");
