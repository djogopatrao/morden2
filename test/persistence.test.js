import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createSprite, paintPixel } from '../src/model.js';
import {
  serializeProject,
  deserializeProject,
  saveProject,
  loadProject,
  clearSavedProject,
  createAutosave,
} from '../src/persistence.js';

// Minimal in-memory localStorage stand-in for Node (no DOM/browser here).
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('serialize/deserialize round-trips a project exactly', () => {
  const project = createProject();
  paintPixel(project.grids[0], 0, 0, 5);
  paintPixel(project.grids[0], 1, 3, 9);
  project.grids[0].orMode = true;
  project.grids[0].x = 7;
  project.grids[0].y = -3;
  project.grids.push(createSprite(2, 4));

  const json = serializeProject(project);
  const restored = deserializeProject(json);

  assert.equal(restored.grids.length, 2);
  assert.deepEqual(Array.from(restored.grids[0].opacity), Array.from(project.grids[0].opacity));
  assert.deepEqual(Array.from(restored.grids[0].rowColors), Array.from(project.grids[0].rowColors));
  assert.equal(restored.grids[0].orMode, true);
  assert.equal(restored.grids[0].x, 7);
  assert.equal(restored.grids[0].y, -3);
  assert.equal(restored.grids[1].x, 2);
  assert.equal(restored.grids[1].y, 4);
});

test('deserializeProject rejects malformed/missing data', () => {
  assert.equal(deserializeProject('not json'), null);
  assert.equal(deserializeProject('{}'), null);
  assert.equal(deserializeProject(JSON.stringify({ grids: [] })), null);
  assert.equal(deserializeProject(JSON.stringify({ grids: 'nope' })), null);
});

test('saveProject/loadProject round-trip via a storage backend', () => {
  const storage = fakeStorage();
  const project = createProject();
  paintPixel(project.grids[0], 5, 5, 3);

  saveProject(project, storage);
  const restored = loadProject(storage);

  assert.equal(restored.grids.length, 1);
  assert.equal(restored.grids[0].rowColors[5], 3);
});

test('loadProject returns null when nothing is stored', () => {
  const storage = fakeStorage();
  assert.equal(loadProject(storage), null);
});

test('clearSavedProject removes the persisted state', () => {
  const storage = fakeStorage();
  saveProject(createProject(), storage);
  clearSavedProject(storage);
  assert.equal(loadProject(storage), null);
});

test('createAutosave debounces writes to a single save', () => {
  const storage = fakeStorage();
  const project = createProject();
  const autosave = createAutosave(project, { storage, delayMs: 10 });

  paintPixel(project.grids[0], 0, 0, 2);
  autosave.trigger();
  paintPixel(project.grids[0], 0, 1, 4);
  autosave.trigger();
  paintPixel(project.grids[0], 0, 2, 6);
  autosave.trigger();

  // Nothing written yet — still within the debounce window.
  assert.equal(storage.getItem('mode2-sprites/project'), null);

  return new Promise((resolve) => {
    setTimeout(() => {
      const restored = loadProject(storage);
      assert.equal(restored.grids[0].rowColors[0], 6);
      resolve();
    }, 30);
  });
});

test('createAutosave.flush writes immediately and cancels the pending timer', () => {
  const storage = fakeStorage();
  const project = createProject();
  const autosave = createAutosave(project, { storage, delayMs: 1000 });

  paintPixel(project.grids[0], 0, 0, 8);
  autosave.trigger();
  autosave.flush();

  assert.equal(loadProject(storage).grids[0].rowColors[0], 8);
});
