import { createProject, addGrid, removeGrid, getPixel, GRID_SIZE, MAX_GRIDS } from './model.js';
import { createGridView } from './grid-view.js';
import { createPaletteView } from './palette-view.js';
import { createPreviewView, PREVIEW_SCALES } from './preview-view.js';
import { createHistory } from './history.js';
import { copySelection, cutSelection, clearSelectionPixels, pasteWhole, pasteRectAt } from './clipboard.js';
import { rotateCW, mirrorHorizontal, mirrorVertical } from './transform.js';
import { loadProject, createAutosave, clearSavedProject } from './persistence.js';
import { exportC } from './codec/c-export.js';
import { exportPatternsBin, exportColorsBin } from './codec/bin-export.js';
import { spriteToCanvas, compositeToCanvas, canvasToPngBlob, decodePngColors } from './codec/png.js';
import { parseTinySprite, serializeTinySprite } from './codec/tinysprite.js';
import { exportBasic } from './codec/basic-export.js';
import { decomposeByColor } from './decompose-by-color.js';
import { downloadBlob } from './download.js';
import { setPaletteType, PALETTES, MSX2_PALETTE } from './palette.js';
import { groupGrids } from './composite.js';
import { ICONS, LOGO } from './icons.js';

const project = createProject();
const restored = loadProject();
if (restored) {
  project.grids = restored.grids;
  project.paletteType = restored.paletteType;
}
setPaletteType(project.paletteType);
const autosaveInner = createAutosave(project, { onSave: () => setSaveStatus('Saved') });
// Wraps the debounced autosave so the status bar can show "Saving…"
// between an edit and the (debounced) localStorage write.
const autosave = {
  trigger() { setSaveStatus('Saving…'); autosaveInner.trigger(); },
  flush() { autosaveInner.flush(); },
};
const state = { currentColor: 1, tool: 'paint' };

// Selection is transient UI state (not part of Project/undo — see
// FUNCTIONAL_SPEC.md §5.3): scoped to a single grid at a time.
let selectionState = { gridIndex: -1, selection: null };
let clipboard = null; // see clipboard.js for shape
let activeGridIndex = -1; // last grid interacted with — the paste target
let pasteState = null; // { gridIndex, clip, x, y } while a rect-paste is floating
let gridViews = [];

// Cell the pointer is currently over, shared across every grid view so
// hovering a pixel in one sprite highlights the same (row, col) in all
// the others — useful for comparing/lining up OR-composited pixels.
let hoverCell = null; // { row, col } | null
// The OR-composited color (see preview-view.js) at the hovered pixel's
// world position — can differ from `hoverCell.color` (that sprite's own
// pixel) when other OR-grouped sprites also cover that position.
let compositeHoverColor = null;

// ---- Status bar ----

function statusItem(className) {
  const el = document.createElement('span');
  el.className = 'status-item' + (className ? ' ' + className : '');
  return el;
}
const statusHost = document.getElementById('status-host');
const statusPos = statusItem();
const statusColor = statusItem();
const statusComposite = statusItem();
const statusSpacer = statusItem('status-spacer');
const statusTool = statusItem();
const statusCount = statusItem();
const statusSave = statusItem('status-save');
statusSave.dataset.help = 'autosave';
statusHost.append(statusPos, statusColor, statusComposite, statusSpacer, statusTool, statusCount, statusSave);

function setSaveStatus(text) {
  statusSave.textContent = text;
  statusSave.classList.toggle('pending', text !== 'Saved');
}
setSaveStatus('Saved');

function colorStatus(el, label, c) {
  el.textContent = `${label} `;
  if (c === null) {
    el.append('–');
    return;
  }
  const dot = document.createElement('span');
  dot.className = 'status-dot' + (c === 0 ? ' transparent-swatch' : '');
  if (c !== 0) dot.style.background = MSX2_PALETTE[c];
  el.append(dot, c === 0 ? 'none' : String(c));
}

function updateCoordDisplay() {
  statusPos.textContent = hoverCell
    ? `Sprite ${hoverCell.gridIndex} · Row ${hoverCell.row} · Col ${hoverCell.col}`
    : 'Row – · Col –';
  colorStatus(statusColor, 'Color', hoverCell ? hoverCell.color : null);
  colorStatus(statusComposite, 'Composite', hoverCell ? compositeHoverColor : null);
}

