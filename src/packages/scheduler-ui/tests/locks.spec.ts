import {
  buildOffsetChanges,
  buildReassignChanges,
} from "../src/interactions";
import {
  isDeleteLocked,
  isDragLocked,
  isLocked,
  isResourceLocked,
  isTimeLocked,
  resolveLock,
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

function pinnedStillMeansBoth(): void {
  // Back-compat matters more than elegance here: hosts already write
  // `pinned`, and it has to keep behaving exactly as it did.
  assertEqual(resolveLock(event("a", { pinned: true })), "both");
  assertEqual(resolveLock(event("b", { pinned: false })), undefined);
  assertEqual(resolveLock(event("c")), undefined);
  const legacy = event("d", { pinned: true });
  assertEqual(isTimeLocked(legacy), true, "pinned blocks time");
  assertEqual(isResourceLocked(legacy), true, "pinned blocks resource");
  assertEqual(isDragLocked(legacy), true, "pinned blocks drag");
  assertEqual(isDeleteLocked(legacy), true, "pinned blocks delete");
}

function lockWinsOverPinned(): void {
  const conflicting = event("e", { lock: "time", pinned: true });
  assertEqual(resolveLock(conflicting), "time");
  assertEqual(isResourceLocked(conflicting), false);
}

function partialLocksFreezeOneDimensionEach(): void {
  const resourceLocked = event("f", { lock: "resource" });
  assertEqual(isResourceLocked(resourceLocked), true, "resource frozen");
  assertEqual(isTimeLocked(resourceLocked), false, "time free");

  const timeLocked = event("g", { lock: "time" });
  assertEqual(isTimeLocked(timeLocked), true, "time frozen");
  assertEqual(isResourceLocked(timeLocked), false, "resource free");

  // Any lock still refuses deletion; since 2026-08-22 partial locks
  // DRAG along their free axis (computeDragResult pins the locked
  // dimension), so only a full lock refuses the drag outright.
  for (const partial of [resourceLocked, timeLocked]) {
    assertEqual(isLocked(partial), true);
    assertEqual(isDeleteLocked(partial), true);
    assertEqual(isDragLocked(partial), false);
  }
  assertEqual(isDragLocked(event("h", { lock: "both" })), true);
}

function offsetMovesResourceLockedButNotTimeLocked(): void {
  // "Move to..." changes times only, so "must be Maria, whenever" travels.
  const events = [
    event("free"),
    event("resource-locked", { lock: "resource" }),
    event("time-locked", { lock: "time" }),
    event("legacy-pinned", { pinned: true }),
  ];
  const outcome = buildOffsetChanges(
    events,
    { amount: 1, direction: 1, unit: "days" },
    undefined,
  );
  const moved = outcome.changes.map((change) => change.event?.id).sort();
  assertEqual(moved.join(","), "free,resource-locked");
  const movedFree = outcome.changes.find(
    (change) => change.event?.id === "free",
  );
  assertEqual(movedFree?.result.start.getDate(), 22, "shifted a day later");
}

function reassignMovesTimeLockedButNotResourceLocked(): void {
  // "Reassign to..." changes the assignee only, so "9am is promised,
  // anyone can take it" reassigns.
  const events = [
    event("free"),
    event("resource-locked", { lock: "resource" }),
    event("time-locked", { lock: "time" }),
    event("legacy-pinned", { pinned: true }),
  ];
  const outcome = buildReassignChanges(events, "r-morgan", undefined);
  const moved = outcome.changes.map((change) => change.event?.id).sort();
  assertEqual(moved.join(","), "free,time-locked");
  const reassigned = outcome.changes.find(
    (change) => change.event?.id === "time-locked",
  );
  assertEqual(reassigned?.result.resourceId, "r-morgan");
  assertEqual(
    reassigned?.result.start.getHours(),
    9,
    "reassign keeps the promised time",
  );
}

pinnedStillMeansBoth();
lockWinsOverPinned();
partialLocksFreezeOneDimensionEach();
offsetMovesResourceLockedButNotTimeLocked();
reassignMovesTimeLockedButNotResourceLocked();

console.log("locks tests passed");
