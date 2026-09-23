import test from 'node:test';
import assert from 'node:assert/strict';
import { createSprite, paintPixel, getPixel } from '../src/model.js';
import {
  normalizeRect,
  copySelection,
  clearSelectionPixels,
  cutSelection,
  pasteWhole,
  pasteRectAt,
} from '../src/clipboard.js';

function paintRow(sprite, row, cols, color) {
  for (const c of cols) paintPixel(sprite, row, c, color);
}

test('normalizeRect orders coordinates regardless of drag direction', () => {
  assert.deepEqual(normalizeRect(5, 5, 1, 1), { r0: 1, c0: 1, r1: 5, c1: 5 });
  assert.deepEqual(normalizeRect(1, 1, 5, 5), { r0: 1, c0: 1, r1: 5, c1: 5 });
});

test('copySelection(whole) clones the entire sprite', () => {
  const sprite = createSprite(3, 4);
  paintRow(sprite, 0, [0, 1], 2);
  const clip = copySelection(sprite, { kind: 'whole' });
  assert.equal(clip.kind, 'whole');
  assert.equal(getPixel(clip.sprite, 0, 0), 1);
  assert.equal(clip.sprite.rowColors[0], 2);
  // independent copy
  paintPixel(sprite, 0, 0, 0);
  assert.equal(getPixel(clip.sprite, 0, 0), 1);
});

test('copySelection(rect) captures only the sub-rectangle, row-relative', () => {
  const sprite = createSprite();
  paintRow(sprite, 2, [1, 2, 3], 5);
  paintRow(sprite, 3, [1, 2, 3], 7);
  const clip = copySelection(sprite, { kind: 'rect', r0: 2, c0: 1, r1: 3, c1: 2 });
  assert.equal(clip.width, 2);
  assert.equal(clip.height, 2);
  assert.deepEqual(Array.from(clip.opacity), [1, 1, 1, 1]);
  assert.deepEqual(Array.from(clip.rowColors), [5, 7]);
});

test('clearSelectionPixels(whole) zeroes all opacity, leaves row colors', () => {
  const sprite = createSprite();
  paintRow(sprite, 0, [0], 3);
  clearSelectionPixels(sprite, { kind: 'whole' });
  assert.equal(getPixel(sprite, 0, 0), 0);
  assert.equal(sprite.rowColors[0], 3);
});

test('clearSelectionPixels(rect) only clears the rectangle', () => {
  const sprite = createSprite();
  paintRow(sprite, 0, [0, 1, 2], 3);
  clearSelectionPixels(sprite, { kind: 'rect', r0: 0, c0: 0, r1: 0, c1: 1 });
  assert.equal(getPixel(sprite, 0, 0), 0);
  assert.equal(getPixel(sprite, 0, 1), 0);
  assert.equal(getPixel(sprite, 0, 2), 1);
});

test('cutSelection copies then clears', () => {
  const sprite = createSprite();
  paintRow(sprite, 0, [0], 4);
  const clip = cutSelection(sprite, { kind: 'whole' });
  assert.equal(getPixel(clip.sprite, 0, 0), 1);
  assert.equal(getPixel(sprite, 0, 0), 0);
});

test('pasteWhole replaces pattern/colors/orMode but keeps target position', () => {
  const source = createSprite();
  paintRow(source, 0, [0], 9);
  source.orMode = true;
  const clip = { kind: 'whole', sprite: source };

  const target = createSprite(20, 30);
  pasteWhole(target, clip);
  assert.equal(getPixel(target, 0, 0), 1);
  assert.equal(target.rowColors[0], 9);
  assert.equal(target.orMode, true);
  assert.equal(target.x, 20);
  assert.equal(target.y, 30);
});

test('pasteRectAt places pixels at the given offset and overwrites row colors on touched rows', () => {
  const sprite = createSprite();
  const clip = { width: 2, height: 1, opacity: new Uint8Array([1, 1]), rowColors: new Uint8Array([6]) };
  sprite.rowColors[5] = 2; // pre-existing color on the target row
  pasteRectAt(sprite, clip, 5, 3);
  assert.equal(getPixel(sprite, 5, 3), 1);
  assert.equal(getPixel(sprite, 5, 4), 1);
  assert.equal(sprite.rowColors[5], 6);
});

test('pasteRectAt clips against grid bounds without throwing', () => {
  const sprite = createSprite();
  const clip = {
    width: 2,
    height: 2,
    opacity: new Uint8Array([1, 1, 1, 1]),
    rowColors: new Uint8Array([1, 1]),
  };
  assert.doesNotThrow(() => pasteRectAt(sprite, clip, 15, 15));
  assert.equal(getPixel(sprite, 15, 15), 1);
});