const TOOL_NAMES = { paint: 'Pencil', fill: 'Fill', select: 'Select' };
function updateStatusMeta() {
  statusTool.textContent = TOOL_NAMES[state.tool];
  statusCount.textContent = `${project.grids.length} of ${MAX_GRIDS} sprites`;
}

function setHoverCell(cell) {
  hoverCell = cell;
  gridViews.forEach((v) => v.draw());
  preview.draw(); // synchronously reports the composite color via onCompositeHover, which refreshes the display
}

// Palette colors (1-15) that appear on at least one opaque pixel of any
// sprite — used to highlight OR-compositions worth reusing (see
// palette-view.js).
function computeUsedColors() {
  const used = new Set();
  for (const sprite of project.grids) {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (getPixel(sprite, row, col)) {
          used.add(sprite.rowColors[row]);
          break;
        }
      }
    }
  }
  return used;
}

// Redraws the preview and the palette (whose OR-composition list
// highlights colors already used) — call after any mutation that could
// change which pixels/colors are on the grids.
function redraw() {
  preview.draw();
  paletteView.render();
}

const paletteHost = document.getElementById('palette-host');
const gridsHost = document.getElementById('grids-host');
const previewHost = document.getElementById('preview-host');
const historyHost = document.getElementById('history-host');
const toolRail = document.getElementById('tool-rail');
const menuHost = document.getElementById('menu-host');
const zoomHost = document.getElementById('zoom-host');
const importMessageHost = document.getElementById('import-message-host');
document.getElementById('brand-logo').innerHTML = LOGO;

const paletteView = createPaletteView(state, () => {}, { getUsedColors: computeUsedColors });
paletteHost.appendChild(paletteView.element);

// ---- Palette type toggle (regular / screen8) ----
//
// Switching re-maps every existing color index 1-15 to the new
// palette's hue — the sprite data itself (indices) is untouched, only
// what those indices render/export as.
const paletteTypeHost = document.getElementById('palette-type-host');
const paletteTypeBtns = {};
Object.keys(PALETTES).forEach((type) => {
  const label = type === 'screen8' ? 'Screen 8' : 'Regular';
  const btn = button(label, () => setActivePaletteType(type));
  btn.className = 'seg-btn';
  btn.title = `Use the ${label} palette`;
  paletteTypeBtns[type] = btn;
  paletteTypeHost.appendChild(btn);
});

function updatePaletteTypeButtons() {
  Object.entries(paletteTypeBtns).forEach(([type, btn]) => {
    btn.classList.toggle('active', type === project.paletteType);
    btn.setAttribute('aria-pressed', String(type === project.paletteType));
  });
}

function setActivePaletteType(type) {
  if (type === project.paletteType) return;
  project.paletteType = type;
  setPaletteType(type);
  updatePaletteTypeButtons();
  renderGrids();
  redraw();
  autosave.trigger();
}
updatePaletteTypeButtons();

const history = createHistory(project, () => {
  // Selection/paste/active-grid are transient UI state scoped to
  // specific grid indices; an undo/redo can change the grid count, so
  // drop them rather than risk pointing at a stale/out-of-range index.
  selectionState = { gridIndex: -1, selection: null };
  pasteState = null;
  activeGridIndex = -1;
  renderGrids();
  redraw();
  updateHistoryButtons();
  updateEditButtons();
});

const preview = createPreviewView(project, () => updateHistoryButtons(), {
  history,
  getHover: () => hoverCell,
  onCompositeHover: (color) => { compositeHoverColor = color; updateCoordDisplay(); },
});
previewHost.appendChild(preview.element);

const zoomBtns = PREVIEW_SCALES.map((scale) => {
  const btn = button(`${scale / PREVIEW_SCALES[0]}×`, () => {
    preview.setScale(scale);
    zoomBtns.forEach((b) => b.classList.toggle('active', b === btn));
  });
  btn.className = 'seg-btn' + (scale === preview.getScale() ? ' active' : '');
  btn.title = `Preview at ${scale}px per pixel`;
  zoomHost.appendChild(btn);
  return btn;
});

// ---- Undo/Redo ----

const undoBtn = iconButton('undo', 'Undo (Ctrl+Z)', () => history.undo());
const redoBtn = iconButton('redo', 'Redo (Ctrl+Y)', () => history.redo());
undoBtn.className = redoBtn.className = 'icon-btn history-btn';
historyHost.appendChild(undoBtn);
historyHost.appendChild(redoBtn);

