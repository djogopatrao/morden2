import { DEFAULT_PALETTE_TYPE } from './palette.js';

export const GRID_SIZE = 16;
export const MAX_GRIDS = 8;

// A Sprite is one hardware sprite plane: a 16x16 opacity bitmap with one
// color per row (matches the real MSX2 sprite color table constraint —
// see FUNCTIONAL_SPEC.md §2.1/§2.2), an OR-mode flag, and a position
// offset used by the composite preview.
export function createSprite(x = 0, y = 0) {
  return {
    opacity: new Uint8Array(GRID_SIZE * GRID_SIZE), // row-major, 0/1
    rowColors: new Uint8Array(GRID_SIZE), // 0 = unset, 1-15 = palette index
    orMode: false,
    x,
    y,
  };
}

// `paletteType`: 'regular' | 'screen8' — see palette.js. Which colors
// the sprite palette indices 1-15 actually render as, saved/restored
// alongside the grids (persistence.js) since it's part of the project.
export function createProject() {
  return { grids: [createSprite()], paletteType: DEFAULT_PALETTE_TYPE };
}

// Appends a new empty grid to the right of the last one. Returns false
// (no-op) once MAX_GRIDS is reached — FUNCTIONAL_SPEC.md §5.2.
export function addGrid(project) {
  if (project.grids.length >= MAX_GRIDS) return false;
  project.grids.push(createSprite());
  return true;
}

// Removes the grid at `index`. All grids are removable when more than one exists.
// When only one grid remains (any index), it is protected per MSX2 constraint — no first sprite required.
export function removeGrid(project, index) {
  if (project.grids.length <= 1) return false;
  if (index < 0 || index >= project.grids.length) return false;
  project.grids.splice(index, 1);
  return true;
}

export function getPixel(sprite, row, col) {
  return sprite.opacity[row * GRID_SIZE + col];
}

export function setPixel(sprite, row, col, opaque) {
  sprite.opacity[row * GRID_SIZE + col] = opaque ? 1 : 0;
}

// colorIndex: 0 = transparent (erase), 1-15 = a real palette color.
// Painting with a real color overwrites the whole row's color
// unconditionally (rows are single-color — FUNCTIONAL_SPEC.md §5.1).
export function paintPixel(sprite, row, col, colorIndex) {
  if (colorIndex === 0) {
    setPixel(sprite, row, col, false);
    return;
  }
  setPixel(sprite, row, col, true);
  sprite.rowColors[row] = colorIndex;
}

// Recolors every opaque pixel in a row without changing which pixels
// are opaque (FUNCTIONAL_SPEC.md §5.1, the "c" swatch behavior).
export function recolorRow(sprite, row, colorIndex) {
  if (colorIndex === 0) return;
  sprite.rowColors[row] = colorIndex;
}

export function cloneSprite(sprite) {
  return {
    opacity: sprite.opacity.slice(),
    rowColors: sprite.rowColors.slice(),
    orMode: sprite.orMode,
    x: sprite.x,
    y: sprite.y,
  };
}

// Paint-bucket fill: every pixel 4-connected to (row, col) that shows
// the same color as it (0 = transparent) gets painted with `colorIndex`
// via paintPixel, so colorIndex 0 erases the region. The region is found
// before anything is painted, since painting recolors whole rows.
export function bucketFill(sprite, row, col, colorIndex) {
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;
  const colorAt = (r, c) => (getPixel(sprite, r, c) ? sprite.rowColors[r] : 0);
  const startColor = colorAt(row, col);
  if (startColor === colorIndex) return;

  const region = [];
  const seen = new Uint8Array(GRID_SIZE * GRID_SIZE);
  const stack = [[row, col]];
  seen[row * GRID_SIZE + col] = 1;
  while (stack.length > 0) {
    const [r, c] = stack.pop();
    region.push([r, c]);
    for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const idx = nr * GRID_SIZE + nc;
      if (seen[idx] || colorAt(nr, nc) !== startColor) continue;
      seen[idx] = 1;
      stack.push([nr, nc]);
    }
  }
  for (const [r, c] of region) paintPixel(sprite, r, c, colorIndex);
}
