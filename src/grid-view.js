import { GRID_SIZE, getPixel, paintPixel, recolorRow } from './model.js';
import { MSX2_PALETTE } from './palette.js';
import { normalizeRect } from './clipboard.js';

const CELL = 20;

// Renders one Sprite as a paintable pixel grid + its per-row "c" color
// column, plus a header with remove/OR-mode controls. `state` is a
// shared { currentColor, tool } object (`tool`: 'paint' | 'select') so
// every grid view uses the same current paint color / tool mode.
//
// `opts`: { canRemove, onRemove, onToggleOr, label, history, selection,
//           onActivate, paste, onPasteCommit, onPasteCancel, getHover,
//           onHover }
// - `opts.history`, if given (see history.js), coalesces each paint
//   stroke / drag / selection gesture into a single undo entry (only
//   mutating gestures — paint — actually push history; selection
//   itself is not undoable state).
// - `opts.selection` (only meaningful in 'select' tool mode): a
//   `{ get(): selection|null, set(selection) }` accessor for this
//   grid's slice of the app-wide selection (selection is scoped to a
//   single grid at a time — FUNCTIONAL_SPEC.md §5.3).
// - `opts.onActivate()`: called on any pointerdown/header-click so the
//   caller can track "last-interacted-with grid" (paste target).
// - `opts.paste`, if this grid is the current floating-paste target:
//   `{ clip, x, y }` (see clipboard.js's rect clip shape). Dragging is
//   handled locally; `opts.onPasteCommit(row, col)` / `onPasteCancel()`
//   fire when the caller should finalize/abort it.
// - `opts.getHover()`: returns the app-wide hovered `{ row, col } | null`
//   cell (shared across all grid views) so every grid can highlight the
//   same coordinate as the one the pointer is currently over.
// - `opts.onHover(cell)`: called on pointermove/pointerleave over this
//   grid's canvas with the hovered `{ row, col } | null`.
export function createGridView(sprite, state, onChange, opts = {}) {
  const history = opts.history;
  const wrapper = document.createElement('div');
  wrapper.className = 'grid-view';

  const header = document.createElement('div');
  header.className = 'grid-header';

  const label = document.createElement('span');
  label.className = 'grid-label';
  label.textContent = opts.label || '';
  label.title = 'Select the whole sprite';
  label.tabIndex = 0;
  label.setAttribute('role', 'button');
  label.setAttribute('aria-label', `Select the whole ${opts.label || 'sprite'}`);
  const activateWholeSelection = () => {
    opts.onActivate && opts.onActivate();
    opts.selection && opts.selection.set({ kind: 'whole' });
  };
  label.addEventListener('click', activateWholeSelection);
  label.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateWholeSelection();
    }
  });
  header.appendChild(label);

  const orToggle = document.createElement('button');
  orToggle.type = 'button';
  orToggle.className = 'or-toggle' + (sprite.orMode ? ' active' : '');
  orToggle.textContent = 'OR';
  orToggle.title = 'Toggle OR-color mode for this sprite';
  orToggle.setAttribute('aria-pressed', String(!!sprite.orMode));
  orToggle.setAttribute('aria-label', `Toggle OR-color mode for ${opts.label || 'this sprite'}`);
  orToggle.addEventListener('click', () => {
    history && history.begin();
    sprite.orMode = !sprite.orMode;
    orToggle.classList.toggle('active', sprite.orMode);
    orToggle.setAttribute('aria-pressed', String(sprite.orMode));
    history && history.commit();
    opts.onToggleOr && opts.onToggleOr();
    onChange && onChange();
  });
  header.appendChild(orToggle);

  if (opts.canRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove this sprite';
    removeBtn.setAttribute('aria-label', `Remove ${opts.label || 'this sprite'}`);
    removeBtn.addEventListener('click', () => {
      opts.onRemove && opts.onRemove();
    });
    header.appendChild(removeBtn);
  }

  wrapper.appendChild(header);

  const body = document.createElement('div');
  body.className = 'grid-body';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'grid-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.width = GRID_SIZE * CELL;
  canvas.height = GRID_SIZE * CELL;
  canvas.className = 'grid-canvas';
  canvasWrap.appendChild(canvas);

  const rowColorCol = document.createElement('div');
  rowColorCol.className = 'row-color-col';
  const rowSwatches = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const sw = document.createElement('div');
    sw.className = 'row-swatch';
    sw.style.height = CELL + 'px';
    sw.tabIndex = 0;
    sw.setAttribute('role', 'button');
    sw.setAttribute('aria-label', `Recolor row ${r} with the selected paint color`);
    sw.title = `Recolor row ${r}`;
    rowSwatches.push(sw);
    rowColorCol.appendChild(sw);
  }

  body.appendChild(canvasWrap);
  body.appendChild(rowColorCol);
  wrapper.appendChild(body);

  const ctx = canvas.getContext('2d');

  let selectDragStart = null;
  let selectDragCurrent = null;
  let paste = opts.paste ? { clip: opts.paste.clip, x: opts.paste.x, y: opts.paste.y } : null;
  let pasteDrag = null;

  function currentSelectionRect() {
    if (selectDragStart && selectDragCurrent) {
      return normalizeRect(selectDragStart.row, selectDragStart.col, selectDragCurrent.row, selectDragCurrent.col);
    }
    const sel = opts.selection && opts.selection.get();
    if (!sel) return null;
    if (sel.kind === 'whole') return { r0: 0, c0: 0, r1: GRID_SIZE - 1, c1: GRID_SIZE - 1 };
    return sel;
  }

  const TRANSPARENT_LIGHT = '#d4d4d4';
  const TRANSPARENT_DARK = '#8c8c8c';

  // Transparent cells get their own 2x2 checkerboard (finer than the
  // 16x16 grid itself), so "transparent" is legible as a texture rather
  // than relying on contrast against neighboring cells alone.
  function drawTransparentCell(x, y) {
    const half = CELL / 2;
    ctx.fillStyle = TRANSPARENT_LIGHT;
    ctx.fillRect(x, y, half, half);
    ctx.fillRect(x + half, y + half, half, half);
    ctx.fillStyle = TRANSPARENT_DARK;
    ctx.fillRect(x + half, y, half, half);
    ctx.fillRect(x, y + half, half, half);
  }

  function draw() {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const x = col * CELL;
        const y = row * CELL;
        if (getPixel(sprite, row, col)) {
          ctx.fillStyle = MSX2_PALETTE[sprite.rowColors[row]] || '#ff00ff';
          ctx.fillRect(x, y, CELL, CELL);
        } else {
          drawTransparentCell(x, y);
        }
      }
    }
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL + 0.5, 0);
      ctx.lineTo(i * CELL + 0.5, GRID_SIZE * CELL);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL + 0.5);
      ctx.lineTo(GRID_SIZE * CELL, i * CELL + 0.5);
      ctx.stroke();
    }
    for (let row = 0; row < GRID_SIZE; row++) {
      const c = sprite.rowColors[row];
      rowSwatches[row].style.background = c ? MSX2_PALETTE[c] : '#ffffff';
      rowSwatches[row].textContent = c ? String(c) : '';
    }

    const selRect = currentSelectionRect();
    if (selRect) {
      const x = selRect.c0 * CELL;
      const y = selRect.r0 * CELL;
      const w = (selRect.c1 - selRect.c0 + 1) * CELL;
      const h = (selRect.r1 - selRect.r0 + 1) * CELL;
      ctx.fillStyle = 'rgba(70,140,255,0.25)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#4a90ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    if (paste) {
      for (let r = 0; r < paste.clip.height; r++) {
        const targetRow = paste.y + r;
        if (targetRow < 0 || targetRow >= GRID_SIZE) continue;
        for (let c = 0; c < paste.clip.width; c++) {
          const targetCol = paste.x + c;
          if (targetCol < 0 || targetCol >= GRID_SIZE) continue;
          if (!paste.clip.opacity[r * paste.clip.width + c]) continue;
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = MSX2_PALETTE[paste.clip.rowColors[r]] || '#ff00ff';
          ctx.fillRect(targetCol * CELL, targetRow * CELL, CELL, CELL);
          ctx.globalAlpha = 1;
        }
      }
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 2;
      ctx.strokeRect(paste.x * CELL + 1, paste.y * CELL + 1, paste.clip.width * CELL - 2, paste.clip.height * CELL - 2);
    }

    // Cross-sprite hover highlight: the same (row, col) cell in every
    // other grid, so the user can compare a pixel's opacity/color across
    // sprites at a glance (useful for lining up OR-composited pixels).
    const hover = opts.getHover && opts.getHover();
    if (hover) {
      const hx = hover.col * CELL;
      const hy = hover.row * CELL;
      ctx.fillStyle = 'rgba(57, 214, 138, 0.22)';
      ctx.fillRect(hx, hy, CELL, CELL);
      ctx.strokeStyle = '#39d68a';
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 1, hy + 1, CELL - 2, CELL - 2);
    }
  }

  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * GRID_SIZE);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * GRID_SIZE);
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
    return { row, col };
  }

  function handlePaint(e) {
    const cell = cellFromEvent(e);
    if (!cell) return;
    paintPixel(sprite, cell.row, cell.col, state.currentColor);
    draw();
    onChange && onChange();
  }

  function cellDelta(e, dragInfo) {
    const rect = canvas.getBoundingClientRect();
    const dx = ((e.clientX - dragInfo.startClientX) / rect.width) * GRID_SIZE;
    const dy = ((e.clientY - dragInfo.startClientY) / rect.height) * GRID_SIZE;
    return { dx, dy };
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    opts.onActivate && opts.onActivate();
    if (paste) {
      pasteDrag = { startClientX: e.clientX, startClientY: e.clientY, startX: paste.x, startY: paste.y };
      return;
    }
    if (state.tool === 'select') {
      const cell = cellFromEvent(e);
      if (!cell) return;
      selectDragStart = cell;
      selectDragCurrent = cell;
      draw();
      return;
    }
    history && history.begin();
    handlePaint(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    const hovered = cellFromEvent(e);
    const hoveredWithColor = hovered
      ? { row: hovered.row, col: hovered.col, color: getPixel(sprite, hovered.row, hovered.col) ? sprite.rowColors[hovered.row] : 0 }
      : null;
    opts.onHover && opts.onHover(hoveredWithColor);
    if (pasteDrag) {
      const { dx, dy } = cellDelta(e, pasteDrag);
      paste.x = Math.round(pasteDrag.startX + dx);
      paste.y = Math.round(pasteDrag.startY + dy);
      draw();
      return;
    }
    if (selectDragStart) {
      const cell = cellFromEvent(e);
      if (cell) {
        selectDragCurrent = cell;
        draw();
      }
      return;
    }
    if (e.buttons & 1) handlePaint(e);
  });
  canvas.addEventListener('pointerleave', () => {
    opts.onHover && opts.onHover(null);
  });
  canvas.addEventListener('pointerup', () => {
    if (pasteDrag) {
      pasteDrag = null;
      return;
    }
    if (selectDragStart) {
      const rect = normalizeRect(selectDragStart.row, selectDragStart.col, selectDragCurrent.row, selectDragCurrent.col);
      selectDragStart = null;
      selectDragCurrent = null;
      opts.selection && opts.selection.set({ kind: 'rect', ...rect });
      return;
    }
    history && history.commit();
  });
  canvas.addEventListener('pointercancel', () => {
    if (pasteDrag) {
      pasteDrag = null;
      return;
    }
    if (selectDragStart) {
      selectDragStart = null;
      selectDragCurrent = null;
      draw();
      return;
    }
    history && history.cancel();
  });

  function doRecolorRow(row) {
    opts.onActivate && opts.onActivate();
    history && history.begin();
    recolorRow(sprite, row, state.currentColor);
    draw();
    history && history.commit();
    onChange && onChange();
  }
  rowSwatches.forEach((sw, row) => {
    sw.addEventListener('click', () => doRecolorRow(row));
    sw.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        doRecolorRow(row);
      }
    });
  });

  function outsideClickCommits(e) {
    if (!wrapper.contains(e.target)) commitPaste();
  }
  if (paste) {
    document.addEventListener('pointerdown', outsideClickCommits, { capture: true });
  }

  function commitPaste() {
    if (!paste) return;
    const { x, y } = paste;
    paste = null;
    document.removeEventListener('pointerdown', outsideClickCommits, { capture: true });
    opts.onPasteCommit && opts.onPasteCommit(y, x);
    draw();
  }

  function cancelPaste() {
    if (!paste) return;
    paste = null;
    document.removeEventListener('pointerdown', outsideClickCommits, { capture: true });
    opts.onPasteCancel && opts.onPasteCancel();
    draw();
  }

  draw();
  return { element: wrapper, draw, commitPaste, cancelPaste };
}