// A minimal in-page confirm modal — `window.confirm` is unreliable
// inside sandboxed/embedded webviews (some block or auto-reject native
// dialogs, which made New Project silently no-op), so the destructive
// confirmation is rendered as regular DOM instead.
function showConfirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.dataset.help = 'file-menu';
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  const msg = document.createElement('p');
  msg.className = 'modal-message';
  msg.textContent = message;
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancelBtn = button('Cancel', () => overlay.remove());
  const confirmBtn = button('New Project', () => {
    overlay.remove();
    onConfirm();
  });
  confirmBtn.className = 'modal-confirm';
  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  dialog.appendChild(msg);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
  confirmBtn.focus();
}

// Wipes the in-memory project back to a single empty grid and erases
// the autosaved copy from localStorage — a hard reset, not an undoable
// edit, so it also clears the undo/redo stack rather than leaving it
// pointing at grids that no longer exist. Also drops every other piece
// of session state (clipboard, tool/color selection) so nothing from
// the old project can leak into the new one.
function doNewProject() {
  if (pasteState) return;
  showConfirm('Start a new project? This erases all sprites and cannot be undone.', () => {
    const fresh = createProject();
    project.grids = fresh.grids;
    project.paletteType = fresh.paletteType;
    setPaletteType(project.paletteType);
    updatePaletteTypeButtons();
    history.reset();
    clearSavedProject();
    selectionState = { gridIndex: -1, selection: null };
    pasteState = null;
    activeGridIndex = -1;
    clipboard = null;
    state.currentColor = 1;
    setTool('paint');
    renderGrids();
    redraw();
    updateHistoryButtons();
    updateEditButtons();
    autosave.flush();
  });
}

function updateHistoryButtons() {
  undoBtn.disabled = !history.canUndo();
  redoBtn.disabled = !history.canRedo();
  autosave.trigger();
}

window.addEventListener('beforeunload', () => autosave.flush());

// ---- Tool rail: Pencil/Fill/Select modes, clipboard, transforms ----

const pencilBtn = iconButton('pencil', 'Pencil (P)', () => setTool('paint'), 'P');
const fillBtn = iconButton('fill', 'Fill (F)', () => setTool('fill'), 'F');
const selectBtn = iconButton('select', 'Select (S)', () => setTool('select'), 'S');

function setTool(tool) {
  state.tool = tool;
  [[pencilBtn, 'paint'], [fillBtn, 'fill'], [selectBtn, 'select']].forEach(([btn, t]) => {
    btn.classList.toggle('active', tool === t);
    btn.setAttribute('aria-pressed', String(tool === t));
  });
  updateStatusMeta();
}

function doSelectAll() {
  const target = activeGridIndex === -1 ? 0 : activeGridIndex;
  if (!project.grids[target]) return;
  activeGridIndex = target;
  selectionState = { gridIndex: target, selection: { kind: 'whole' } };
  updateActiveGrid();
  refreshSelectionUI();
}

function doCut() {
  const { gridIndex, selection } = selectionState;
  if (!selection || pasteState) return;
  const sprite = project.grids[gridIndex];
  history.perform(() => {
    clipboard = cutSelection(sprite, selection);
  });
  renderGrids();
  redraw();
  updateHistoryButtons();
  updateEditButtons();
}

function doCopy() {
  const { gridIndex, selection } = selectionState;
  if (!selection || pasteState) return;
  clipboard = copySelection(project.grids[gridIndex], selection);
  updateEditButtons();
}

function doPaste() {
  if (!clipboard || activeGridIndex === -1 || pasteState) return;
  if (clipboard.kind === 'whole') {
    const sprite = project.grids[activeGridIndex];
    history.perform(() => pasteWhole(sprite, clipboard));
    renderGrids();
    redraw();
    updateHistoryButtons();
  } else {
    pasteState = { gridIndex: activeGridIndex, clip: clipboard, x: 0, y: 0 };
    renderGrids();
    updateEditButtons();
  }
}

function doClear() {
  const { gridIndex, selection } = selectionState;
  if (!selection || pasteState) return;
  const sprite = project.grids[gridIndex];
  history.perform(() => clearSelectionPixels(sprite, selection));
  renderGrids();
  redraw();
  updateHistoryButtons();
}

