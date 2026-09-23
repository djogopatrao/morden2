import test from 'node:test';
import assert from 'node:assert/strict';
import { createSprite, paintPixel } from '../src/model.js';
import { spriteToTinyRows, serializeTinySprite, parseTinySprite } from '../src/codec/tinysprite.js';

test('spriteToTinyRows: a single-color sprite encodes opaque pixels as its color digit, rest as "."', () => {
  const sprite = createSprite();
  paintPixel(sprite, 0, 0, 2);
  paintPixel(sprite, 0, 1, 2);
  const rows = spriteToTinyRows(sprite);
  assert.equal(rows.length, 16);
  assert.equal(rows[0], '2' + '2' + '.'.repeat(14));
  assert.equal(rows[1], '.'.repeat(16));
});

test('spriteToTinyRows: colors 10-15 encode as hex digits A-F', () => {
  const sprite = createSprite();
  paintPixel(sprite, 3, 0, 15);
  assert.equal(spriteToTinyRows(sprite)[3][0], 'F');
});

test('serializeTinySprite writes the !type/msx2 header and one #Slot per grid in order', () => {
  const grid0 = createSprite();
  paintPixel(grid0, 0, 0, 1);
  const grid1 = createSprite();
  grid1.orMode = true;
  paintPixel(grid1, 1, 1, 3);
  const project = { grids: [grid0, grid1] };

  const text = serializeTinySprite(project);
  const lines = text.trim().split('\n');
  assert.equal(lines[0], '!type');
  assert.equal(lines[1], 'msx2');
  assert.equal(lines[2], '#Slot 0');
  assert.equal(lines[2 + 16 + 1], '#Slot 1');
});

test('serializeTinySprite -> parseTinySprite round-trips pixel-exact', () => {
  const grid0 = createSprite();
  for (let c = 0; c < 5; c++) paintPixel(grid0, 0, c, 7);
  paintPixel(grid0, 5, 5, 9);
  const project = { grids: [grid0] };

  const text = serializeTinySprite(project);
  const [slot0] = parseTinySprite(text);
  const expected = new Uint8Array(256);
  for (let c = 0; c < 5; c++) expected[0 * 16 + c] = 7;
  expected[5 * 16 + 5] = 9;
  assert.deepEqual(Array.from(slot0.colors), Array.from(expected));
});
