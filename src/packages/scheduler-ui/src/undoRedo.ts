/**
 * Host-visible undo/redo command stack. The host owns the data; the stack
 * stores inverse/forward apply callbacks or plain snapshots - whatever the
 * host pushes. Pure state transitions so behavior is spec-testable.
 */
export interface UndoRedoState<TEntry> {
  readonly redoStack: readonly TEntry[];
  readonly undoStack: readonly TEntry[];
}

export function emptyUndoRedo<TEntry>(): UndoRedoState<TEntry> {
  return { redoStack: [], undoStack: [] };
}

export function pushEntry<TEntry>(
  state: UndoRedoState<TEntry>,
  entry: TEntry,
  limit = 100,
): UndoRedoState<TEntry> {
  const undoStack = [...state.undoStack, entry].slice(-limit);
  return { redoStack: [], undoStack };
}

export interface PopResult<TEntry> {
  readonly entry: TEntry | undefined;
  readonly state: UndoRedoState<TEntry>;
}

export function popUndo<TEntry>(
  state: UndoRedoState<TEntry>,
): PopResult<TEntry> {
  const entry = state.undoStack[state.undoStack.length - 1];
  if (entry === undefined) {
    return { entry: undefined, state };
  }
  return {
    entry,
    state: {
      redoStack: [...state.redoStack, entry],
      undoStack: state.undoStack.slice(0, -1),
    },
  };
}

export function popRedo<TEntry>(
  state: UndoRedoState<TEntry>,
): PopResult<TEntry> {
  const entry = state.redoStack[state.redoStack.length - 1];
  if (entry === undefined) {
    return { entry: undefined, state };
  }
  return {
    entry,
    state: {
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, entry],
    },
  };
}

export function canUndo<TEntry>(state: UndoRedoState<TEntry>): boolean {
  return state.undoStack.length > 0;
}

export function canRedo<TEntry>(state: UndoRedoState<TEntry>): boolean {
  return state.redoStack.length > 0;
}
