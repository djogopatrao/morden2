import { createProject, addGrid, removeGrid, getPixel, GRID_SIZE, MAX_GRIDS } from './model.js';
import { createGridView } from './grid-view.js';
import { createPaletteView } from './palette-view.js';
import { createPreviewView } from './preview-view.js';
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
import { setPaletteType, PALETTES } from './palette.js';

const project = createProject();
const restored = loadProject();
if (restored) {
  project.grids = restored.grids;
  project.paletteType = restored.paletteType;
}
setPaletteType(project.paletteType);
const autosave = createAutosave(project);
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

function colorLabel(c) {
  if (c === null) return '–';
  return c === 0 ? 'transparent' : String(c);
}

function updateCoordDisplay() {
  if (!hoverCell) {
    coordHost.textContent = 'Row –, Col –, Color –, Composite –';
    return;
  }
  coordHost.textContent =
    `Row ${hoverCell.row}, Col ${hoverCell.col}, ` +
    `Color ${colorLabel(hoverCell.color)}, Composite ${colorLabel(compositeHoverColor)}`;
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
const coordHost = document.getElementById('coord-host');
const editHost = document.getElementById('edit-toolbar-host');
const importHost = document.getElementById('import-toolbar-host');
const exportHost = document.getElementById('export-toolbar-host');
const importMessageHost = document.getElementById('import-message-host');

const paletteView = createPaletteView(state, () => {}, { getUsedColors: computeUsedColors });
paletteHost.appendChild(paletteView.element);

// ---- Palette type toggle (regular / screen8) ----
//
// Switching re-maps every existing color index 1-15 to the new
// palette's hue — the sprite data itself (indices) is untouched, only
// what those indices render/export as.
const paletteTypeHost = document.createElement('div');
paletteTypeHost.className = 'palette-type-toggle';
const paletteTypeBtns = {};
Object.keys(PALETTES).forEach((type) => {
  const label = type === 'screen8' ? 'Screen8' : 'Regular';
  const btn = button(label, () => setActivePaletteType(type));
  btn.className = 'palette-type-btn';
  btn.title = `Use the ${label} palette`;
  paletteTypeBtns[type] = btn;
  paletteTypeHost.appendChild(btn);
});
paletteHost.appendChild(paletteTypeHost);

function updatePaletteTypeButtons() {
  Object.entries(paletteTypeBtns).forEach(([type, btn]) => {
    btn.classList.toggle('active', type === project.paletteType);
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

// ---- Undo/Redo toolbar ----

const undoBtn = button('Undo', () => history.undo());
const redoBtn = button('Redo', () => history.redo());
const newProjectBtn = button('New Project', doNewProject);
undoBtn.className = redoBtn.className = 'history-btn';
newProjectBtn.className = 'history-btn new-project-btn';
historyHost.appendChild(undoBtn);
historyHost.appendChild(redoBtn);
historyHost.appendChild(newProjectBtn);

// A minimal in-page confirm modal — `window.confirm` is unreliable
// inside sandboxed/embedded webviews (some block or auto-reject native
// dialogs, which made New Project silently no-op), so the destructive
// confirmation is rendered as regular DOM instead.
function showConfirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
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

// ---- Pencil/Select tool group, Cut/Copy/Paste/Clear toolbar ----

const pencilBtn = button('Pencil', () => setTool('paint'));
const selectBtn = button('Select', () => setTool('select'));

setTool('paint');

function setTool(tool) {
  state.tool = tool;
  
  if (tool === 'fill') {
    // Activate fill mode - remove active class from all buttons first
    const editHost = document.getElementById('edit-toolbar-host');
    if (editHost) {
      const btns = editHost.querySelectorAll('.edit-btn');
      btns.forEach(btn => btn.classList.remove('active'));
    }
  }
}

const activeGridCanvas = canvas; // Reference to last clicked grid's canvas for fill tool

// ---- Pencil/Select/Fill toolbar ----
function setTool(tool) {
  if (state.tool === 'fill') {
    document.getElementById('edit-toolbar-host').querySelectorAll('.edit-btn').forEach(btn => btn.classList.remove('active'));
  }
}

// ---- Grid click handling for fill tool ----

function getCellAt(e) {
  const canvas = activeGridCanvas || project.grids[0]?.element?.canvas;
  
  if (!canvas || !project.grids[activeGridIndex]) return null;
  
  const rect = canvas.getBoundingClientRect();
  const col = Math.floor(((e.clientX - rect.left) / rect.width) * GRID_SIZE);
  const row = Math.floor(((e.clientY - rect.top) / rect.height) * GRID_SIZE);
  
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
  
  // Don't allow fill tool during paste drag
  if (pasteState?.gridIndex === activeGridIndex) return null;
  
  return { row, col };
}

function handleGridClick(e) {
  const cell = getCellAt(e);
  if (!cell) return;

  // Handle fill tool click
  if (state.tool === 'fill') {
    const sprite = project.grids[activeGridIndex];
    history.perform(() => {
      bucketFill(sprite, cell.row, cell.col, state.currentColor);
    });
    render();
    return;
  }

  // Original paint/select behavior
  if (pasteState?.gridIndex === activeGridIndex) {
    pasteState = null;
    return;
  }

  history && history.commit();
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

const cutBtn = button('Cut', doCut);
const copyBtn = button('Copy', doCopy);
const pasteBtn = button('Paste', doPaste);
const rotateBtn = button('Rotate', doRotate);
const mirrorHBtn = button('Flip H', doMirrorH);
const mirrorVBtn = button('Flip V', doMirrorV);
const clearBtn = button('Clear', doClear);
const fillBtn = createToggleButton('Fill');

setTool('paint');

[pencilBtn, selectBtn, fillBtn, cutBtn, copyBtn, pasteBtn, rotateBtn, mirrorHBtn, mirrorVBtn, clearBtn].forEach((b) => {
  b.className = 'edit-btn';
  editHost.appendChild(b);
});

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

const exportPngBtn = button('Export PNG', doExportPng);
const exportCBtn = button('Export C', doExportC);
const exportBinBtn = button('Export BIN', doExportBin);
const exportTinyBtn = button('Export TinySprite', doExportTiny);
const exportBasicBtn = button('Export BASIC', doExportBasic);
[exportPngBtn, exportCBtn, exportBinBtn, exportTinyBtn, exportBasicBtn].forEach((b) => {
  b.className = 'edit-btn';
  exportHost.appendChild(b);
});

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

function fileImportButton(text, accept, onFile) {
  const wrapper = document.createElement('label');
  wrapper.className = 'edit-btn';
  wrapper.textContent = text;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = '';
    if (file) onFile(file);
  });
  wrapper.appendChild(input);
  return wrapper;
}

importHost.appendChild(fileImportButton('Import PNG', 'image/png', doImportPng));
importHost.appendChild(fileImportButton('Import TinySprite', '.tiny,text/plain', doImportTiny));

function button(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
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
  if (e.key === 'Escape') {
    if (pasteState) {
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

function renderGrids() {
  gridsHost.innerHTML = '';
  gridViews = [];

  project.grids.forEach((sprite, index) => {
    const view = createGridView(sprite, state, () => { redraw(); updateHistoryButtons(); }, {
      label: `Sprite ${index}`,
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
      onToggleOr: () => redraw(),
      getHover: () => hoverCell,
      onHover: (cell) => setHoverCell(cell ? { ...cell, gridIndex: index } : null),
      onActivate: () => {
        activeGridIndex = index;
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

  if (project.grids.length < MAX_GRIDS) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-grid-btn';
    addBtn.textContent = '+';
    addBtn.title = 'Add another sprite';
    addBtn.setAttribute('aria-label', 'Add another sprite');
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
