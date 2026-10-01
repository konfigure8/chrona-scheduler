import {
  buildMonthMatrix,
  eventsForDay,
  groupEventsByDay,
} from "../src/monthLayout";
import { packEventLanes } from "../src/timelineLayout";
import type { SchedulerUiEvent, TimeWindow } from "../src/types";

function buildEvent(
  id: string,
  dayOffset: number,
  startHour: number,
  endHour: number,
): SchedulerUiEvent {
  return {
    end: new Date(2026, 7, 17 + dayOffset, endHour, 0),
    id,
    resourceId: "r-1",
    start: new Date(2026, 7, 17 + dayOffset, startHour, 0),
    status: "assigned",
    title: id,
  };
}

function buildsMondayFirstAugustMatrix(): void {
  // August 2026: the 1st is a Saturday, the 31st is a Monday.
  const weeks = buildMonthMatrix(new Date(2026, 7, 15));
  assertEqual(weeks.length, 6);
  const firstCell = weeks[0]?.[0];
  assertEqual(firstCell?.date.getDay(), 1);
  assertEqual(firstCell?.inMonth, false);
  assertEqual(firstCell?.date.getDate(), 27);
  const lastWeek = weeks[weeks.length - 1];
  assertEqual(lastWeek?.[0]?.date.getDate(), 31);
  assertEqual(lastWeek?.[0]?.inMonth, true);
}

function dropsWeekendColumnsWhenHidden(): void {
  const weeks = buildMonthMatrix(new Date(2026, 7, 15), false);
  for (const week of weeks) {
    assertEqual(week.length, 5);
    assertEqual(
      week.every((cell) => !cell.isWeekend),
      true,
    );
  }
}

function bucketsEventsIntoDays(): void {
  const events = [
    buildEvent("a", 0, 6, 14),
    buildEvent("b", 0, 15, 22),
    buildEvent("c", 1, 9, 17),
  ];
  assertEqual(eventsForDay(events, new Date(2026, 7, 17)).length, 2);
  assertEqual(eventsForDay(events, new Date(2026, 7, 18)).length, 1);
  assertEqual(eventsForDay(events, new Date(2026, 7, 19)).length, 0);
}

function groupsAgendaByDaySorted(): void {
  const groups = groupEventsByDay([
    buildEvent("late", 1, 15, 22),
    buildEvent("early", 1, 6, 14),
    buildEvent("solo", 0, 9, 17),
  ]);
  assertEqual(groups.length, 2);
  assertEqual(groups[0]?.events[0]?.id, "solo");
  assertEqual(groups[1]?.events[0]?.id, "early");
  assertEqual(groups[1]?.events[1]?.id, "late");
  assertEqual(groups[0]?.label.includes("17"), true);
}

function packsLanesForVerticalColumns(): void {
  const window: TimeWindow = {
    end: new Date(2026, 7, 18, 0, 0),
    start: new Date(2026, 7, 17, 0, 0),
  };
  const packed = packEventLanes(
    [buildEvent("a", 0, 6, 14), buildEvent("b", 0, 12, 20)],
    window,
    48,
  );
  assertEqual(packed.laneCount, 2);
  assertEqual(packed.events[0]?.left, 6 * 48);
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

buildsMondayFirstAugustMatrix();
dropsWeekendColumnsWhenHidden();
bucketsEventsIntoDays();
groupsAgendaByDaySorted();
packsLanesForVerticalColumns();

console.log("monthLayout tests passed");
