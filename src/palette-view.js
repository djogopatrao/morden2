import { MSX2_PALETTE, paletteType } from './palette.js';
import { ICONS } from './icons.js';

// How many OR mixes fit in the side panel's fixed-size box; the rest
// are reachable through the "More" dialog so the panel never grows and
// pushes the preview out of view.
const MIXES_SHOWN = 6;

const REGULAR_NAMES = [
  'Transparent', 'Black', 'Medium green', 'Light green', 'Dark blue',
  'Light blue', 'Dark red', 'Cyan', 'Medium red', 'Light red',
  'Dark yellow', 'Light yellow', 'Dark green', 'Magenta', 'Gray', 'White',
];

export function colorName(i) {
  if (i === 0) return 'Transparent';
  return paletteType === 'regular' ? REGULAR_NAMES[i] : `Color ${i}`;
}

// Black or white, whichever reads better on top of `hex`.
export function textOn(hex) {
  if (!hex) return '#141519';
  const n = parseInt(hex.slice(1), 16);
  const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#141519' : '#ffffff';
}

// Every unordered pair of *other* palette colors (1-15, excluding
// `target` itself) whose bitwise OR equals `target` — i.e. the ways
// two overlapping OR-mode sprites could combine to display this color
// (FUNCTIONAL_SPEC.md §2.3). Colors are raw 4-bit values, same as
// composite.js's `colorA | colorB` rule.
function findCompositions(target) {
  const pairs = [];
  for (let a = 1; a <= 15; a++) {
    if (a === target) continue;
    for (let b = a; b <= 15; b++) {
      if (b === target) continue;
      if ((a | b) === target) pairs.push([a, b]);
    }
  }
  return pairs;
}

function chip(color, used) {
  const sw = document.createElement('span');
  sw.className = 'mix-chip' + (used ? ' used' : '');
  sw.style.background = MSX2_PALETTE[color];
  sw.style.color = textOn(MSX2_PALETTE[color]);
  sw.title = used ? `Color ${color} (already used in a sprite)` : `Color ${color}`;
  sw.textContent = String(color);
  return sw;
}

function mixPair(a, b, target, usedColors) {
  const aUsed = usedColors.has(a);
  const bUsed = usedColors.has(b);
  const pair = document.createElement('div');
  pair.className = 'mix-pair' + (aUsed || bUsed ? ' has-used-color' : '');
  pair.title = `Color ${a} OR Color ${b} = Color ${target}`;
  pair.appendChild(chip(a, aUsed));
  const op = document.createElement('span');
  op.className = 'mix-op';
  op.textContent = 'OR';
  pair.appendChild(op);
  pair.appendChild(chip(b, bUsed));
  return pair;
}

