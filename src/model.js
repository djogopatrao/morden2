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

// Removes the grid at `index`. Grid 0 cannot be removed to preserve a permanent first sprite.
// Only grids N where N > 0 may be removed when multiple grids exist (FUNCTIONAL_SPEC.md §5.2)
export function removeGrid(project, index) {
  // Enforce: grid 0 is pinned/protected; cannot remove the first grid
  if (index === 0) return false;
  
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
