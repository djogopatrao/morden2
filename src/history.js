import { cloneSprite } from './model.js';

// A single linear undo/redo stack over the whole Project (spec §5.6).
// Snapshot-based: each undo/redo entry is a deep clone of `project.grids`
// taken just before a mutation (or sequence of mutations) began.
//
// Gestures that span multiple low-level mutations (a paint stroke's
// pointerdown..pointerup, a preview drag) are coalesced into a single
// undo entry by calling `begin()` once at the start of the gesture and
// `commit()` once at the end, rather than after every intermediate
// mutation. Discrete one-shot actions (add/remove grid, OR toggle, a
// row recolor click) call `begin()` immediately before mutating and
// `commit()` immediately after.
function sameSprite(a, b) {
  return a.orMode === b.orMode && a.x === b.x && a.y === b.y
    && a.opacity.every((v, i) => v === b.opacity[i])
    && a.rowColors.every((v, i) => v === b.rowColors[i]);
}

function sameGrids(a, b) {
  return a.length === b.length && a.every((s, i) => sameSprite(s, b[i]));
}

export function createHistory(project, onRestore) {
  const undoStack = [];
  const redoStack = [];
  let pending = null;

  function snapshot() {
    return project.grids.map(cloneSprite);
  }

  function restore(gridsSnapshot) {
    project.grids = gridsSnapshot.map(cloneSprite);
    onRestore && onRestore();
  }

  function begin() {
    pending = snapshot();
  }

  // A gesture that changed nothing (e.g. erasing an already-empty
  // pixel) records no undo step.
  function commit() {
    if (pending === null) return;
    if (sameGrids(pending, project.grids)) {
      pending = null;
      return;
    }
    undoStack.push(pending);
    redoStack.length = 0;
    pending = null;
  }

  function cancel() {
    pending = null;
  }

  function perform(mutateFn) {
    begin();
    mutateFn();
    commit();
  }

  function undo() {
    if (undoStack.length === 0) return false;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    return true;
  }

  function redo() {
    if (redoStack.length === 0) return false;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    return true;
  }

  // Discards all undo/redo history without touching `project` — used
  // when the project itself is being replaced wholesale (e.g. "New
  // Project"), where a stale stack referencing the old grids would be
  // meaningless.
  function reset() {
    undoStack.length = 0;
    redoStack.length = 0;
    pending = null;
  }

  return {
    begin,
    commit,
    cancel,
    perform,
    undo,
    redo,
    reset,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  };
}
