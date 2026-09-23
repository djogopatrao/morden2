import test from 'node:test';
import assert from 'node:assert/strict';
import { createSprite, paintPixel } from '../src/model.js';
import { encodePattern, encodeColorTable } from '../src/codec/pattern.js';
import { exportPatternsBin, exportColorsBin } from '../src/codec/bin-export.js';
import { exportC } from '../src/codec/c-export.js';

// Ground truth reconstructed BY HAND from
// References/File_Formats/tinysprite_backup.tiny (Slot 0's ASCII art)
// and cross-checked against References/File_Formats/tinysprite.bas /
// tinysprite.c's DATA/array bytes — see FUNCTIONAL_SPEC.md §11.1/§11.2
// for the worked-through derivation. This is the single most valuable
// test in the project: it's real, human-verified hardware ground truth,
// not just a round-trip of our own code.
//
// Slot 0 decomposes into two hardware sprites:
//  - grid0 (base, no OR): rows 0-3 color 2, rows 4-7 color 10 (A),
//    rows 8-10 color 6, rows 11-15 color 9 — except row 11 only cols
//    11-12 (cols 9-10 of that row belong to the OR companion below).
//  - grid1 (OR companion): only row 11 is opaque, cols 9-10, color 6,
//    orMode = true.
function buildSlot0Grids() {
  const grid0 = createSprite();
  const rowShapes = [
    [0, 0], // row 0: col 0
    [0, 1], // row 1: cols 0-1
    [1, 2], // row 2: cols 1-2
    [2, 3], // row 3: cols 2-3
    [3, 4], // row 4: cols 3-4
    [4, 5], // row 5: cols 4-5
    [5, 6], // row 6: cols 5-6
    [6, 7], // row 7: cols 6-7
    [7, 8], // row 8: cols 7-8
    [8, 10], // row 9: cols 8-10
    [9, 10], // row 10: cols 9-10
    [11, 12], // row 11: cols 11-12 only (cols 9-10 belong to grid1)
    [10, 13], // row 12: cols 10-13
    [11, 13], // row 13: cols 11-13
    [11, 14], // row 14: cols 11-14
    [12, 14], // row 15: cols 12-14
  ];
  const rowColors = [2, 2, 2, 2, 10, 10, 10, 10, 6, 6, 6, 9, 9, 9, 9, 9];
  rowShapes.forEach(([c0, c1], row) => {
    for (let c = c0; c <= c1; c++) paintPixel(grid0, row, c, rowColors[row]);
  });

  const grid1 = createSprite();
  grid1.orMode = true;
  paintPixel(grid1, 11, 9, 6);
  paintPixel(grid1, 11, 10, 6);

  return { grid0, grid1 };
}

const PATTERN0 = [
  0x80, 0xc0, 0x60, 0x30, 0x18, 0x0c, 0x06, 0x03,
  0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x80, 0xe0, 0x60, 0x18, 0x3c, 0x1c, 0x1e, 0x0e,
];
const ATTR0 = [
  0x02, 0x02, 0x02, 0x02, 0x0a, 0x0a, 0x0a, 0x0a,
  0x06, 0x06, 0x06, 0x09, 0x09, 0x09, 0x09, 0x09,
];
const PATTERN1 = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x60, 0x00, 0x00, 0x00, 0x00,
];
const ATTR1 = [
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x46, 0x00, 0x00, 0x00, 0x00,
];

test('encodePattern/encodeColorTable match tinysprite.bas/tinysprite.c byte-for-byte (grid0, base)', () => {
  const { grid0 } = buildSlot0Grids();
  assert.deepEqual(Array.from(encodePattern(grid0)), PATTERN0);
  assert.deepEqual(Array.from(encodeColorTable(grid0)), ATTR0);
});

test('encodePattern/encodeColorTable match tinysprite.bas/tinysprite.c byte-for-byte (grid1, OR companion)', () => {
  const { grid1 } = buildSlot0Grids();
  assert.deepEqual(Array.from(encodePattern(grid1)), PATTERN1);
  assert.deepEqual(Array.from(encodeColorTable(grid1)), ATTR1);
});

test('encodePattern packs MSB-first (leftmost pixel = high bit)', () => {
  const sprite = createSprite();
  paintPixel(sprite, 0, 0, 1);
  const bytes = encodePattern(sprite);
  assert.equal(bytes[0], 0b10000000);
});

test('encodeColorTable sets CC bit (0x40) only when orMode is on', () => {
  const sprite = createSprite();
  paintPixel(sprite, 0, 0, 5);
  assert.equal(encodeColorTable(sprite)[0], 0x05);
  sprite.orMode = true;
  assert.equal(encodeColorTable(sprite)[0], 0x45);
});

test('exportPatternsBin/exportColorsBin concatenate per-grid blocks in grid order', () => {
  const { grid0, grid1 } = buildSlot0Grids();
  const project = { grids: [grid0, grid1] };

  const patterns = exportPatternsBin(project);
  assert.equal(patterns.length, 64);
  assert.deepEqual(Array.from(patterns.slice(0, 32)), PATTERN0);
  assert.deepEqual(Array.from(patterns.slice(32, 64)), PATTERN1);

  const colors = exportColorsBin(project);
  assert.equal(colors.length, 32);
  assert.deepEqual(Array.from(colors.slice(0, 16)), ATTR0);
  assert.deepEqual(Array.from(colors.slice(16, 32)), ATTR1);
});

test('exportC formats both grids\' bytes as 0xNN hex literals in grid order', () => {
  const { grid0, grid1 } = buildSlot0Grids();
  const project = { grids: [grid0, grid1] };
  const text = exportC(project);

  assert.match(text, /unsigned char sprite_patterns\[\] = \{/);
  assert.match(text, /unsigned char sprite_attributes\[\] = \{/);
  assert.match(text, /0x80,0xC0,0x60,0x30,0x18,0x0C,0x06,0x03/);
  assert.match(text, /0x02,0x02,0x02,0x02,0x0A,0x0A,0x0A,0x0A/);
  assert.match(text, /0x00,0x00,0x00,0x60,0x00,0x00,0x00,0x00/);
  assert.match(text, /0x00,0x00,0x00,0x46,0x00,0x00,0x00,0x00/);
});
