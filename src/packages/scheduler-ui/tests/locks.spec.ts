import {
  buildOffsetChanges,
  buildReassignChanges,
  computeCellDropResult,
} from "../src/interactions";
import {
  isDeleteLocked,
  isDragLocked,
  isPinned,
  showsPin,
  withPin,
} from "../src/locks";
import type { SchedulerUiEvent } from "../src/types";

function assertEqual<T>(actual: T, expected: T, label = ""): void {
  if (actual !== expected) {
    throw new Error(
      `${label} expected ${String(expected)} but received ${String(actual)}`,
    );
  }
}

function event(
  id: string,
  overrides: Partial<SchedulerUiEvent> = {},
): SchedulerUiEvent {
  return {
    end: new Date(2026, 7, 21, 17, 0),
    id,
    resourceId: "r-alice",
    start: new Date(2026, 7, 21, 9, 0),
    status: "assigned",
    title: id,
    ...overrides,
  };
}

// A pin holds the shift's time and date and its person; there is no
// lock in between (Matt 2026-09-30 and 2026-10-04).
function aPinHoldsEverything(): void {
  const pinned = event("a", { pinned: true });
  assertEqual(isPinned(pinned), true, "pinned");
  assertEqual(isDragLocked(pinned), true, "a pin blocks drag and resize");
  assertEqual(isDeleteLocked(pinned), true, "a pin blocks delete and unschedule");
  assertEqual(showsPin(pinned), true, "a pin shows the mark");
  for (const free of [event("b", { pinned: false }), event("c")]) {
    assertEqual(isPinned(free), false, "free");
    assertEqual(isDragLocked(free), false, "free drags");
    assertEqual(isDeleteLocked(free), false, "free deletes");
    assertEqual(showsPin(free), false, "free shows no mark");
  }
}

// Unpin leaves every shift free, a generated one included.
function unpinLeavesTheShiftFree(): void {
  const origin = {
    dateKey: "2026-08-21",
    generated: { end: "", start: "", tags: [], title: "g" },
    slotId: "slot",
    templateId: "template",
  };
  const generated = withPin(event("d", { origin }), true);
  assertEqual(isPinned(generated), true, "pinned");
  const unpinned = withPin(generated, false);
  assertEqual(isPinned(unpinned), false, "generated: free after Unpin");
  assertEqual(unpinned.pinned, undefined, "no pin left behind");
}

function groupActionsSkipPinnedMembers(): void {
  const events = [event("free"), event("pinned", { pinned: true })];
  const offset = buildOffsetChanges(events, { amount: 1, direction: 1, unit: "days" }, undefined);
  assertEqual(offset.changes.map((change) => change.event?.id).join(","), "free", "move skips the pin");
  assertEqual(offset.changes[0]?.result.start.getDate(), 22, "shifted a day later");
  const reassign = buildReassignChanges(events, "r-morgan", undefined);
  assertEqual(reassign.changes.map((change) => change.event?.id).join(","), "free", "reassign skips the pin");
  assertEqual(reassign.changes[0]?.result.resourceId, "r-morgan");
}

function aPinnedShiftNeverMovesOnACellDrop(): void {
  const pinned = event("pinned", { pinned: true });
  const result = computeCellDropResult(pinned, 2, "r-morgan");
  assertEqual(result.start.getTime(), pinned.start.getTime(), "same start");
  assertEqual(result.resourceId, "r-alice", "same person");
  const free = computeCellDropResult(event("free"), 2, "r-morgan");
  assertEqual(free.start.getDate(), 23, "free moves two days");
  assertEqual(free.resourceId, "r-morgan", "free changes person");
}

aPinHoldsEverything();
unpinLeavesTheShiftFree();
groupActionsSkipPinnedMembers();
aPinnedShiftNeverMovesOnACellDrop();

console.log("locks tests passed");
