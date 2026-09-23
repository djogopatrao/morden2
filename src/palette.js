// Two selectable 16-entry palettes (index 0 = transparent/unused,
// 1-15 = the real colors). Both are fixed, not user-editable per
// FUNCTIONAL_SPEC.md §2.2 — "fixed" means "one of these two tables",
// not "hand-tunable swatches".

// The standard MSX 16-color sprite-mode default palette.
const REGULAR_PALETTE = [
  null, // 0: transparent
  '#010101', // 1  black
  '#3eb849', // 2  medium green
  '#74d07d', // 3  light green
  '#5955e0', // 4  dark blue
  '#8076f1', // 5  light blue
  '#b95e51', // 6  dark red
  '#65dbef', // 7  cyan
  '#db6559', // 8  medium red
  '#ff897d', // 9  light red
  '#ccc35e', // 10 dark yellow
  '#ded087', // 11 light yellow
  '#3aa241', // 12 dark green
  '#b766b5', // 13 magenta
  '#cccccc', // 14 gray
  '#ffffff', // 15 white
];

// SCREEN 8's palette: each entry is a raw (r, g, b) triple with
// r, g in [0,7] and b in [0,3], scaled up to 8-bit hex for display.
function screen8Hex(r, g, b) {
  const scale = (v, max) => Math.round((v / max) * 255);
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(scale(r, 7))}${toHex(scale(g, 7))}${toHex(scale(b, 3))}`;
}
const SCREEN8_RGB = [
  null, // 0: transparent
  [0, 0, 1],
  [3, 0, 0],
  [3, 0, 1],
  [0, 3, 0],
  [0, 3, 1],
  [3, 3, 0],
  [3, 3, 1],
  [7, 4, 0],
  [0, 0, 3],
  [7, 0, 0],
  [7, 0, 3],
  [0, 7, 0],
  [0, 7, 3],
  [7, 7, 0],
  [7, 7, 3],
];
const SCREEN8_PALETTE = SCREEN8_RGB.map((rgb) => (rgb ? screen8Hex(...rgb) : null));

export const PALETTES = { regular: REGULAR_PALETTE, screen8: SCREEN8_PALETTE };
export const DEFAULT_PALETTE_TYPE = 'regular';

// `MSX2_PALETTE` is the *active* palette: every renderer/codec module
// imports this same array and indexes into it directly (`MSX2_PALETTE[i]`).
// `setPaletteType` overwrites its contents in place — rather than
// reassigning the export, which ES module live bindings don't allow a
// consumer to see anyway — so every already-imported reference picks up
// the switch without each module needing to re-fetch it.
export const MSX2_PALETTE = REGULAR_PALETTE.slice();
export let paletteType = DEFAULT_PALETTE_TYPE;

export function setPaletteType(type) {
  const source = PALETTES[type];
  if (!source) throw new Error(`Unknown palette type: ${type}`);
  paletteType = type;
  for (let i = 0; i < MSX2_PALETTE.length; i++) MSX2_PALETTE[i] = source[i];
}
