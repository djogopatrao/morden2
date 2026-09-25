import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addGrid, paintPixel, getPixel } from '../src/model.js';
import { createHistory } from '../src/history.js';

test('perform() pushes a single undo entry that fully restores prior state', () => {
  const project = createProject();
  let restores = 0;
  const history = createHistory(project, () => restores++);

  history.perform(() => paintPixel(project.grids[0], 0, 0, 3));
  assert.equal(getPixel(project.grids[0], 0, 0), 1);
  assert.equal(project.grids[0].rowColors[0], 3);

  assert.equal(history.undo(), true);
  assert.equal(restores, 1);
  assert.equal(getPixel(project.grids[0], 0, 0), 0);

  assert.equal(history.redo(), true);
  assert.equal(getPixel(project.grids[0], 0, 0), 1);
  assert.equal(project.grids[0].rowColors[0], 3);
});

test('begin()/commit() coalesce a multi-mutation gesture into one undo step', () => {
  const project = createProject();
  const history = createHistory(project, () => {});
  const sprite = project.grids[0];

  history.begin();
  paintPixel(sprite, 0, 0, 1);
  paintPixel(sprite, 0, 1, 1);
  paintPixel(sprite, 0, 2, 1);
  history.commit();

  assert.equal(history.undo(), true);
  assert.equal(getPixel(project.grids[0], 0, 0), 0);
  assert.equal(getPixel(project.grids[0], 0, 1), 0);
  assert.equal(getPixel(project.grids[0], 0, 2), 0);
  assert.equal(history.undo(), false); // only one entry existed
});

test('cancel() discards a gesture without recording an undo step', () => {
  const project = createProject();
  const history = createHistory(project, () => {});

  history.begin();
  paintPixel(project.grids[0], 0, 0, 1);
  history.cancel();

  assert.equal(history.canUndo(), false);
});

test('a new action clears the redo stack', () => {
  const project = createProject();
  const history = createHistory(project, () => {});

  history.perform(() => paintPixel(project.grids[0], 0, 0, 1));
  history.undo();
  assert.equal(history.canRedo(), true);

  history.perform(() => addGrid(project));
  assert.equal(history.canRedo(), false);
});

test('undo/redo restores grid add/remove', () => {
  const project = createProject();
  const history = createHistory(project, () => {});

  history.perform(() => addGrid(project));
  assert.equal(project.grids.length, 2);

  history.undo();
  assert.equal(project.grids.length, 1);

  history.redo();
  assert.equal(project.grids.length, 2);
});

test('undo on an empty stack is a no-op that returns false', () => {
  const project = createProject();
  const history = createHistory(project, () => {});
  assert.equal(history.undo(), false);
  assert.equal(history.redo(), false);
});

test('reset() discards undo/redo history without touching the project', () => {
  const project = createProject();
  const history = createHistory(project, () => {});

  history.perform(() => paintPixel(project.grids[0], 0, 0, 1));
  history.undo();
  assert.equal(history.canRedo(), true);

  history.reset();
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);
  // project itself is untouched by reset — caller is responsible for
  // replacing it (e.g. "New Project" swaps `project.grids` separately).
  assert.equal(getPixel(project.grids[0], 0, 0), 0);
});

test('a gesture that changes nothing records no undo step', () => {
  const project = createProject();
  const history = createHistory(project, () => {});

  history.begin();
  paintPixel(project.grids[0], 0, 0, 0); // erase an already-empty pixel
  history.commit();
  assert.equal(history.canUndo(), false);

  history.perform(() => paintPixel(project.grids[0], 0, 0, 1));
  history.undo();
  history.begin();
  history.commit(); // no-op must not clear redo
  assert.equal(history.canRedo(), true);
});
