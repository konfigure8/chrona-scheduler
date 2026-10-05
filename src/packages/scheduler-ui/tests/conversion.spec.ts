import { countOverlappingShifts, countUnscheduled } from "../src/conversion";
import type { SchedulerUiEvent } from "../src/types";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const at = (hour: number): Date => new Date(2026, 7, 17, hour, 0);

const shift = (
  id: string,
  resourceId: string,
  start: number,
  end: number,
  status: SchedulerUiEvent["status"] = "assigned",
): SchedulerUiEvent => ({
  end: at(end),
  id,
  resourceId,
  start: at(start),
  status,
  title: id,
});

// Distinct shifts involved in same-person overlaps; needsCover and
// cross-person overlaps never count; touching endpoints are not
// overlaps.
{
  const events = [
    shift("a", "r1", 9, 17),
    shift("b", "r1", 16, 20), // overlaps a
    shift("c", "r1", 20, 22), // touches b - no overlap
    shift("d", "r2", 9, 17), // other person
    shift("e", "r2", 9, 12), // overlaps d
    shift("f", "r-open", 9, 17, "needsCover"), // open work, never a conflict
    shift("g", "r3", 8, 10),
  ];
  assertEqual(countOverlappingShifts(events), 4, "involved shifts");
  assertEqual(countOverlappingShifts([]), 0, "empty");
  assertEqual(
    countOverlappingShifts([shift("solo", "r1", 9, 17)]),
    0,
    "no pair",
  );
}

// Unscheduled counts panel items plus on-board needs-cover rows.
{
  const board = [shift("a", "r1", 9, 17), shift("x", "r-open", 9, 13, "needsCover")];
  const panel = [shift("p1", "r-open", 14, 18, "needsCover")];
  assertEqual(countUnscheduled(board, panel), 2, "panel + board");
  assertEqual(countUnscheduled(board), 1, "board only");
  assertEqual(countUnscheduled([], []), 0, "none");
}

console.log("conversion tests passed");
