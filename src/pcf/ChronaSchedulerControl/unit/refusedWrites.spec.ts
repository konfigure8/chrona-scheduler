/*
 * A write Dataverse refused puts the row back as Dataverse holds it, on the
 * board and in the undo history, so the board shows only what is saved and
 * Undo never writes a change that was not saved.
 */
import assert from "node:assert/strict";
import { putBackHistory, putBackRows } from "../SchedulerControl/refusedWrites";

interface Row {
  readonly id: string;
  readonly start: number;
}
interface Entry {
  readonly after: readonly Row[];
  readonly before: readonly Row[];
}

const a: Row = { id: "a", start: 9 };
const b: Row = { id: "b", start: 10 };
const movedA: Row = { id: "a", start: 11 };
const movedB: Row = { id: "b", start: 12 };

// One row moved and refused: the board shows it where it was, and the step that made the move is gone.
{
  const before = [a, b];
  const after = [movedA, b];
  const history = { redoStack: [], undoStack: [{ after, before }] as Entry[] };
  assert.deepEqual(putBackRows(after, { saved: a, shown: movedA }), [a, b]);
  assert.equal(putBackRows(after, { saved: a, shown: movedA })[0], a);
  assert.deepEqual(putBackHistory(history, { saved: a, shown: movedA }), { redoStack: [], undoStack: [] });
}

// Two rows moved, one refused: that row goes back, the step keeps the move that was saved.
{
  const before = [a, b];
  const after = [movedA, movedB];
  const older: Entry = { after: before, before: [a, { id: "b", start: 8 }] };
  const history = { redoStack: [], undoStack: [older, { after, before }] };
  const fixed = putBackHistory(history, { saved: b, shown: movedB });
  assert.equal(fixed.undoStack.length, 2);
  assert.equal(fixed.undoStack[0], older);
  assert.deepEqual(fixed.undoStack[1], { after: [movedA, b], before: [a, b] });
  assert.deepEqual(putBackRows(after, { saved: b, shown: movedB }), [movedA, b]);
}

// A refused Undo: the row stays as Dataverse holds it, and the step it would have undone is not left to redo.
{
  const entry: Entry = { after: [movedA, b], before: [a, b] };
  const history = { redoStack: [entry], undoStack: [] };
  const shownByUndo = [a, b];
  assert.deepEqual(putBackRows(shownByUndo, { saved: movedA, shown: a }), [movedA, b]);
  assert.deepEqual(putBackHistory(history, { saved: movedA, shown: a }), { redoStack: [], undoStack: [] });
}

// A row changed again since its refused write is left alone: its own write decides it.
{
  const again: Row = { id: "a", start: 13 };
  const rows = [again, b];
  assert.equal(putBackRows(rows, { saved: a, shown: movedA }), rows);
}

// A state update made its rows twice: the step holds a copy of the row shown, and it goes all the same.
{
  const copy: Row = { ...movedA };
  const history = { redoStack: [], undoStack: [{ after: [copy, b], before: [a, b] }] as Entry[] };
  assert.deepEqual(putBackHistory(history, { saved: a, shown: movedA }), { redoStack: [], undoStack: [] });
  assert.equal(putBackRows([copy, b], { saved: a, shown: movedA })[0], a);
}

console.log("refused writes tests passed");
