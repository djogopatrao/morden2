import { GRID_SIZE, getPixel } from './model.js';

// Groups grids into priority groups per the real MSX2 hardware OR rule
// (FUNCTIONAL_SPEC.md §2.3): a grid with orMode=true shares priority
// with, and OR-combines into, the nearest preceding grid (lower array
// index = higher priority) that has orMode=false. A run of consecutive
// orMode=true grids following one orMode=false grid all belong to that
// same group and OR-combine with each other too.
//
// An orMode=true grid with no preceding orMode=false grid has no
// anchor to borrow priority from on real hardware (a footgun the spec
// calls out). v1 fallback: treat it as its own anchor so the tool still
// renders it deterministically instead of silently dropping it.
export function groupGrids(grids) {
  const groups = [];
  let current = null;
  grids.forEach((sprite, index) => {
    if (!sprite.orMode || !current) {
      current = { anchorIndex: index, members: [index] };
      groups.push(current);
    } else {
      current.members.push(index);
    }
  });
  return groups;
}

// Composites all grids per the real hardware OR rule into a flat pixel
// buffer covering the bounding box of every grid's current 16x16
// placement (grids may have negative or large x/y offsets).
//
// Returns { minX, minY, width, height, pixels } where
// pixels[y*width+x] is 0 (transparent) or a palette color index 1-15,
// for the world coordinate (minX+x, minY+y).
export function compositeGrids(grids) {
  if (grids.length === 0) {
    return { minX: 0, minY: 0, width: 0, height: 0, pixels: new Uint8Array(0) };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const sprite of grids) {
    minX = Math.min(minX, sprite.x);
    minY = Math.min(minY, sprite.y);
    maxX = Math.max(maxX, sprite.x + GRID_SIZE);
    maxY = Math.max(maxY, sprite.y + GRID_SIZE);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const pixels = new Uint8Array(width * height);

  const groups = groupGrids(grids);

  for (let y = 0; y < height; y++) {
    const worldY = y + minY;
    for (let x = 0; x < width; x++) {
      const worldX = x + minX;
      let result = 0;
      for (const group of groups) {
        let orColor = 0;
        let hit = false;
        for (const idx of group.members) {
          const sprite = grids[idx];
          const localX = worldX - sprite.x;
          const localY = worldY - sprite.y;
          if (localX < 0 || localX >= GRID_SIZE || localY < 0 || localY >= GRID_SIZE) continue;
          if (getPixel(sprite, localY, localX)) {
            hit = true;
            orColor |= sprite.rowColors[localY];
          }
        }
        if (hit) {
          result = orColor;
          break; // this group's priority beats every later group
        }
      }
      pixels[y * width + x] = result;
    }
  }

  return { minX, minY, width, height, pixels };
}