// Rotate/mirror apply to the whole grid (FUNCTIONAL_SPEC.md §5.5), so
// they target the "active" grid (last one interacted with), same as
// paste. They're disabled when that grid currently holds a partial
// rectangle selection (ambiguous to rotate/mirror a sub-rectangle).
function rotateMirrorTarget() {
  const target = activeGridIndex === -1 ? 0 : activeGridIndex;
  return project.grids[target] ? target : -1;
}

function rotateMirrorDisabled() {
  const target = rotateMirrorTarget();
  if (target === -1 || pasteState) return true;
  return selectionState.gridIndex === target && selectionState.selection && selectionState.selection.kind === 'rect';
}

function applyWholeGridTransform(fn) {
  if (rotateMirrorDisabled()) return;
  const sprite = project.grids[rotateMirrorTarget()];
  history.perform(() => fn(sprite));
  renderGrids();
  redraw();
  updateHistoryButtons();
}

function doRotate() {
  applyWholeGridTransform(rotateCW);
}
function doMirrorH() {
  applyWholeGridTransform(mirrorHorizontal);
}
function doMirrorV() {
  applyWholeGridTransform(mirrorVertical);
}

const cutBtn = iconButton('cut', 'Cut (Ctrl+X)', doCut);
const copyBtn = iconButton('copy', 'Copy (Ctrl+C)', doCopy);
const pasteBtn = iconButton('paste', 'Paste (Ctrl+V)', doPaste);
const rotateBtn = iconButton('rotate', 'Rotate 90°', doRotate);
const mirrorHBtn = iconButton('flipH', 'Flip horizontal', doMirrorH);
const mirrorVBtn = iconButton('flipV', 'Flip vertical', doMirrorV);
const clearBtn = iconButton('clear', 'Clear selection', doClear);

[
  [pencilBtn, fillBtn, selectBtn],
  [cutBtn, copyBtn, pasteBtn],
  [rotateBtn, mirrorHBtn, mirrorVBtn, clearBtn],
].forEach((group, i) => {
  if (i > 0) {
    const divider = document.createElement('div');
    divider.className = 'rail-divider';
    toolRail.appendChild(divider);
  }
  group.forEach((b) => {
    b.classList.add('rail-btn');
    toolRail.appendChild(b);
  });
});

[
  [pencilBtn, 'tool-pencil'], [fillBtn, 'tool-fill'], [selectBtn, 'tool-select'],
  [cutBtn, 'clipboard'], [copyBtn, 'clipboard'], [pasteBtn, 'clipboard'],
  [rotateBtn, 'transforms'], [mirrorHBtn, 'transforms'], [mirrorVBtn, 'transforms'], [clearBtn, 'clear'],
].forEach(([b, help]) => { b.dataset.help = help; });

setTool('paint');

// ---- Static exports: PNG, C, BIN (FUNCTIONAL_SPEC.md §7) ----
//
// Delivery mechanism: plain sequential <a download> triggers, one per
// file, each staggered slightly (setTimeout) rather than fired all in
// the same tick — most browsers otherwise coalesce/block a burst of
// synchronous downloads from one click. No zip bundling: keeps this
// dependency-free and the exported files individually inspectable.
const DOWNLOAD_STAGGER_MS = 150;

async function doExportPng() {
  for (let i = 0; i < project.grids.length; i++) {
    const blob = await canvasToPngBlob(spriteToCanvas(project.grids[i]));
    downloadBlob(blob, `sprite-${i}.png`);
    await new Promise((r) => setTimeout(r, DOWNLOAD_STAGGER_MS));
  }
  const compositeBlob = await canvasToPngBlob(compositeToCanvas(project.grids));
  downloadBlob(compositeBlob, 'composite.png');
}

function doExportC() {
  const text = exportC(project);
  downloadBlob(new Blob([text], { type: 'text/x-c' }), 'sprites.c');
}

function doExportBin() {
  downloadBlob(new Blob([exportPatternsBin(project)], { type: 'application/octet-stream' }), 'patterns.bin');
  setTimeout(() => {
    downloadBlob(new Blob([exportColorsBin(project)], { type: 'application/octet-stream' }), 'colors.bin');
  }, DOWNLOAD_STAGGER_MS);
}

function doExportTiny() {
  const text = serializeTinySprite(project);
  downloadBlob(new Blob([text], { type: 'text/plain' }), 'sprites.tiny');
}

