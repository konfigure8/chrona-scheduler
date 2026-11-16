import * as assert from "node:assert/strict";

import {
  aggregateVerdict,
  boardEditing,
  beginAssignSession,
  beginLaneAssignSession,
  buildOffsetChanges,
  buildReassignChanges,
  beginCreateSession,
  beginMoveSession,
  beginResizeSession,
  buildGroupChanges,
  computeCellDropResult,
  computeDragResult,
  dragResultChangesEvent,
  hoverCardKeeps,
  refusesChange,
} from "../src/interactions";
import type { SchedulerUiEvent, TimeWindow } from "../src/types";

const window: TimeWindow = {
  end: new Date(2026, 7, 18, 0, 0),
  start: new Date(2026, 7, 17, 0, 0),
};

const geometry = { pxPerHour: 60, snapMinutes: 15, window };

const event: SchedulerUiEvent = {
  end: new Date(2026, 7, 17, 14, 0),
  id: "shift-1",
  resourceId: "r-1",
  start: new Date(2026, 7, 17, 6, 0),
  status: "assigned",
  title: "Shift",
};

function movePreservesDurationAndSnaps(): void {
  // Grab the bar 60px (1h) after its start, i.e. pointer at 07:00.
  const session = beginMoveSession(event, 7 * 60, geometry);
  // Pointer moves to 09:07 equivalent (9h7m * 60px/h) on resource r-2.
  const result = computeDragResult(
    session,
    { left: (9 + 7 / 60) * 60, resourceId: "r-2" },
    geometry,
  );
  if (!result) {
    throw new Error("Expected a move result");
  }
  assertEqual(result.start.getHours(), 8);
  assertEqual(result.start.getMinutes(), 0);
  assertEqual(result.end.getHours(), 16);
  assertEqual(result.resourceId, "r-2");
  assertEqual(dragResultChangesEvent(event, result), true);
}

function moveWithoutTargetRowKeepsResource(): void {
  const session = beginMoveSession(event, 6 * 60, geometry);
  const result = computeDragResult(
    session,
    { left: 7 * 60, resourceId: undefined },
    geometry,
  );
  assertEqual(result?.resourceId, "r-1");
}

function resizeEndSnapsAndEnforcesMinimum(): void {
  const session = beginResizeSession(event, "end");
  const grown = computeDragResult(
    session,
    { left: 16.2 * 60, resourceId: "r-1" },
    geometry,
  );
  assertEqual(grown?.end.getHours(), 16);
  assertEqual(grown?.end.getMinutes(), 15);
  assertEqual(grown?.start.getTime(), event.start.getTime());

  const collapsed = computeDragResult(
    session,
    { left: 2 * 60, resourceId: "r-1" },
    geometry,
  );
  if (!collapsed) {
    throw new Error("Expected a resize result");
  }
  assertEqual(collapsed.end.getTime() > event.start.getTime(), true);
}

function resizeStartCannotPassEnd(): void {
  const session = beginResizeSession(event, "start");
  const result = computeDragResult(
    session,
    { left: 20 * 60, resourceId: "r-1" },
    geometry,
  );
  if (!result) {
    throw new Error("Expected a resize result");
  }
  assertEqual(result.start.getTime() < event.end.getTime(), true);
  assertEqual(result.end.getTime(), event.end.getTime());
}

function createDragNormalizesDirection(): void {
  const session = beginCreateSession(10 * 60, geometry);
  const backwards = computeDragResult(
    session,
    { left: 8 * 60, resourceId: "r-3" },
    geometry,
  );
  if (!backwards) {
    throw new Error("Expected a create result");
  }
  assertEqual(backwards.start.getHours(), 8);
  assertEqual(backwards.end.getHours(), 10);
  assertEqual(backwards.resourceId, "r-3");

  const noRow = computeDragResult(
    session,
    { left: 8 * 60, resourceId: undefined },
    geometry,
  );
  assertEqual(noRow, undefined);
}

function assignKeepsDurationOnDropRow(): void {
  const openShift: SchedulerUiEvent = {
    ...event,
    id: "open-1",
    resourceId: "r-open",
    status: "needsCover",
  };
  const session = beginAssignSession(openShift);
  const result = computeDragResult(
    session,
    { left: 9 * 60, resourceId: "r-2" },
    geometry,
  );
  if (!result) {
    throw new Error("Expected an assign result");
  }
  assertEqual(result.resourceId, "r-2");
  assertEqual(
    result.end.getTime() - result.start.getTime(),
    openShift.end.getTime() - openShift.start.getTime(),
  );
}

