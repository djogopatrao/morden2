import { GRID_SIZE, getPixel } from '../model.js';

// Shared hardware byte encoders (FUNCTIONAL_SPEC.md §11) — every export
// format (PNG's row-color faithfulness aside, C, BIN, BASIC, and later
// TinySprite) is built from these two functions, so the byte layout is
// implemented exactly once.

// Quadrant order per §11.1: top-left(8) -> bottom-left(8) -> top-right(8)
// -> bottom-right(8), 1 bit/pixel, MSB = leftmost pixel of that byte's
// 8-pixel span.
const QUADRANTS = [
  { rowOffset: 0, colOffset: 0 }, // top-left
  { rowOffset: 8, colOffset: 0 }, // bottom-left
  { rowOffset: 0, colOffset: 8 }, // top-right
  { rowOffset: 8, colOffset: 8 }, // bottom-right
];

export function encodePattern(sprite) {
  const out = new Uint8Array(32);
  let byteIndex = 0;
  for (const { rowOffset, colOffset } of QUADRANTS) {
    for (let r = 0; r < 8; r++) {
      let byte = 0;
      for (let c = 0; c < 8; c++) {
        if (getPixel(sprite, rowOffset + r, colOffset + c)) byte |= 1 << (7 - c);
      }
      out[byteIndex++] = byte;
    }
  }
  return out;
}

// One byte per pixel row: EC(0) | CC(orMode) | IC(0) | 0 | color(0-15)
// per §11.2/§2.3. EC/IC are not user-facing in v1 and always 0.
//
// The CC bit is only set on rows that actually carry a color (i.e. a
// row the user has painted into, `rowColors[row] !== 0`) — confirmed
// against the tinysprite.bas/tinysprite.c sample's OR companion sprite
// (attr1), whose *unpainted* rows are 0x00, not 0x40, even though the
// sprite's own OR toggle is on. An unpainted row's mask byte is 0
// anyway (nothing to draw), so its CC bit is moot in hardware; this
// keeps byte-for-byte parity with real TinySprite output rather than
// literally setting CC on all 16 bytes.
export function encodeColorTable(sprite) {
  const out = new Uint8Array(GRID_SIZE);
  for (let row = 0; row < GRID_SIZE; row++) {
    const color = sprite.rowColors[row] & 0x0f;
    const cc = sprite.orMode && color !== 0 ? 0x40 : 0;
    out[row] = cc | color;
  }
  return out;
}
