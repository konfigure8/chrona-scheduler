import {
  canRedo,
  canUndo,
  emptyUndoRedo,
  popRedo,
  popUndo,
  pushEntry,
} from "../src/undoRedo";

function pushUndoRedoRoundTrip(): void {
  let state = emptyUndoRedo<string>();
  assertEqual(canUndo(state), false);
  assertEqual(canRedo(state), false);

  state = pushEntry(state, "first");
  state = pushEntry(state, "second");
  assertEqual(canUndo(state), true);

  const undone = popUndo(state);
  assertEqual(undone.entry, "second");
  state = undone.state;
  assertEqual(canRedo(state), true);

  const redone = popRedo(state);
  assertEqual(redone.entry, "second");
  state = redone.state;
  assertEqual(canRedo(state), false);
  assertEqual(state.undoStack.length, 2);
}

function newEntryClearsRedoStack(): void {
  let state = emptyUndoRedo<string>();
  state = pushEntry(state, "first");
  state = popUndo(state).state;
  assertEqual(canRedo(state), true);
  state = pushEntry(state, "replacement");
  assertEqual(canRedo(state), false);
}

function stackRespectsLimit(): void {
  let state = emptyUndoRedo<number>();
  for (let index = 0; index < 10; index += 1) {
    state = pushEntry(state, index, 3);
  }
  assertEqual(state.undoStack.length, 3);
  assertEqual(state.undoStack[0], 7);
}

function popOnEmptyIsSafe(): void {
  const state = emptyUndoRedo<string>();
  assertEqual(popUndo(state).entry, undefined);
  assertEqual(popRedo(state).entry, undefined);
}

function assertEqual<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

pushUndoRedoRoundTrip();
newEntryClearsRedoStack();
stackRespectsLimit();
popOnEmptyIsSafe();

console.log("undoRedo tests passed");