function doExportBasic() {
  const text = exportBasic(project);
  downloadBlob(new Blob([text], { type: 'text/plain' }), 'sprites.bas');
}


// ---- Import: PNG, TinySprite (FUNCTIONAL_SPEC.md §6) ----
//
// Simplified decomposition (see decompose-by-color.js): one grid per
// distinct color in the target image. PNG import rejects the whole
// import up front if it needs more grids than the remaining budget
// (spec's "no feasible import" case); TinySprite import instead skips
// whichever whole slots don't fit and warns that the import was
// truncated (§12.2) — a single import always uses one undo step.

function showImportMessage(kind, text) {
  importMessageHost.innerHTML = '';
  const box = document.createElement('div');
  box.className = `import-message ${kind}`;
  const msg = document.createElement('span');
  msg.textContent = text;
  const close = button('×', () => box.remove());
  close.className = 'import-message-close';
  close.setAttribute('aria-label', 'Dismiss message');
  box.appendChild(msg);
  box.appendChild(close);
  importMessageHost.appendChild(box);
}

async function doImportPng(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const colors = decodePngColors(imageData);
    const newGrids = decomposeByColor(colors);
    const remaining = MAX_GRIDS - project.grids.length;
    if (newGrids.length > remaining) {
      throw new Error(`This image needs ${newGrids.length} grid(s) (one per color) but only ${remaining} slot(s) remain.`);
    }
    history.perform(() => newGrids.forEach((g) => project.grids.push(g)));
    renderGrids();
    redraw();
    updateHistoryButtons();
  } catch (err) {
    showImportMessage('error', `PNG import failed: ${err.message}`);
  }
}

async function doImportTiny(file) {
  try {
    const text = await file.text();
    const slots = parseTinySprite(text);
    let truncated = false;
    history.perform(() => {
      for (const slot of slots) {
        const newGrids = decomposeByColor(slot.colors);
        if (newGrids.length === 0) continue;
        const remaining = MAX_GRIDS - project.grids.length;
        if (newGrids.length > remaining) {
          truncated = true;
          continue;
        }
        newGrids.forEach((g) => project.grids.push(g));
      }
    });
    renderGrids();
    redraw();
    updateHistoryButtons();
    if (truncated) {
      showImportMessage('warning', "Import truncated: one or more slots were skipped because they didn't fit within the 8-grid limit.");
    }
  } catch (err) {
    showImportMessage('error', `TinySprite import failed: ${err.message}`);
  }
}

// Opens the browser's file picker and hands the chosen file to `onFile`.
function pickFile(accept, onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) onFile(file);
  });
  input.click();
}

// ---- Top-bar menus: File / Import / Export ----

let openMenu = null; // { button, list } of the currently open dropdown

function closeMenu() {
  if (!openMenu) return;
  openMenu.list.hidden = true;
  openMenu.button.setAttribute('aria-expanded', 'false');
  openMenu.button.classList.remove('open');
  openMenu = null;
}

function createMenu(label, help, items) {
  const wrap = document.createElement('div');
  wrap.className = 'menu';
  wrap.dataset.help = help;
  const btn = button(label, () => {
    const wasOpen = openMenu && openMenu.button === btn;
    closeMenu();
    if (wasOpen) return;
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('open');
    openMenu = { button: btn, list };
  });
  btn.className = 'menu-btn';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.insertAdjacentHTML('beforeend', ICONS.chevron);
  const list = document.createElement('div');
  list.className = 'menu-list';
  list.hidden = true;
  items.forEach(([text, onPick]) => {
    const item = button(text, () => {
      closeMenu();
      onPick();
    });
    item.className = 'menu-item';
    list.appendChild(item);
  });
  wrap.append(btn, list);
  menuHost.appendChild(wrap);
}

createMenu('File', 'file-menu', [
  ['New project', doNewProject],
  ['License (GNU GPL v3)', () => openHelp('license')],
]);
createMenu('Import', 'import', [
  ['PNG image…', () => pickFile('image/png', doImportPng)],
  ['TinySprite file…', () => pickFile('.tiny,text/plain', doImportTiny)],
]);
createMenu('Export', 'export', [
  ['PNG images', doExportPng],
  ['C source', doExportC],
  ['Binary (.bin)', doExportBin],
  ['TinySprite', doExportTiny],
  ['BASIC listing', doExportBasic],
]);

