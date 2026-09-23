import { GRID_SIZE, createSprite, paintPixel } from './model.js';

// Simplified import decomposition (FUNCTIONAL_SPEC.md §6.1-§6.3, Phase 9
// plan): one grid per distinct color present in the target image, each
// grid holding only that color's pixels. Since every pixel belongs to
// exactly one color, no two resulting grids ever share an opaque pixel
// at the same coordinate, so `rowColors` are trivially uniform (no
// per-row conflicts) and `orMode` stays false on every grid — no OR
// grouping is needed. Not grid-count-optimal (see the backlogged
// optimal decomposition algorithm in IMPLEMENTATION_PLAN.md), but
// always correct and pixel-exact.
//
// `colors`: Uint8Array(256), row-major, 0 = transparent, 1-15 = palette
// index. Returns one Sprite per distinct non-zero color, in ascending
// color-index order.
export function decomposeByColor(colors) {
  const distinct = [];
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    if (c !== 0 && !distinct.includes(c)) distinct.push(c);
  }
  distinct.sort((a, b) => a - b);

  return distinct.map((color) => {
    const sprite = createSprite();
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (colors[row * GRID_SIZE + col] === color) {
          paintPixel(sprite, row, col, color);
        }
      }
    }
    return sprite;
  });
}