function cellDropMovesWholeDaysAndReassigns(): void {
  const moved = computeCellDropResult(event, 2, "r-9");
  assertEqual(moved.start.getDate(), 19);
  assertEqual(moved.start.getHours(), 6);
  assertEqual(moved.end.getDate(), 19);
  assertEqual(moved.end.getHours(), 14);
  assertEqual(moved.resourceId, "r-9");

  const sameDayReassign = computeCellDropResult(event, 0, "r-2");
  assertEqual(sameDayReassign.start.getTime(), event.start.getTime());
  assertEqual(sameDayReassign.resourceId, "r-2");

  const backwards = computeCellDropResult(event, -1);
  assertEqual(backwards.start.getDate(), 16);
  assertEqual(backwards.resourceId, "r-1");
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function groupChangesShiftPartnersByDeltaOnTheirOwnRows(): void {
  const partner: SchedulerUiEvent = {
    ...event,
    id: "shift-2",
    resourceId: "r-9",
    start: new Date(2026, 7, 17, 9, 0),
    end: new Date(2026, 7, 17, 12, 0),
  };
  // Source moved +2h and onto another row.
  const result = {
    end: new Date(2026, 7, 17, 16, 0),
    resourceId: "r-2",
    start: new Date(2026, 7, 17, 8, 0),
  };
  const group = buildGroupChanges(event, result, [partner], undefined);
  assertEqual(group.blocked, undefined);
  assertEqual(group.changes.length, 2);
  // The dragged event takes its full result including the row change...
  assertEqual(group.changes[0]?.result.resourceId, "r-2");
  // ...partners shift by the same time delta but keep their row.
  assertEqual(group.changes[1]?.result.resourceId, "r-9");
  assertEqual(group.changes[1]?.result.start.getHours(), 11);
  assertEqual(group.changes[1]?.result.end.getHours(), 14);
}

function groupChangesBlockWhenAnyMemberBlocks(): void {
  const partner: SchedulerUiEvent = {
    ...event,
    id: "shift-2",
    start: new Date(2026, 7, 17, 9, 0),
    end: new Date(2026, 7, 17, 12, 0),
  };
  const result = {
    end: new Date(2026, 7, 17, 16, 0),
    resourceId: "r-1",
    start: new Date(2026, 7, 17, 8, 0),
  };
  const group = buildGroupChanges(event, result, [partner], (candidate) =>
    candidate?.id === "shift-2"
      ? { kind: "block", reason: "Partner blocked" }
      : { kind: "allow" },
  );
  assertEqual(group.blocked?.kind, "block");
  assertEqual(group.blocked?.reason, "Partner blocked");
  // The change list still reports every member for preview rendering.
  assertEqual(group.changes.length, 2);
}

function groupChangesSkipPinnedPartners(): void {
  const movable: SchedulerUiEvent = {
    ...event,
    id: "movable",
    start: new Date(2026, 7, 17, 9, 0),
    end: new Date(2026, 7, 17, 12, 0),
  };
  const pinnedPartner: SchedulerUiEvent = {
    ...event,
    id: "anchored",
    pinned: true,
    start: new Date(2026, 7, 17, 10, 0),
    end: new Date(2026, 7, 17, 13, 0),
  };
  const result = {
    end: new Date(2026, 7, 17, 16, 0),
    resourceId: "r-1",
    start: new Date(2026, 7, 17, 8, 0),
  };
  const group = buildGroupChanges(
    event,
    result,
    [movable, pinnedPartner],
    undefined,
  );
  // The pinned partner sits the move out entirely.
  assertEqual(group.changes.length, 2);
  assertEqual(
    group.changes.some((change) => change.event?.id === "anchored"),
    false,
  );
}

function groupChangesIgnoreSourceDuplicatedInPartners(): void {
  const result = {
    end: new Date(2026, 7, 17, 16, 0),
    resourceId: "r-1",
    start: new Date(2026, 7, 17, 8, 0),
  };
  const group = buildGroupChanges(event, result, [event], undefined);
  assertEqual(group.changes.length, 1);
}


function offsetChangesShiftByUnitAndSkipPinned(): void {
  const pinnedEvent: SchedulerUiEvent = { ...event, id: "anchored", pinned: true };
  const byHours = buildOffsetChanges(
    [event, pinnedEvent],
    { amount: 2, direction: 1, unit: "hours" },
    undefined,
  );
  assertEqual(byHours.changes.length, 1);
  assertEqual(byHours.changes[0]?.result.start.getHours(), 8);
  assertEqual(byHours.changes[0]?.result.end.getHours(), 16);
  assertEqual(byHours.changes[0]?.result.resourceId, "r-1");

  const byWeeks = buildOffsetChanges(
    [event],
    { amount: 1, direction: -1, unit: "weeks" },
    undefined,
  );
  assertEqual(byWeeks.changes[0]?.result.start.getDate(), 10);
  // Wall clock survives day arithmetic.
  assertEqual(byWeeks.changes[0]?.result.start.getHours(), 6);

  const blocked = buildOffsetChanges(
    [event],
    { amount: 1, direction: 1, unit: "days" },
    () => ({ kind: "block", reason: "No" }),
  );
  assertEqual(blocked.blocked?.kind, "block");
}

/*
 * BoardExtension takesBlockedChanges (Matt 2026-11-13, "Yes, add the switch"): without it the board refuses a blocked
 * change, as it always has; with it the change goes to the host with its block verdict. Allow and warn are never refused.
 */
/*
 * ShiftMark.action (Matt 2026-11-13, option A): a mark with an action keeps its hover card open for the pointer; with no
 * action, or no mark, the card is read-only and closes as the pointer leaves, as it always has.
 */
function aHoverCardKeepsOnlyForAMarkWithAnAction(): void {
  assertEqual(hoverCardKeeps(undefined), false);
  assertEqual(hoverCardKeeps({}), false);
  assertEqual(hoverCardKeeps({ action: { label: "See history", run: () => undefined } }), true);
}

/*
 * A board its host locked (a read that failed, Matt 2026-11-16 "Yes, both boards") takes no edit and carries the lock's
 * own sentence, so an extension's actions wait with it and never pose as a proposal under review. A proposal, a running
 * solve or its live view stop edits too, with no lock reason: their own state says why.
 */
function aLockedBoardSaysWhyAndIsNoReview(): void {
  const idle = { live: false, reviewing: false, solving: false };
  const locked = boardEditing({ ...idle, editable: false, lockReason: "Couldn't load the workers." });
  assert.equal(locked.canEdit, false, "a locked board takes no edit");
  assert.equal(locked.lockReason, "Couldn't load the workers.", "a locked board names its lock");
  const open = boardEditing({ ...idle, editable: true });
  assert.equal(open.canEdit, true, "an open board takes edits");
  assert.equal(open.lockReason, undefined, "an open board names no lock");
  // A lock reason without the lock is not a lock: the board stays editable and names none.
  assert.equal(boardEditing({ ...idle, lockReason: "Stale." }).lockReason, undefined, "no lock, no reason");
  for (const [label, state] of [
    ["a proposal", { ...idle, reviewing: true }],
    ["a running solve", { ...idle, solving: true }],
    ["a live view", { ...idle, live: true }],
  ] as const) {
    const stopped = boardEditing({ ...state, editable: true });
    assert.equal(stopped.canEdit, false, `${label} takes no edit`);
    assert.equal(stopped.lockReason, undefined, `${label} is no lock`);
  }
}

function blockedChangesRefusedUnlessTheHostTakesThem(): void {
  const block = { kind: "block" as const, reason: "On leave" };
  assertEqual(refusesChange(block, undefined), true);
  assertEqual(refusesChange(block, false), true);
  assertEqual(refusesChange(block, true), false);
  assertEqual(refusesChange({ kind: "warn", reason: "Short rest" }, undefined), false);
  assertEqual(refusesChange({ kind: "allow" }, undefined), false);
  assertEqual(refusesChange(undefined, undefined), false);
  // Reassign N: the blocked set is refused without the switch and handed on whole with it.
  const outcome = buildReassignChanges([event], "r-9", () => block);
  assertEqual(refusesChange(outcome.blocked, undefined), true);
  assertEqual(refusesChange(outcome.blocked, true), false);
  assertEqual(outcome.changes.map((change) => change.verdict.kind).join(","), "block");
}

function reassignChangesMoveRowsAndDropNoOps(): void {
  const alreadyThere: SchedulerUiEvent = { ...event, id: "same", resourceId: "r-9" };
  const pinnedEvent: SchedulerUiEvent = { ...event, id: "anchored", pinned: true };
  const outcome = buildReassignChanges(
    [event, alreadyThere, pinnedEvent],
    "r-9",
    undefined,
  );
  // The member already on r-9 and the pinned one drop out.
  assertEqual(outcome.changes.length, 1);
  assertEqual(outcome.changes[0]?.result.resourceId, "r-9");
  assertEqual(outcome.changes[0]?.result.start.getTime(), event.start.getTime());

  const blocked = buildReassignChanges([event], "r-9", () => ({
    kind: "block",
    reason: "Missing skill: X",
  }));
  assertEqual(blocked.blocked?.reason, "Missing skill: X");
}

function aggregateVerdictOrdersBlocksFirstAndKeepsAllResults(): void {
  const verdict = aggregateVerdict([
    {
      kind: "warn",
      reason: "Outside working hours (06:00‑22:00)",
      scope: "item",
    },
    { kind: "block", reason: "Missing skill: Kitchen", scope: "person" },
    { kind: "warn", reason: "Overlaps an existing shift", scope: "person" },
  ]);
  assertEqual(verdict.kind, "block");
  assertEqual(verdict.reason, "Missing skill: Kitchen");
  assertEqual(verdict.results?.length, 3);
  assertEqual(verdict.results?.[0]?.reason, "Missing skill: Kitchen");
  assertEqual(verdict.results?.[1]?.scope, "item");
}

function aggregateVerdictAllowsEmptyAndWarnsWithoutBlocks(): void {
  assertEqual(aggregateVerdict([]).kind, "allow");
  assertEqual(aggregateVerdict([]).results, undefined);
  const warned = aggregateVerdict([
    { kind: "warn", reason: "Overlaps an existing shift", scope: "person" },
  ]);
  assertEqual(warned.kind, "warn");
  assertEqual(warned.reason, "Overlaps an existing shift");
  assertEqual(warned.results?.length, 1);
}

// A pin holds time and person, so a drag result never changes it (the
// board refuses the drag before it starts; the result agrees).
function pinnedDragsChangeNothing(): void {
  const pinned: SchedulerUiEvent = { ...event, id: "pinned-1", pinned: true };
  const result = computeDragResult(
    beginMoveSession(pinned, 7 * 60, geometry),
    { left: 10 * 60, resourceId: "r-2" },
    geometry,
  );
  assertEqual(result?.start.getTime(), pinned.start.getTime());
  assertEqual(result?.end.getTime(), pinned.end.getTime());
  assertEqual(result?.resourceId, pinned.resourceId);
  const assign = computeDragResult(
    beginAssignSession(pinned),
    { left: 2 * 60, resourceId: "r-2" },
    geometry,
  );
  assertEqual(assign?.resourceId, pinned.resourceId);
  const cell = computeCellDropResult(pinned, 2, "r-2");
  assertEqual(cell.start.getTime(), pinned.start.getTime());
  assertEqual(cell.resourceId, pinned.resourceId);
}

// A generated shift is free like any other: it moves in time and row.
function generatedShiftsDragFreely(): void {
  const generated: SchedulerUiEvent = {
    ...event,
    id: "generated-1",
    origin: {
      dateKey: "2026-08-17",
      generated: { end: "", start: "", tags: [], title: "g" },
      slotId: "slot",
      templateId: "template",
    },
    resourceId: "open",
    status: "needsCover",
  };
  const result = computeDragResult(
    beginMoveSession(generated, 7 * 60, geometry),
    { left: 10 * 60, resourceId: "r-2" },
    geometry,
  );
  assertEqual(result?.resourceId, "r-2");
  assertEqual(result?.start.getHours(), generated.start.getHours() + 3);
}

cellDropMovesWholeDaysAndReassigns();
pinnedDragsChangeNothing();
generatedShiftsDragFreely();
aggregateVerdictOrdersBlocksFirstAndKeepsAllResults();
aggregateVerdictAllowsEmptyAndWarnsWithoutBlocks();
movePreservesDurationAndSnaps();
moveWithoutTargetRowKeepsResource();
function laneAssignPreservesTimeWhateverThePointerDoes(): void {
  const open: SchedulerUiEvent = {
    ...event,
    id: "open-1",
    resourceId: "r-open",
    status: "needsCover",
  };
  const session = beginLaneAssignSession(open);
  // Pointer wanders to 19:23 on Priya's row: the drop changes only
  // the person - a lane drag is a pure "who" gesture.
  const result = computeDragResult(
    session,
    { left: (19 + 23 / 60) * 60, resourceId: "r-priya" },
    geometry,
  );
  if (!result) {
    throw new Error("Expected a lane assign result");
  }
  assertEqual(result.start.getTime(), open.start.getTime());
  assertEqual(result.end.getTime(), open.end.getTime());
  assertEqual(result.resourceId, "r-priya");
}

laneAssignPreservesTimeWhateverThePointerDoes();
resizeEndSnapsAndEnforcesMinimum();
resizeStartCannotPassEnd();
createDragNormalizesDirection();
assignKeepsDurationOnDropRow();
groupChangesShiftPartnersByDeltaOnTheirOwnRows();
groupChangesBlockWhenAnyMemberBlocks();
groupChangesIgnoreSourceDuplicatedInPartners();
groupChangesSkipPinnedPartners();
offsetChangesShiftByUnitAndSkipPinned();
reassignChangesMoveRowsAndDropNoOps();
aHoverCardKeepsOnlyForAMarkWithAnAction();
blockedChangesRefusedUnlessTheHostTakesThem();
aLockedBoardSaysWhyAndIsNoReview();

console.log("interactions tests passed");