document.addEventListener('pointerdown', (e) => {
  if (openMenu && !openMenu.button.parentElement.contains(e.target)) closeMenu();
});

function button(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

// Icon-only button; `label` is its accessible name and tooltip, and
// `shortcut`, if given, is shown as a small key hint in the corner.
function iconButton(icon, label, onClick, shortcut) {
  const b = button('', onClick);
  b.innerHTML = ICONS[icon];
  b.title = label;
  b.setAttribute('aria-label', label);
  if (shortcut) {
    const key = document.createElement('span');
    key.className = 'key-hint';
    key.textContent = shortcut;
    b.appendChild(key);
  }
  return b;
}

function refreshSelectionUI() {
  gridViews.forEach((v) => v.draw());
  updateEditButtons();
}

function updateEditButtons() {
  const hasSelection = !!selectionState.selection;
  const pasting = !!pasteState;
  cutBtn.disabled = !hasSelection || pasting;
  copyBtn.disabled = !hasSelection || pasting;
  clearBtn.disabled = !hasSelection || pasting;
  pasteBtn.disabled = !clipboard || activeGridIndex === -1 || pasting;
  pencilBtn.disabled = pasting;
  selectBtn.disabled = pasting;
  fillBtn.disabled = pasting;
  const rmDisabled = rotateMirrorDisabled();
  rotateBtn.disabled = rmDisabled;
  mirrorHBtn.disabled = rmDisabled;
  mirrorVBtn.disabled = rmDisabled;
}

// ---- Keyboard shortcuts ----

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      history.undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      history.redo();
    } else if (key === 'a') {
      e.preventDefault();
      doSelectAll();
    } else if (key === 'c') {
      e.preventDefault();
      doCopy();
    } else if (key === 'x') {
      e.preventDefault();
      doCut();
    } else if (key === 'v') {
      e.preventDefault();
      doPaste();
    }
    return;
  }
  if (e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !pasteState) {
    const toolKey = { p: 'paint', f: 'fill', s: 'select' }[e.key.toLowerCase()];
    if (toolKey) {
      setTool(toolKey);
      return;
    }
  }
  if (e.key === 'Escape') {
    if (openMenu) {
      closeMenu();
    } else if (pasteState) {
      gridViews.forEach((v) => v.cancelPaste && v.cancelPaste());
    } else if (selectionState.selection) {
      selectionState = { gridIndex: -1, selection: null };
      refreshSelectionUI();
    }
  } else if (e.key === 'Enter') {
    if (pasteState) {
      e.preventDefault();
      gridViews.forEach((v) => v.commitPaste && v.commitPaste());
    }
  }
});

// The sprite that paste/rotate/flip/Ctrl+A act on: the last one
// interacted with, or sprite 0 before any interaction.
function effectiveActiveIndex() {
  return activeGridIndex === -1 ? 0 : activeGridIndex;
}

function updateActiveGrid() {
  const active = effectiveActiveIndex();
  gridViews.forEach((v, i) => v.setActive(i === active));
}

