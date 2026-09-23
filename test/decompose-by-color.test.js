import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_SIZE, getPixel } from '../src/model.js';
import { decomposeByColor } from '../src/decompose-by-color.js';
import { parseTinySprite } from '../src/codec/tinysprite.js';
import { readFileSync } from 'node:fs';

function colorsFromRows(rows) {
  const colors = new Uint8Array(GRID_SIZE * GRID_SIZE);
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) colors[r * GRID_SIZE + c] = row[c];
  });
  return colors;
}

test('decomposeByColor: single-color image produces exactly one grid', () => {
  const colors = new Uint8Array(GRID_SIZE * GRID_SIZE).fill(3);
  const grids = decomposeByColor(colors);
  assert.equal(grids.length, 1);
  assert.equal(grids[0].orMode, false);
  for (let row = 0; row < GRID_SIZE; row++) {
    assert.equal(grids[0].rowColors[row], 3);
    for (let col = 0; col < GRID_SIZE; col++) {
      assert.equal(getPixel(grids[0], row, col), 1);
    }
  }
});

test('decomposeByColor: transparent-only image produces zero grids', () => {
  const colors = new Uint8Array(GRID_SIZE * GRID_SIZE);
  assert.deepEqual(decomposeByColor(colors), []);
});

test('decomposeByColor: N distinct colors -> N grids, each pixel-exact and in ascending color order', () => {
  const rows = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(0));
  rows[0][0] = 5;
  rows[0][1] = 2;
  rows[5][3] = 9;
  const colors = colorsFromRows(rows);

  const grids = decomposeByColor(colors);
  assert.equal(grids.length, 3);
  const colorsInOrder = grids.map((g) => g.rowColors.find((c) => c !== 0));
  assert.deepEqual(colorsInOrder, [2, 5, 9]);

  // Every original pixel is reproduced by exactly the grid for its color.
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const target = colors[row * GRID_SIZE + col];
      grids.forEach((sprite, i) => {
        const expected = colorsInOrder[i] === target && target !== 0 ? 1 : 0;
        assert.equal(getPixel(sprite, row, col), expected);
      });
    }
  }
});

test('decomposeByColor: real .tiny slot 0 (colors 2, 6, 9, 10) decomposes to 4 pixel-exact grids', () => {
  const text = readFileSync(new URL('../References/File_Formats/tinysprite_backup.tiny', import.meta.url), 'utf8');
  const [slot0] = parseTinySprite(text);
  const grids = decomposeByColor(slot0.colors);

  assert.equal(grids.length, 4);
  const colorsInOrder = grids.map((g) => g.rowColors.find((c) => c !== 0));
  assert.deepEqual(colorsInOrder, [2, 6, 9, 10]);

  // Reunion of the 4 grids reproduces the slot's image exactly (the
  // composite guarantee this decomposition strategy relies on).
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const row = Math.floor(i / GRID_SIZE);
    const col = i % GRID_SIZE;
    const target = slot0.colors[i];
    let found = 0;
    grids.forEach((sprite, gi) => {
      if (getPixel(sprite, row, col)) {
        assert.equal(found, 0, `pixel ${row},${col} claimed by more than one grid`);
        found = colorsInOrder[gi];
      }
    });
    assert.equal(found, target);
  }
});
