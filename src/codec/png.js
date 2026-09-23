import { GRID_SIZE, getPixel } from '../model.js';
import { MSX2_PALETTE } from '../palette.js';
import { compositeGrids } from '../composite.js';

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// One grid's own pixels alone against transparency (FUNCTIONAL_SPEC.md
// §7's "PNG" row) — a 16x16 canvas, no cross-grid OR compositing.
export function spriteToCanvas(sprite) {
  const canvas = document.createElement('canvas');
  canvas.width = GRID_SIZE;
  canvas.height = GRID_SIZE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(GRID_SIZE, GRID_SIZE);
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const i = (row * GRID_SIZE + col) * 4;
      if (getPixel(sprite, row, col)) {
        const [r, g, b] = hexToRgb(MSX2_PALETTE[sprite.rowColors[row]]);
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// The full OR-composite preview, sized to its actual bounding box
// (reuses Phase 3's compositeGrids, same as the on-screen preview).
export function compositeToCanvas(grids) {
  const { width, height, pixels } = compositeGrids(grids);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(width, 1);
  canvas.height = Math.max(height, 1);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = pixels[y * width + x];
      if (!c) continue;
      const i = (y * width + x) * 4;
      const [r, g, b] = hexToRgb(MSX2_PALETTE[c]);
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function rgbKey(r, g, b) {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

// -1 when the color isn't one of the 15 fixed palette entries. Rebuilt
// from MSX2_PALETTE on every call (cheap — 16 entries) rather than
// cached at module-load time, since MSX2_PALETTE's contents can change
// (see palette.js's setPaletteType) after this module is first imported.
export function rgbToPaletteIndex(r, g, b) {
  const key = rgbKey(r, g, b);
  for (let i = 1; i < MSX2_PALETTE.length; i++) {
    if (MSX2_PALETTE[i] === key) return i;
  }
  return -1;
}

// Validates and decodes raw RGBA pixel data into a Uint8Array(256) of
// palette indices (0 = transparent, 1-15 = color), per
// FUNCTIONAL_SPEC.md §6.2: exactly 16x16, every pixel either fully
// transparent or an exact fixed-palette color, no anti-aliasing/other
// colors. `imageData` only needs `{ data, width, height }` (a real
// ImageData works, and so does a plain object — keeps this testable
// without a DOM canvas). Throws with a clear message on any violation.
export function decodePngColors(imageData) {
  const { data, width, height } = imageData;
  if (width !== GRID_SIZE || height !== GRID_SIZE) {
    throw new Error(`PNG must be exactly ${GRID_SIZE}x${GRID_SIZE} pixels (got ${width}x${height}).`);
  }
  const colors = new Uint8Array(GRID_SIZE * GRID_SIZE);
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const i = row * GRID_SIZE + col;
      const o = i * 4;
      const alpha = data[o + 3];
      if (alpha === 0) {
        colors[i] = 0;
        continue;
      }
      if (alpha !== 255) {
        throw new Error(`PNG pixel at row ${row}, col ${col} has partial transparency — only fully opaque or fully transparent pixels are allowed.`);
      }
      const idx = rgbToPaletteIndex(data[o], data[o + 1], data[o + 2]);
      if (idx === -1) {
        throw new Error(`PNG pixel at row ${row}, col ${col} is not a color from the fixed MSX2 palette.`);
      }
      colors[i] = idx;
    }
  }
  return colors;
}