function renderGrids() {
  gridsHost.innerHTML = '';
  gridViews = [];

  // Which non-OR sprite each OR sprite mixes into (composite.js rule).
  const anchorOf = {};
  groupGrids(project.grids).forEach((g) => g.members.forEach((m) => { anchorOf[m] = g.anchorIndex; }));

  project.grids.forEach((sprite, index) => {
    const anchor = anchorOf[index];
    const view = createGridView(sprite, state, () => { redraw(); updateHistoryButtons(); }, {
      label: `Sprite ${index}`,
      active: index === effectiveActiveIndex(),
      orNote: anchor === index ? 'OR on, but no sprite before it to mix with' : `Mixes with Sprite ${anchor}`,
      canRemove: project.grids.length > 1,
      history,
      onRemove: () => {
        history.perform(() => removeGrid(project, index));
        // Any index >= the removed one may now be stale (shifted or
        // gone) — drop tracked state rather than risk an out-of-range
        // reference.
        if (activeGridIndex >= index) activeGridIndex = -1;
        if (selectionState.gridIndex >= index) selectionState = { gridIndex: -1, selection: null };
        if (pasteState && pasteState.gridIndex >= index) pasteState = null;
        renderGrids();
        redraw();
        updateHistoryButtons();
        updateEditButtons();
      },
      onToggleOr: () => { renderGrids(); redraw(); },
      getHover: () => hoverCell,
      onHover: (cell) => setHoverCell(cell ? { ...cell, gridIndex: index } : null),
      onActivate: () => {
        activeGridIndex = index;
        updateActiveGrid();
        updateEditButtons();
      },
      selection: {
        get: () => (selectionState.gridIndex === index ? selectionState.selection : null),
        set: (sel) => {
          selectionState = { gridIndex: index, selection: sel };
          refreshSelectionUI();
        },
      },
      paste: pasteState && pasteState.gridIndex === index ? pasteState : undefined,
      onPasteCommit: (row, col) => {
        const clip = pasteState.clip;
        const sprite2 = project.grids[index];
        pasteState = null;
        history.perform(() => pasteRectAt(sprite2, clip, row, col));
        renderGrids();
        redraw();
        updateHistoryButtons();
        updateEditButtons();
      },
      onPasteCancel: () => {
        pasteState = null;
        renderGrids();
        updateEditButtons();
      },
    });
    gridViews.push(view);
    gridsHost.appendChild(view.element);
  });

  updateStatusMeta();
  if (project.grids.length < MAX_GRIDS) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-grid-btn';
    addBtn.innerHTML = ICONS.plus;
    const addLabel = document.createElement('span');
    addLabel.className = 'add-grid-label';
    addLabel.textContent = 'Add sprite';
    const addCount = document.createElement('span');
    addCount.className = 'add-grid-count';
    addCount.textContent = `${project.grids.length} of ${MAX_GRIDS} sprites`;
    addBtn.append(addLabel, addCount);
    addBtn.title = 'Add another sprite';
    addBtn.dataset.help = 'sprites';
    addBtn.addEventListener('click', () => {
      history.perform(() => addGrid(project));
      renderGrids();
      redraw();
      updateHistoryButtons();
    });
    gridsHost.appendChild(addBtn);
  }
}

renderGrids();
updateHistoryButtons();
updateEditButtons();
updateCoordDisplay();

// ---- Context help: hold Ctrl and click anything ----
//
// While Ctrl is held the cursor becomes the "help" arrow; a Ctrl+click
// opens help.html at the section named by the nearest `data-help`
// ancestor of the clicked element. The listeners run in the capture
// phase on window, ahead of every other handler, and swallow the
// gesture so the click never paints, selects or presses anything.

const HELP_URL = 'help.html';

function openHelp(section) {
  // A named target reuses one help tab instead of opening a new one each time.
  const win = window.open(`${HELP_URL}#${section}`, 'morden2-help');
  if (win) win.focus();
}

function setHelpCursor(on) {
  document.documentElement.classList.toggle('help-mode', on);
}

window.addEventListener('keydown', (e) => { if (e.key === 'Control') setHelpCursor(true); });
window.addEventListener('keyup', (e) => { if (e.key === 'Control') setHelpCursor(false); });
window.addEventListener('blur', () => setHelpCursor(false));
// Catches Ctrl being pressed/released while the window wasn't focused.
window.addEventListener('pointermove', (e) => setHelpCursor(e.ctrlKey));

// The most specific help target under the pointer. Starts from the
// clicked element's nearest `data-help` ancestor, then narrows to the
// smallest `data-help` descendant containing the point — disabled
// buttons ignore the pointer in help mode (see style.css), so a click
// on one lands on its container and is resolved back to it here.
function helpSectionAt(e) {
  const start = e.target instanceof Element ? e.target.closest('[data-help]') : null;
  if (!start) return 'overview';
  let best = start;
  let bestArea = Infinity;
  start.querySelectorAll('[data-help]').forEach((el) => {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > 0 && area < bestArea && e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom) {
      best = el;
      bestArea = area;
    }
  });
  return best.dataset.help;
}

function interceptHelpClick(e) {
  if (!e.ctrlKey || e.button !== 0) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.type === 'pointerdown') openHelp(helpSectionAt(e));
}
['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
  window.addEventListener(type, interceptHelpClick, true);
});

const helpBtn = iconButton('help', 'Help (Ctrl+click anything for help on it)', () => openHelp('overview'));
helpBtn.className = 'icon-btn';
helpBtn.dataset.help = 'context-help';
document.getElementById('help-host').appendChild(helpBtn);
