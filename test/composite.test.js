import test from 'node:test';
import assert from 'node:assert/strict';
import { createSprite, setPixel } from '../src/model.js';
import { compositeGrids } from '../src/composite.js';

function makeSprite({ x = 0, y = 0, orMode = false, pixels = [], color }) {
  const s = createSprite(x, y);
  s.orMode = orMode;
  for (const [r, c] of pixels) {
    setPixel(s, r, c, true);
    s.rowColors[r] = color;
  }
  return s;
}

test('two non-OR overlapping sprites: lowest index wins (priority stacking, no OR)', () => {
  const a = makeSprite({ pixels: [[0, 0]], color: 2 });
  const b = makeSprite({ pixels: [[0, 0]], color: 5 });
  const { pixels } = compositeGrids([a, b]);
  assert.equal(pixels[0], 2);
});

test('OR chain of 3 sprites merges with the preceding non-OR base', () => {
  const base = makeSprite({ pixels: [[0, 0]], color: 1 }); // 0001
  const or1 = makeSprite({ pixels: [[0, 0]], color: 2, orMode: true }); // 0010
  const or2 = makeSprite({ pixels: [[0, 0]], color: 4, orMode: true }); // 0100
  const { pixels } = compositeGrids([base, or1, or2]);
  assert.equal(pixels[0], 7); // 1|2|4
});

test('OR sprite with no preceding non-OR sprite falls back to its own anchor', () => {
  const orphan = makeSprite({ pixels: [[0, 0]], color: 9, orMode: true });
  const { pixels } = compositeGrids([orphan]);
  assert.equal(pixels[0], 9);
});

test('non-overlapping sprites compose as their union', () => {
  const a = makeSprite({ x: 0, y: 0, pixels: [[0, 0]], color: 3 });
  const b = makeSprite({ x: 16, y: 0, pixels: [[0, 0]], color: 6 });
  const { pixels, width } = compositeGrids([a, b]);
  assert.equal(width, 32);
  assert.equal(pixels[0], 3);
  assert.equal(pixels[16], 6);
});

test('an OR grid attaches to the nearer preceding non-OR grid, not a further one', () => {
  // g0 is offset away from (0,0) so it can't shadow the pixel under test.
  const g0 = makeSprite({ x: 5, pixels: [[0, 0]], color: 1 });
  const g1 = makeSprite({ pixels: [[0, 0]], color: 2 });
  const g2 = makeSprite({ pixels: [[0, 0]], color: 4, orMode: true });
  const { pixels, minX, minY, width } = compositeGrids([g0, g1, g2]);
  const idx = (0 - minY) * width + (0 - minX);
  assert.equal(pixels[idx], 6); // g1 | g2 = 2|4, g0 not opaque here
});

test('a non-OR grid in front still wins over an OR group behind it where it is opaque', () => {
  const g0 = makeSprite({ pixels: [[0, 0]], color: 1 });
  const g1 = makeSprite({ pixels: [[0, 0]], color: 2 });
  const g2 = makeSprite({ pixels: [[0, 0]], color: 4, orMode: true });
  const { pixels } = compositeGrids([g0, g1, g2]);
  assert.equal(pixels[0], 1); // g0's own group (anchorIndex 0) is checked before g1's group
});
