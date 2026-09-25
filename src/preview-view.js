import { GRID_SIZE } from './model.js';
import { compositeGrids } from './composite.js';
import { MSX2_PALETTE } from './palette.js';
import { ICONS } from './icons.js';

// Selectable px-per-source-pixel zoom levels; the preview panel is 256px wide.
export const PREVIEW_SCALES = [4, 6, 8];
const DEFAULT_SCALE = 6;
// Total visible preview area is 32x32 source pixels (a 16x16 sprite
// plus 8 cells of drag slack on each side).
const PADDING_CELLS = 8;

// Renders the live OR-composited preview and lets the user drag each
// grid's thumbnail to reposition it (FUNCTIONAL_SPEC.md §4, §9
// resolved decision #4). `onChange` fires after every drag so callers
// can persist/redraw dependents.
// `opts`: { history, getHover, onCompositeHover } — `history`, see
// history.js; coalesces each drag gesture into a single undo entry.
// `getHover()`, if given, returns the app-wide hovered
// `{ row, col, gridIndex } | null` cell (see grid-view.js) so the
// preview can highlight the same pixel at its composited world
// position. `onCompositeHover(color)`, if given, is called on every
// draw with the OR-composited color (0 = transparent) at that world
// position, or `null` when nothing is hovered.
export function createPreviewView(project, onChange, opts = {}) {
  const history = opts.history;

  const wrapper = document.createElement('div');
  wrapper.className = 'preview-wrapper';

  const canvas = document.createElement('canvas');
  canvas.className = 'preview-canvas';
  wrapper.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let scale = DEFAULT_SCALE;
  let padding = PADDING_CELLS * scale;
  let dragState = null; // { index, startClientX, startClientY, startSpriteX, startSpriteY }

  function worldToCanvas(wx, wy) {
    return [wx * scale + padding, wy * scale + padding];
  }
  function canvasToWorld(cx, cy) {
    return [(cx - padding) / scale, (cy - padding) / scale];
  }

  function resize() {
    const size = GRID_SIZE * scale + padding * 2;
    if (canvas.width !== size) canvas.width = size;
    if (canvas.height !== size) canvas.height = size;
  }

  function drawCheckerboard() {
    const cell = scale;
    for (let y = 0; y < canvas.height; y += cell) {
      for (let x = 0; x < canvas.width; x += cell) {
        ctx.fillStyle = ((x / cell + y / cell) % 2 === 0) ? '#1d1f24' : '#23262c';
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }

  function draw() {
    resize();
    drawCheckerboard();

    const { minX, minY, width, height, pixels } = compositeGrids(project.grids);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = pixels[y * width + x];
        if (!c) continue;
        const [cx, cy] = worldToCanvas(minX + x, minY + y);
        ctx.fillStyle = MSX2_PALETTE[c];
        ctx.fillRect(cx, cy, scale, scale);
      }
    }

    const hover = opts.getHover && opts.getHover();
    const hoverSprite = hover && project.grids[hover.gridIndex];
    if (hoverSprite) {
      const worldX = hoverSprite.x + hover.col;
      const worldY = hoverSprite.y + hover.row;
      const [hx, hy] = worldToCanvas(worldX, worldY);
      ctx.fillStyle = 'rgba(57, 214, 138, 0.22)';
      ctx.fillRect(hx, hy, scale, scale);
      ctx.strokeStyle = '#39d68a';
      ctx.lineWidth = 1;
      ctx.strokeRect(hx + 0.5, hy + 0.5, scale - 1, scale - 1);

      // The composited color at this world position can differ from the
      // hovered grid's own pixel color (other OR-grouped sprites may
      // contribute) — report it back so the caller can display it too.
      let compositeColor = 0;
      if (worldX >= minX && worldX < minX + width && worldY >= minY && worldY < minY + height) {
        compositeColor = pixels[(worldY - minY) * width + (worldX - minX)];
      }
      opts.onCompositeHover && opts.onCompositeHover(compositeColor);
    } else {
      opts.onCompositeHover && opts.onCompositeHover(null);
    }
  }

  function hitTestSprite(worldX, worldY) {
    // Frontmost (lowest index = highest priority) sprite under the point wins the drag.
    for (let i = 0; i < project.grids.length; i++) {
      const s = project.grids[i];
      if (worldX >= s.x && worldX < s.x + GRID_SIZE && worldY >= s.y && worldY < s.y + GRID_SIZE) {
        return i;
      }
    }
    return -1;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleFactor = canvas.width / rect.width;
    const cx = (e.clientX - rect.left) * scaleFactor;
    const cy = (e.clientY - rect.top) * scaleFactor;
    const [wx, wy] = canvasToWorld(cx, cy);
    const index = hitTestSprite(Math.floor(wx), Math.floor(wy));
    if (index === -1) return;
    canvas.setPointerCapture(e.pointerId);
    history && history.begin();
    const sprite = project.grids[index];
    dragState = {
      index,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startSpriteX: sprite.x,
      startSpriteY: sprite.y,
      clientToWorld: scaleFactor / scale,
    };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const dx = (e.clientX - dragState.startClientX) * dragState.clientToWorld;
    const dy = (e.clientY - dragState.startClientY) * dragState.clientToWorld;
    const sprite = project.grids[dragState.index];
    sprite.x = Math.round(dragState.startSpriteX + dx);
    sprite.y = Math.round(dragState.startSpriteY + dy);
    draw();
    onChange && onChange();
  });

  function endDrag() {
    if (dragState) history && history.commit();
    dragState = null;
  }
  function cancelDrag() {
    if (dragState) history && history.cancel();
    dragState = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', cancelDrag);

  const recenterBtn = document.createElement('button');
  recenterBtn.type = 'button';
  recenterBtn.className = 'recenter-btn';
  recenterBtn.innerHTML = ICONS.recenter;
  recenterBtn.append('Recenter');
  recenterBtn.title = 'Move every sprite back to the same origin (0,0)';
  recenterBtn.addEventListener('click', () => {
    const mutate = () => project.grids.forEach((s) => { s.x = 0; s.y = 0; });
    if (history) history.perform(mutate); else mutate();
    draw();
    onChange && onChange();
  });
  wrapper.appendChild(recenterBtn);

  function setScale(next) {
    scale = next;
    padding = PADDING_CELLS * scale;
    draw();
  }

  draw();
  return { element: wrapper, draw, setScale, getScale: () => scale };
}
