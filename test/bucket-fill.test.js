import test from 'node:test';
import assert from 'node:assert/strict';
import { createSprite, paintPixel, getPixel, bucketFill, GRID_SIZE } from '../src/model.js';

function opaqueCount(sprite) {
  return sprite.opacity.reduce((n, v) => n + v, 0);
}

test('filling an empty sprite paints every pixel', () => {
  const s = createSprite();
  bucketFill(s, 0, 0, 4);
  assert.equal(opaqueCount(s), GRID_SIZE * GRID_SIZE);
  assert.ok(s.rowColors.every((c) => c === 4));
});

test('fill stays inside a closed outline', () => {
  const s = createSprite();
  // 5x5 box outline, rows/cols 2..6
  for (let i = 2; i <= 6; i++) {
    paintPixel(s, 2, i, 1);
    paintPixel(s, 6, i, 1);
    paintPixel(s, i, 2, 1);
    paintPixel(s, i, 6, 1);
  }
  const before = opaqueCount(s);
  bucketFill(s, 4, 4, 1);
  assert.equal(opaqueCount(s), before + 9); // 3x3 interior
  assert.equal(getPixel(s, 0, 0), 0);
  assert.equal(getPixel(s, 4, 8), 0);
});

test('filling an opaque region recolors it', () => {
  const s = createSprite();
  paintPixel(s, 3, 3, 2);
  paintPixel(s, 4, 3, 2);
  bucketFill(s, 3, 3, 9);
  assert.equal(s.rowColors[3], 9);
  assert.equal(s.rowColors[4], 9);
  assert.equal(opaqueCount(s), 2);
});

test('fill with color 0 erases the connected region only', () => {
  const s = createSprite();
  paintPixel(s, 0, 0, 5);
  paintPixel(s, 0, 1, 5);
  paintPixel(s, 0, 5, 5); // same row color, not connected
  bucketFill(s, 0, 0, 0);
  assert.equal(getPixel(s, 0, 0), 0);
  assert.equal(getPixel(s, 0, 1), 0);
  assert.equal(getPixel(s, 0, 5), 1);
});

test('fill with the color already under the cursor is a no-op', () => {
  const s = createSprite();
  bucketFill(s, 7, 7, 0);
  assert.equal(opaqueCount(s), 0);
});
