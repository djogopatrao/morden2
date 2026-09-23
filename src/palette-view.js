import { MSX2_PALETTE } from './palette.js';

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

function swatch(color, used) {
  const sw = document.createElement('span');
  sw.className = 'composition-swatch' + (used ? ' used' : '');
  sw.style.background = MSX2_PALETTE[color];
  sw.title = used ? `Color ${color} (already used in a sprite)` : `Color ${color}`;
  sw.textContent = String(color);
  return sw;
}

// Renders the 15-color palette + transparency swatch, plus (below it) the
// pairs of other colors that bitwise-OR together to produce the
// currently-selected color. `state` is the shared { currentColor }
// object; clicking a swatch updates it and re-renders the panel to show
// the new selection.
// `opts.getUsedColors()`, if given, returns a `Set<number>` of palette
// colors (1-15) that currently appear on at least one sprite — pairs
// that include one of them are highlighted, since reusing an existing
// color is often preferable to introducing a new one.
export function createPaletteView(state, onChange, opts = {}) {
  const el = document.createElement('div');
  el.className = 'palette-panel';

  const swatchesEl = document.createElement('div');
  swatchesEl.className = 'palette';
  el.appendChild(swatchesEl);

  const compositionsEl = document.createElement('div');
  compositionsEl.className = 'compositions';
  el.appendChild(compositionsEl);

  function renderSwatches() {
    swatchesEl.innerHTML = '';
    for (let i = 0; i <= 15; i++) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'palette-swatch' + (i === state.currentColor ? ' selected' : '');
      if (i === 0) {
        sw.classList.add('transparent-swatch');
        sw.title = 'Transparency';
      } else {
        sw.style.background = MSX2_PALETTE[i];
        sw.title = `Color ${i}`;
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

  function renderCompositions() {
    compositionsEl.innerHTML = '';
    const target = state.currentColor;
    if (target === 0) {
      compositionsEl.textContent = '';
      return;
    }

    const heading = document.createElement('div');
    heading.className = 'compositions-heading';
    heading.textContent = `OR-compositions for color ${target}:`;
    compositionsEl.appendChild(heading);

    const pairs = findCompositions(target);
    if (pairs.length === 0) {
      const none = document.createElement('div');
      none.className = 'compositions-empty';
      none.textContent = 'None — this color has no two-color OR breakdown.';
      compositionsEl.appendChild(none);
      return;
    }

    const usedColors = (opts.getUsedColors && opts.getUsedColors()) || new Set();

    const list = document.createElement('div');
    list.className = 'composition-list';
    pairs.forEach(([a, b]) => {
      const aUsed = usedColors.has(a);
      const bUsed = usedColors.has(b);
      const pair = document.createElement('div');
      pair.className = 'composition-pair' + (aUsed || bUsed ? ' has-used-color' : '');
      pair.title = `Color ${a} OR Color ${b} = Color ${target}`;
      pair.appendChild(swatch(a, aUsed));
      const op = document.createElement('span');
      op.className = 'composition-op';
      op.textContent = 'OR';
      pair.appendChild(op);
      pair.appendChild(swatch(b, bUsed));
      list.appendChild(pair);
    });
    compositionsEl.appendChild(list);
  }

  function render() {
    renderSwatches();
    renderCompositions();
  }

  render();
  return { element: el, render };
}
