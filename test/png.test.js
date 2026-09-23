import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, rgbToPaletteIndex, decodePngColors } from '../src/codec/png.js';
import { MSX2_PALETTE } from '../src/palette.js';
import { GRID_SIZE } from '../src/model.js';

test('hexToRgb decodes a #rrggbb string into an [r,g,b] triple', () => {
  assert.deepEqual(hexToRgb('#ffffff'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('#010101'), [1, 1, 1]);
  assert.deepEqual(hexToRgb('#3eb849'), [0x3e, 0xb8, 0x49]);
});

test('rgbToPaletteIndex finds every fixed palette color, rejects anything else', () => {
  for (let i = 1; i < MSX2_PALETTE.length; i++) {
    const [r, g, b] = hexToRgb(MSX2_PALETTE[i]);
    assert.equal(rgbToPaletteIndex(r, g, b), i);
  }
  assert.equal(rgbToPaletteIndex(1, 2, 3), -1);
});

function blankImageData(width = GRID_SIZE, height = GRID_SIZE) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

test('decodePngColors: an all-palette-color 16x16 image round-trips exactly', () => {
  const img = blankImageData();
  const [r, g, b] = hexToRgb(MSX2_PALETTE[7]);
  const o = (3 * GRID_SIZE + 2) * 4;
  img.data[o] = r;
  img.data[o + 1] = g;
  img.data[o + 2] = b;
  img.data[o + 3] = 255;
  const colors = decodePngColors(img);
  assert.equal(colors[3 * GRID_SIZE + 2], 7);
  assert.equal(colors[0], 0); // untouched pixel stays transparent (alpha 0)
});

test('decodePngColors rejects a non-16x16 image', () => {
  assert.throws(() => decodePngColors(blankImageData(15, 16)), /16x16/);
});

test('decodePngColors rejects partial alpha (anti-aliasing)', () => {
  const img = blankImageData();
  img.data[3] = 128;
  assert.throws(() => decodePngColors(img), /partial transparency/);
});

test('decodePngColors rejects a color outside the fixed palette', () => {
  const img = blankImageData();
  img.data[0] = 10;
  img.data[1] = 20;
  img.data[2] = 30;
  img.data[3] = 255;
  assert.throws(() => decodePngColors(img), /fixed MSX2 palette/);
});
