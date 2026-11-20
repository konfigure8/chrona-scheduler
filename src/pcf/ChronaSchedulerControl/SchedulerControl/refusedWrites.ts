/*
 * A write Dataverse refused leaves the row as Dataverse holds it, so the board
 * shows that row again: it shows only what is saved (AGENTS.md 0.1). The undo
 * history follows: every snapshot that held the refused row holds the saved
 * one instead, and a step that then changes nothing is taken away, so Undo and
 * Redo never write a change that was not saved.
 */
import type { UndoRedoState } from "@chrona/scheduler-ui";

/** One refused row: as Dataverse still holds it, and as the board showed it after the change. */
export interface RefusedRow<TEvent> {
  readonly saved: TEvent;
  readonly shown: TEvent;
}

interface Snapshot<TEvent> {
  readonly after: readonly TEvent[];
  readonly before: readonly TEvent[];
}

/**
 * The same row by value: each field the same value, a date the same instant, a list or an object
 * the same throughout. A state update may make its rows twice (React runs an updater again when it
 * re-renders), so a copy of the row shown counts.
 */
function sameRow(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameRow(item, b[index]));
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => sameRow(left[key], right[key]));
}

function swapped<TEvent>(rows: readonly TEvent[], refused: RefusedRow<TEvent>): readonly TEvent[] {
  return rows.some((row) => sameRow(row, refused.shown))
    ? rows.map((row) => (sameRow(row, refused.shown) ? refused.saved : row))
    : rows;
}

function changesNothing<TEvent>(entry: Snapshot<TEvent>): boolean {
  return entry.before.length === entry.after.length && entry.before.every((row, index) => sameRow(row, entry.after[index]));
}

/**
 * The board's rows with the refused row put back. A row changed again since
 * (no longer as shown) is left alone: its own write decides it.
 */
export function putBackRows<TEvent>(events: readonly TEvent[], refused: RefusedRow<TEvent>): readonly TEvent[] {
  return swapped(events, refused);
}

/** The undo history with the refused row put back in every step, less the steps that then change nothing. */
export function putBackHistory<TEvent, TEntry extends Snapshot<TEvent>>(
  history: UndoRedoState<TEntry>,
  refused: RefusedRow<TEvent>,
): UndoRedoState<TEntry> {
  const fix = (stack: readonly TEntry[]): readonly TEntry[] =>
    stack
      .map((entry) => {
        const before = swapped(entry.before, refused);
        const after = swapped(entry.after, refused);
        return before === entry.before && after === entry.after ? entry : { ...entry, after, before };
      })
      .filter((entry) => !changesNothing(entry));
  return { redoStack: fix(history.redoStack), undoStack: fix(history.undoStack) };
}
