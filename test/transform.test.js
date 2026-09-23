import test from 'node:test';
import assert from 'node:assert/strict';
import { createSprite, paintPixel, getPixel } from '../src/model.js';
import { rotateCW, mirrorHorizontal, mirrorVertical } from '../src/transform.js';

test('rotateCW rotates the bitmap 90 degrees clockwise', () => {
  // A single opaque pixel at (row=0, col=0) should land at (row=0, col=15)
  // after a 90 CW rotation of a 16x16 grid.
  const sprite = createSprite();
  paintPixel(sprite, 0, 0, 3);
  rotateCW(sprite);
  assert.equal(getPixel(sprite, 0, 15), 1);
  assert.equal(getPixel(sprite, 0, 0), 0);
});

test('rotateCW: an L-shape rotates as a rigid body', () => {
  // Pixels at (0,0) and (0,1) — after 90 CW they land at (0,15) and (1,15).
  const sprite = createSprite();
  paintPixel(sprite, 0, 0, 2);
  paintPixel(sprite, 0, 1, 2);
  rotateCW(sprite);
  assert.equal(getPixel(sprite, 0, 15), 1);
  assert.equal(getPixel(sprite, 1, 15), 1);
});

test('rotateCW: new row color is the majority color among contributing old rows', () => {
  const sprite = createSprite();
  // New row 0 pulls from old column 0 across all old rows. Put 3 opaque
  // pixels at column 0 with color 5, and 1 with color 7 — color 5 wins.
  paintPixel(sprite, 0, 0, 5);
  paintPixel(sprite, 1, 0, 5);
  paintPixel(sprite, 2, 0, 5);
  paintPixel(sprite, 3, 0, 7);
  rotateCW(sprite);
  assert.equal(sprite.rowColors[0], 5);
});

test('rotateCW: a tie breaks to the lowest palette index', () => {
  const sprite = createSprite();
  paintPixel(sprite, 0, 0, 9); // new row 0, one vote for color 9
  paintPixel(sprite, 1, 0, 4); // new row 0, one vote for color 4
  rotateCW(sprite);
  assert.equal(sprite.rowColors[0], 4);
});

test('rotateCW: a row with no opaque pixels gets color 0 (unset)', () => {
  const sprite = createSprite();
  rotateCW(sprite);
  assert.equal(sprite.rowColors[15], 0);
});

test('mirrorHorizontal flips columns and preserves row colors', () => {
  const sprite = createSprite();
  paintPixel(sprite, 2, 0, 6);
  paintPixel(sprite, 2, 1, 6);
  mirrorHorizontal(sprite);
  assert.equal(getPixel(sprite, 2, 15), 1);
  assert.equal(getPixel(sprite, 2, 14), 1);
  assert.equal(getPixel(sprite, 2, 0), 0);
  assert.equal(sprite.rowColors[2], 6);
});

test('mirrorVertical flips row order and row colors move with their row', () => {
  const sprite = createSprite();
  paintPixel(sprite, 0, 5, 8);
  mirrorVertical(sprite);
  assert.equal(getPixel(sprite, 15, 5), 1);
  assert.equal(sprite.rowColors[15], 8);
  assert.equal(getPixel(sprite, 0, 5), 0);
});
