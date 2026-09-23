import { encodePattern, encodeColorTable } from './pattern.js';

// Concatenated 32-byte pattern blocks, one per grid, in grid order —
// ready to POKE/load directly into VRAM at the pattern generator table
// address (FUNCTIONAL_SPEC.md §7).
export function exportPatternsBin(project) {
  const out = new Uint8Array(project.grids.length * 32);
  project.grids.forEach((sprite, i) => out.set(encodePattern(sprite), i * 32));
  return out;
}

// Concatenated 16-byte color/attribute blocks, one per grid, in grid
// order — ready to load at the sprite color table address.
export function exportColorsBin(project) {
  const out = new Uint8Array(project.grids.length * 16);
  project.grids.forEach((sprite, i) => out.set(encodeColorTable(sprite), i * 16));
  return out;
}
