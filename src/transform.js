import { GRID_SIZE } from './model.js';

// Rotate/mirror apply to a whole grid (FUNCTIONAL_SPEC.md §5.5 — an
// arbitrary mid-grid rectangle is ambiguous to rotate/mirror, so these
// tools are whole-grid-only and the caller disables them when a
// partial rectangle is selected instead).

// 90-degree clockwise rotation: new[row][col] = old[N-1-col][row].
// Since color is per-row, every pixel landing in new row R was pulled
// from old column R (across all 16 old rows, i.e. old rows 0..15 at
// column R) — those old rows can have different colors, so the new
// row's color is resolved by majority vote over the *old rows* that
// contributed an opaque pixel there. Ties are broken by lowest palette
// index (deterministic, simplest resolvable rule — spec leaves the
// exact tie-break as an implementation detail).
export function rotateCW(sprite) {
  const oldOpacity = sprite.opacity;
  const oldColors = sprite.rowColors;
  const newOpacity = new Uint8Array(GRID_SIZE * GRID_SIZE);

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      newOpacity[row * GRID_SIZE + col] = oldOpacity[(GRID_SIZE - 1 - col) * GRID_SIZE + row];
    }
  }

  const newColors = new Uint8Array(GRID_SIZE);
  for (let row = 0; row < GRID_SIZE; row++) {
    const counts = new Map();
    for (let oldRow = 0; oldRow < GRID_SIZE; oldRow++) {
      if (oldOpacity[oldRow * GRID_SIZE + row]) {
        const color = oldColors[oldRow];
        counts.set(color, (counts.get(color) || 0) + 1);
      }
    }
    let winner = 0;
    let winnerCount = 0;
    for (let color = 1; color <= 15; color++) {
      const count = counts.get(color) || 0;
      if (count > winnerCount) {
        winnerCount = count;
        winner = color;
      }
    }
    newColors[row] = winner;
  }

  sprite.opacity = newOpacity;
  sprite.rowColors = newColors;
}

// Horizontal flip (left-right): row membership is unaffected, so row
// colors are preserved as-is.
export function mirrorHorizontal(sprite) {
  const old = sprite.opacity;
  const next = new Uint8Array(GRID_SIZE * GRID_SIZE);
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      next[row * GRID_SIZE + col] = old[row * GRID_SIZE + (GRID_SIZE - 1 - col)];
    }
  }
  sprite.opacity = next;
}

// Vertical flip (top-bottom): rows swap order, so row colors move with
// their row.
export function mirrorVertical(sprite) {
  const oldOpacity = sprite.opacity;
  const oldColors = sprite.rowColors;
  const newOpacity = new Uint8Array(GRID_SIZE * GRID_SIZE);
  const newColors = new Uint8Array(GRID_SIZE);
  for (let row = 0; row < GRID_SIZE; row++) {
    const srcRow = GRID_SIZE - 1 - row;
    for (let col = 0; col < GRID_SIZE; col++) {
      newOpacity[row * GRID_SIZE + col] = oldOpacity[srcRow * GRID_SIZE + col];
    }
    newColors[row] = oldColors[srcRow];
  }
  sprite.opacity = newOpacity;
  sprite.rowColors = newColors;
}
