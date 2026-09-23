import { GRID_SIZE, cloneSprite } from './model.js';

// Selection is transient UI state, not part of the Project model:
//   { kind: 'whole' } | { kind: 'rect', r0, c0, r1, c1 } (inclusive, normalized).
// Clipboard is one of:
//   { kind: 'whole', sprite: Sprite }
//   { kind: 'rect', width, height, opacity: Uint8Array(width*height), rowColors: Uint8Array(height) }

export function normalizeRect(r0, c0, r1, c1) {
  return {
    r0: Math.min(r0, r1),
    c0: Math.min(c0, c1),
    r1: Math.max(r0, r1),
    c1: Math.max(c0, c1),
  };
}

// Captures opacity bits + row colors for the selected region
// (FUNCTIONAL_SPEC.md §5.4).
export function copySelection(sprite, selection) {
  if (!selection) return null;
  if (selection.kind === 'whole') {
    return { kind: 'whole', sprite: cloneSprite(sprite) };
  }
  const { r0, c0, r1, c1 } = selection;
  const width = c1 - c0 + 1;
  const height = r1 - r0 + 1;
  const opacity = new Uint8Array(width * height);
  const rowColors = new Uint8Array(height);
  for (let r = 0; r < height; r++) {
    rowColors[r] = sprite.rowColors[r0 + r];
    for (let c = 0; c < width; c++) {
      opacity[r * width + c] = sprite.opacity[(r0 + r) * GRID_SIZE + (c0 + c)];
    }
  }
  return { kind: 'rect', width, height, opacity, rowColors };
}

// Sets every pixel in the selection to transparent. Row colors are left
// unchanged (FUNCTIONAL_SPEC.md §5.4 resolved default — a transparent
// row has no visible color anyway).
export function clearSelectionPixels(sprite, selection) {
  if (!selection) return;
  if (selection.kind === 'whole') {
    sprite.opacity.fill(0);
    return;
  }
  const { r0, c0, r1, c1 } = selection;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      sprite.opacity[r * GRID_SIZE + c] = 0;
    }
  }
}

export function cutSelection(sprite, selection) {
  const clip = copySelection(sprite, selection);
  clearSelectionPixels(sprite, selection);
  return clip;
}

// Whole-grid paste: replace the target's pattern/colors/OR-mode outright
// (FUNCTIONAL_SPEC.md §5.4 — immediate replace, no drag). The target's
// preview position (x/y) is left untouched: that's a property of where
// the grid sits, not of what's painted into it.
export function pasteWhole(targetSprite, clip) {
  targetSprite.opacity.set(clip.sprite.opacity);
  targetSprite.rowColors.set(clip.sprite.rowColors);
  targetSprite.orMode = clip.sprite.orMode;
}

// Rect paste at a given top-left (row, col) in the target grid, clipped
// to grid bounds. Per §5.1, any row touched by an opaque pasted pixel
// has its color overwritten by the clipboard's row color for that row.
export function pasteRectAt(targetSprite, clip, row, col) {
  for (let r = 0; r < clip.height; r++) {
    const targetRow = row + r;
    if (targetRow < 0 || targetRow >= GRID_SIZE) continue;
    for (let c = 0; c < clip.width; c++) {
      const targetCol = col + c;
      if (targetCol < 0 || targetCol >= GRID_SIZE) continue;
      if (!clip.opacity[r * clip.width + c]) continue;
      targetSprite.opacity[targetRow * GRID_SIZE + targetCol] = 1;
      targetSprite.rowColors[targetRow] = clip.rowColors[r];
    }
  }
}
