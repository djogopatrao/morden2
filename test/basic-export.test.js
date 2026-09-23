import test from 'node:test';
import assert from 'node:assert/strict';
import { createSprite, paintPixel } from '../src/model.js';
import { exportBasic } from '../src/codec/basic-export.js';

test('exportBasic emits SCREEN 5, pattern/color DATA bytes, and per-grid SPRITE$/COLOR SPRITE$/PUT SPRITE wiring', () => {
  const grid0 = createSprite();
  paintPixel(grid0, 0, 0, 1);
  const project = { grids: [grid0] };
  const text = exportBasic(project);

  assert.match(text, /^\d+ SCREEN 5$/m);
  assert.match(text, /DATA 80,00,00,00,00,00,00,00/); // row 0 col 0 opaque -> top-left byte 0x80
  assert.match(text, /DATA 01,00,00,00,00,00,00,00,00,00,00,00,00,00,00,00/); // color table row 0 = color 1
  assert.match(text, /SPRITE\$\(P\)=MID\$\(A\$,1,8\)/);
  assert.match(text, /COLOR SPRITE\$\(0\)=A\$/);
  assert.match(text, /PUT SPRITE 0,\(\d+,\d+\),,P/);
});

test('exportBasic: pattern#/plane# are grid_index*4 and grid_index respectively, in grid order', () => {
  const grids = [createSprite(), createSprite(), createSprite()];
  const project = { grids };
  const text = exportBasic(project);

  assert.match(text, /P=0:SPRITE\$\(P\)/);
  assert.match(text, /P=4:SPRITE\$\(P\)/);
  assert.match(text, /P=8:SPRITE\$\(P\)/);
  assert.match(text, /COLOR SPRITE\$\(0\)=A\$/);
  assert.match(text, /COLOR SPRITE\$\(1\)=A\$/);
  assert.match(text, /COLOR SPRITE\$\(2\)=A\$/);
});

test('exportBasic: PUT SPRITE coordinates preserve relative offsets, anchored at the group bounding box', () => {
  const grid0 = createSprite(10, 20);
  const grid1 = createSprite(15, 20); // 5px right of grid0
  const project = { grids: [grid0, grid1] };
  const text = exportBasic(project);

  const coords = [...text.matchAll(/PUT SPRITE \d+,\((\d+),(\d+)\),,P/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(coords.length, 2);
  assert.equal(coords[1][0] - coords[0][0], 5);
  assert.equal(coords[1][1], coords[0][1]);
});

test('exportBasic: terminates the sprite plane list and ends in a self-looping halt', () => {
  const project = { grids: [createSprite(), createSprite()] };
  const text = exportBasic(project);

  assert.match(text, /PUT SPRITE 2,\(0,216\)/);
  const gotoMatch = text.match(/^(\d+) GOTO (\d+)$/m);
  assert.ok(gotoMatch, 'expected a self-referencing GOTO halt line');
  assert.equal(gotoMatch[1], gotoMatch[2]);
});