// Renders the side panel's color section: the current color, the
// 16-swatch palette (transparency + 15 colors), and a fixed-size box
// listing the pairs of other colors that bitwise-OR together to produce
// the current color, with a "More" dialog when they don't all fit.
// `state` is the shared { currentColor } object; clicking a swatch
// updates it and re-renders the panel.
// `opts.getUsedColors()`, if given, returns a `Set<number>` of palette
// colors (1-15) that currently appear on at least one sprite — pairs
// that include one of them are highlighted, since reusing an existing
// color is often preferable to introducing a new one.
export function createPaletteView(state, onChange, opts = {}) {
  const el = document.createElement('div');
  el.className = 'palette-panel';
  el.dataset.help = 'palette';

  const currentEl = document.createElement('div');
  currentEl.className = 'current-color';
  const currentSwatch = document.createElement('div');
  currentSwatch.className = 'current-swatch';
  const currentText = document.createElement('div');
  currentText.className = 'current-text';
  const currentName = document.createElement('span');
  currentName.className = 'current-name';
  const currentHex = document.createElement('span');
  currentHex.className = 'current-hex';
  currentText.append(currentName, currentHex);
  currentEl.append(currentSwatch, currentText);
  el.appendChild(currentEl);

  const swatchesEl = document.createElement('div');
  swatchesEl.className = 'palette';
  el.appendChild(swatchesEl);

  const mixesEl = document.createElement('div');
  mixesEl.className = 'mixes';
  mixesEl.dataset.help = 'or-mixes';
  el.appendChild(mixesEl);

  function renderCurrent() {
    const c = state.currentColor;
    currentSwatch.classList.toggle('transparent-swatch', c === 0);
    currentSwatch.style.background = c === 0 ? '' : MSX2_PALETTE[c];
    currentName.textContent = `${c} · ${colorName(c)}`;
    currentHex.textContent = c === 0 ? 'no color' : MSX2_PALETTE[c];
  }

  function renderSwatches() {
    swatchesEl.innerHTML = '';
    for (let i = 0; i <= 15; i++) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'palette-swatch' + (i === state.currentColor ? ' selected' : '');
      sw.title = `${i}: ${colorName(i)}`;
      sw.setAttribute('aria-label', sw.title);
      sw.setAttribute('aria-pressed', String(i === state.currentColor));
      if (i === 0) {
        sw.classList.add('transparent-swatch');
      } else {
        sw.style.background = MSX2_PALETTE[i];
        sw.style.color = textOn(MSX2_PALETTE[i]);
        sw.textContent = String(i);
      }
      sw.addEventListener('click', () => {
        state.currentColor = i;
        render();
        onChange && onChange();
      });
      swatchesEl.appendChild(sw);
    }
  }

  function renderMixes() {
    mixesEl.innerHTML = '';
    const target = state.currentColor;

    const head = document.createElement('div');
    head.className = 'mixes-head';
    const label = document.createElement('span');
    label.className = 'mixes-label';
    label.textContent = target === 0 ? 'OR mixes' : `OR mixes for color ${target}`;
    head.appendChild(label);
    mixesEl.appendChild(head);

    const note = (text) => {
      const n = document.createElement('span');
      n.className = 'mixes-empty';
      n.textContent = text;
      mixesEl.appendChild(n);
    };
    if (target === 0) {
      note('Pick a color to see which pairs mix into it.');
      return;
    }
    const pairs = findCompositions(target);
    if (pairs.length === 0) {
      note('None: this color has no two-color mix.');
      return;
    }

    const usedColors = (opts.getUsedColors && opts.getUsedColors()) || new Set();
    if (pairs.length > MIXES_SHOWN) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'mixes-more';
      more.textContent = `More (${pairs.length})`;
      more.addEventListener('click', () => openMixesDialog(target, pairs, usedColors));
      head.appendChild(more);
    }
    const list = document.createElement('div');
    list.className = 'mix-list';
    pairs.slice(0, MIXES_SHOWN).forEach(([a, b]) => list.appendChild(mixPair(a, b, target, usedColors)));
    mixesEl.appendChild(list);
  }

  function openMixesDialog(target, pairs, usedColors) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog mixes-dialog';
    dialog.dataset.help = 'or-mixes';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const head = document.createElement('div');
    head.className = 'mixes-dialog-head';
    const sw = document.createElement('div');
    sw.className = 'current-swatch current-swatch-sm';
    sw.style.background = MSX2_PALETTE[target];
    const text = document.createElement('div');
    text.className = 'mixes-dialog-text';
    const title = document.createElement('h2');
    title.id = 'mixes-dialog-title';
    title.textContent = `OR mixes that make ${target} · ${colorName(target)}`;
    dialog.setAttribute('aria-labelledby', title.id);
    const sub = document.createElement('span');
    sub.textContent = `${pairs.length} pairs. An OR sprite combines its color index bit by bit with the sprite before it.`;
    text.append(title, sub);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'icon-btn';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = ICONS.close;
    head.append(sw, text, close);

    const list = document.createElement('div');
    list.className = 'mix-list mix-list-all';
    pairs.forEach(([a, b]) => list.appendChild(mixPair(a, b, target, usedColors)));

    dialog.append(head, list);
    overlay.appendChild(dialog);

    const dismiss = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismiss();
      }
    };
    close.addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    close.focus();
  }

  function render() {
    renderCurrent();
    renderSwatches();
    renderMixes();
  }

  render();
  return { element: el, render };
}
