# Implementation Plan — MSX2 Mode 2 Multi-Color Sprite Editor

Based on `FUNCTIONAL_SPEC.md`. Each phase is independently shippable/
demoable and builds only on prior phases — earlier phases never assume
later ones exist. Within a phase, steps are ordered by dependency.

---

## 0. Technology Decisions

No framework/library was mandated (`USER_SPECIFICATIONS.md` says
"libraries TBD"). Recommendation, to keep the tool a single static page
with no build step (simplest to open/host/version):

- **No JS framework.** Vanilla ES modules (`<script type="module">`),
  loaded directly by the browser. The UI surface (a handful of grids,
  a palette, a toolbar) doesn't need a component framework's overhead;
  a framework would also complicate the draggable-preview and
  canvas-based pixel editing, which are naturally imperative.
- **Rendering**: HTML5 `<canvas>` per grid (crisp pixel-scaled
  rendering, one canvas per 16x16 grid + one for the composite
  preview) rather than one DOM element per pixel (256 elements/grid ×
  8 grids = 2048+ nodes would be needlessly heavy and harder to
  hit-test precisely for drag operations).
- **PNG I/O**: browser-native `canvas.toBlob('image/png')` for export
  and `createImageBitmap`/`getImageData` for import — sufficient for
  exact-palette-controlled 16x16 images, no external library needed.
- **No bundler/build step.** Plain files served statically (even
  `file://` should work, or a trivial `python3 -m http.server` for
  local dev). Keeps the whole project inspectable and dependency-free.
- **State management**: a single in-memory `Project` object (plain
  JS, see §1) with a simple pub/sub or direct re-render-on-mutation
  pattern — no state library needed at this scale.
- **Testing**: plain Node-run unit tests (no browser needed) for the
  pure-logic modules (bitmap ops, OR-compositing, byte encoders,
  decomposition algorithm, format parsers) since these are the
  highest-risk-of-bug, most precisely-specified parts. UI interaction
  is verified manually in-browser (per project convention: test in a
  real browser before calling UI work done).

This can be revisited if the user has a preference (e.g. React/Vue,
Vite), but nothing in the spec requires it, and vanilla + canvas keeps
the sprite/byte-level precision easiest to reason about directly.

---

## 1. Phase 1 — Core Data Model & Single-Grid Editor

**Goal:** one 16x16 grid on screen, paintable, with the fixed palette.
No multi-grid, no preview, no import/export yet.

1. `Sprite` data model: `{ opacity: Uint8Array(16*16), rowColors: Uint8Array(16), orMode: boolean, x: number, y: number }`. Row color `0` reserved/unused (matches hardware — see spec §11.2); palette colors are `1..15`.
2. MSX2 sprite palette table: 16 RGB entries (index 0 unused/transparent, 1–15 real colors) — pull standard MSX2 palette values.
3. `Project` data model: `{ grids: Sprite[] }` (1–8 entries).
4. Canvas-based grid renderer: draws a 16x16 `Sprite` at N×N pixel scale (e.g. 20px/cell) onto a `<canvas>`, transparent cells checkerboarded.
5. Palette panel component: 15 swatches + transparency swatch, tracks "current paint color" (0 = transparent/eraser, 1–15 = color).
6. Pointer-event handling on the grid canvas: hit-test cell under cursor, left-click paints per spec §5.1 (set opacity bit, overwrite row color unconditionally when painting with a real color).
7. Row "c" swatch column next to the grid: click recolors all opaque pixels in that row (spec §5.1, second bullet).
8. Manual browser check: paint a multi-color 16x16 sprite by hand, confirm row-overwrite behavior and the "c" recolor behavior both match spec.

**Exit criteria:** a single grid can be freely painted, respects the
one-color-per-row hardware rule automatically, matches spec §2/§5.1.

### Backlog (from `USER_REVIEW.md`, not required for MVP exit criteria)

Extra interaction affordances beyond the original spec, all naturally
slot into this phase's grid/palette components since they only touch
painting/palette-selection, not later state (undo, OR, import/export).
Implement opportunistically once the Phase 1 MVP above is solid, or
defer — they don't block any later phase.

- **Palette**: show each color's index in hex on its swatch (tooltip or
  small overlay label).
- **Grid — right-click**: paints transparent (quick-erase) regardless
  of the currently selected palette color, without needing to reselect
  the transparency swatch first.
- **Grid — middle-click (center-click)**: eyedropper — sets the current
  palette color to the color of the clicked pixel's row (no-op if the
  clicked pixel is transparent, per the note in `USER_REVIEW.md`).
- **Extra paint tools**: fill area (bucket fill respecting the
  one-color-per-row rule — a fill must either stay within a single row
  or recolor/opacity-fill consistently across the rows it touches, needs
  a small design decision when implemented), line, box, circle/oval.
  Each is a bitmap-generation helper feeding the same `paintPixel`
  primitive already used by freehand painting — no new data-model work.

---

## 2. Phase 2 — Multi-Grid Management

**Goal:** the full 1–8 grid layout with add/remove.

1. Render `Project.grids` as a horizontal row of grid components (reuse Phase 1's single-grid component).
2. "+" control: appends a new empty `Sprite` (default position matching spec, disabled/hidden at 8 grids).
3. Per-grid "×" remove control (disabled on grid 0 / first grid).
4. Per-grid OR-mode toggle control (sets `orMode` boolean; no visual compositing yet — just state).
5. Manual check: add up to 8 grids, confirm "+" disables; remove middle grids, confirm remaining grids shift left and grid 0 is never removable.

**Exit criteria:** matches spec §3, §5.2, and the UI layout in §4 (minus preview panel, added next).

---

## 3. Phase 3 — OR-Composite Preview

**Goal:** the live preview panel, implementing the *exact* hardware OR
rule (spec §2.3) — this is the tool's core value proposition, so it
gets its own phase and dedicated tests before anything else builds on
top of it.

1. Pure function `compositeGrids(grids: Sprite[]): RGBACanvas-or-2DArray` implementing:
   - Iterate grids in array order (= plane priority, index 0 highest).
   - For each grid, determine per-line effective "OR group": a `CC=1` grid's lines glue onto the nearest preceding grid (lower index) with `CC=0`. (v1: `CC` is per-grid, not per-line, so this reduces to: walk grids in order, each `orMode=false` grid starts a new priority group anchored at itself; each subsequent `orMode=true` grid until the next `orMode=false` grid joins that group.)
   - Within a group, wherever 2+ grids have an opaque pixel at the same absolute (x+offset, y+offset) coordinate, the displayed color is the bitwise OR of their color indices; where only one grid in the group is opaque there, its own color shows.
   - Across groups (and for pixels not covered by the above), normal priority stacking: lowest-index opaque grid wins.
   - Grids are positioned using their `(x, y)` preview offsets (integer pixel offsets relative to a shared origin).
2. Render the composited result to the preview `<canvas>`.
3. Recompute + redraw the preview on every grid mutation (paint, add/remove grid, OR toggle, drag-reposition).
4. Draggable positioning: pointer-drag on a grid's thumbnail within the preview panel updates that grid's `(x, y)`; live-updates the composite as it drags.
5. **Unit tests** (Node, no browser) for `compositeGrids` covering: two non-OR overlapping sprites (priority stacking), a `CC=1` chain of 3 sprites merging with one `CC=0` base, a `CC=1` sprite with no preceding `CC=0` sprite (edge case per spec §2.3), non-overlapping sprites (composite is just their union).

**Exit criteria:** preview visually and algorithmically matches spec §2.3's hardware rule, verified both by unit tests and manual visual check against hand-computed expected OR colors.

### Backlog (from `USER_REVIEW.md`, not required for MVP exit criteria)

These all reuse this phase's OR-bitwise logic (`colorA | colorB`) —
natural follow-ups once `compositeGrids`/the OR rule exists and is
tested, but not required for the preview itself to work:

- **Palette — hover a color**: show which pairs of the other 14 colors
  bitwise-OR together to produce the hovered color (a simple
  `a | b === hovered` scan over the 15×15 color pairs — much simpler
  than the backlogged optimal decomposition search, since it's
  palette-only, not pixel-shape-aware).
- **Palette — "?" button → modal**: a reference grid showing, for a
  16x16 (or 15x15) layout, the OR result of every color pair — a static
  precomputed table using the same `a | b` logic.
- **Preview — hover a pixel**: show its final color, and if it came
  from an OR group (per `groupGrids`/`compositeGrids`), break down
  which grids/colors contributed. Requires `compositeGrids` to
  optionally return per-pixel contributor info (currently it only
  returns the final color) — a small extension of the Phase 3 return
  shape when this is implemented, not a redesign.

---

## 4. Phase 4 — Undo/Redo

**Goal:** a single linear undo/redo stack over the whole `Project`.

1. Command/snapshot-based history: on every mutating action (paint, recolor, add/remove grid, OR toggle, drag) push a snapshot (or inverse command) onto an undo stack; clear the redo stack on new actions.
2. Undo/Redo toolbar buttons wire to the stack; keyboard shortcuts (Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z) optional nice-to-have, not required by spec.
3. Manual check: perform a sequence of paints/grid-adds/OR-toggles, undo/redo through the whole sequence, confirm exact state restoration including preview.

**Exit criteria:** matches spec §5.6 for all operations implemented so far. (Cut/paste/rotate/mirror/import history integration revisited when those land in Phases 5–6.)

---

## 5. Phase 5 — Selection, Cut/Copy/Paste, Clear

**Goal:** spec §5.3–§5.4 in full.

1. Selection state per grid: `none | whole | rect(r0,c0,r1,c1)`.
2. Whole-grid select affordance (e.g. click grid header/background).
3. Rectangular drag-select on the grid canvas (distinguish from paint-drag — likely: painting uses left-click+drag directly on cells with a color selected, selection uses a dedicated "select" tool mode, or a modifier key; **decide exact interaction gesture during this phase** and note it here once implemented, since the spec doesn't pin down the exact input gesture).
   - **Resolved**: a dedicated "Select" toolbar toggle (`state.tool`: `'paint' | 'select'`). While active, drag on a grid's canvas rectangle-selects instead of painting; clicking a grid's label (the header/background click zone) always sets whole-grid selection regardless of tool mode, since that gesture never conflicts with painting. Only one grid can hold the active selection at a time (app-level `selectionState`), matching §5.3.
4. Clipboard state: `{ kind: 'whole', sprite: Sprite } | { kind: 'rect', width, height, opacity, rowColors }`.
5. Cut = Copy + Clear. Clear sets opacity bits in the selection to 0 (row colors untouched, per spec §5.4 resolved default).
6. Copy captures the selection per §5.4.
7. Paste (whole-grid clipboard): replace target grid's contents immediately (per spec §5.4 resolved default — no drag needed since grids are uniform size).
8. Paste (rect clipboard): floating-paste mode — draggable overlay on the target grid, confirm (click outside / Enter / commit button) or cancel (Escape / cancel button), per spec §5.4.
9. Right-click quick-erase: prevents contextmenu and paints transparent (erases) via e.button === 2, documented in HANDOFF.md.
10. Middle-click eyedropper: handles e.button === 1 by loading the target pixel's row color to state.currentColor, excluding transparent pixels per spec §5.1. Documented in HANDOFF.md.
9. Wire all of the above into the Phase 4 undo stack.
10. Manual check: rectangular copy from one grid, drag-position paste into another, confirm row-color-overwrite semantics (§5.1) apply correctly on commit; confirm cancel leaves target untouched.

**Exit criteria:** matches spec §5.3–§5.4 fully.

---

## 6. Phase 6 — Rotate / Mirror

**Goal:** spec §5.5.

1. Rotate 90° CW: transform the 16x16 opacity bitmap; recompute each new row's color via majority-vote over contributing original columns (spec §5.5 resolved rule); implement tie-break (lowest palette index, or first-encountered column — pick one, document it here).
2. Mirror horizontal: flip columns, row colors unchanged.
3. Mirror vertical: flip row order, row colors move with their rows.
4. Disable both tools when a partial-rectangle selection is active (whole-grid only, per spec).
5. Unit tests for the rotate color-reassignment rule against a couple of hand-constructed multi-color sprites (this is the trickiest logic in this phase — verify it precisely rather than only eyeballing it).
6. Wire into undo stack.

**Exit criteria:** matches spec §5.5.

---

## 7. Phase 7 — Persistence (Autosave)

**Goal:** spec §8's `localStorage` autosave.

1. Serialize `Project` to JSON (grids' opacity/rowColors/orMode/position).
2. Debounced save to `localStorage` on every mutation.
3. On page load, restore from `localStorage` if present, else start with one empty grid.
4. Manual check: edit, refresh the page, confirm state survives; clear `localStorage` and reload, confirm clean default state.

**Exit criteria:** matches spec §8.

---

## 8. Phase 8 — Static Exports (PNG, C, BIN)

**Goal:** the three export formats that need **no decomposition
algorithm** — they export the grids exactly as authored. Doing these
before TinySprite/BASIC exports and before import (Phase 9) gets
working export out the door sooner and exercises the byte-layout code
(spec §11) that Phase 9/10 also depend on.

1. Shared byte-encoding module (this is the load-bearing, spec-critical piece — implement once, reuse everywhere):
   - `encodePattern(sprite): Uint8Array(32)` — quadrant order per spec §11.1.
   - `encodeColorTable(sprite): Uint8Array(16)` — `EC|CC|IC|0|color` byte per spec §11.2, `CC` bit from `sprite.orMode`.
2. Unit tests: encode the sample sprite from `tinysprite.bas`/`tinysprite.c` (reconstruct its `Sprite` by hand from the `.tiny` ASCII art) and assert the encoder's output byte-for-byte matches the sample's `DATA`/array values. This is the single most valuable test in the whole project — it's a real, human-verified ground truth.
3. PNG export: one PNG per grid (render via existing grid canvas, `toBlob`), plus one PNG of the current composite preview canvas (Phase 3). Bundle as a `.zip` or trigger multiple downloads — **decide and document the delivery mechanism here** (a zip avoids multi-download browser prompts; a tiny zero-dependency zip writer, or multiple sequential downloads, are both acceptable — pick one during implementation).
4. C export: text template matching `tinysprite.c`'s structure — `sprite_patterns[]` and `sprite_attributes[]` concatenating each grid's encoded bytes in grid order.
5. BIN export: two `Blob`s/downloads — concatenated pattern bytes, concatenated color-table bytes, in grid order.
6. Manual check: export all three, spot-check byte values for a hand-painted sprite against manual hex computation.

**Exit criteria:** matches spec §7 for PNG/C/BIN; byte encoder is unit-tested against real reference data.

---

## 9. Phase 9 — Import: PNG, TinySprite (simplified, one grid per color)

**Goal:** spec §6.1–§6.2, using a **simplified** decomposition strategy
instead of the optimal minimal-grid-count search engine originally
scoped here (see `Backlog` below for that version, deferred). The
simplified strategy: for a target 16x16 image, emit **one grid per
distinct color present** — each grid holds only that color's pixels
(so its `rowColors` are trivially uniform, no per-row conflicts are
possible), `orMode` stays `false` on every grid (no OR grouping is
needed since, by construction, no two color-grids ever have an opaque
pixel at the same coordinate — the source image has one color per
pixel). This is not grid-count-optimal (the `.tiny` sample's slot 0
uses 4 colors → 4 grids here, vs. the sample's own hand-authored
2-grid OR solution) but it's simple, always correct, and needs no
search/backtracking.

1. `decomposeByColor(colors: Uint8Array(256)): Sprite[]` — pure function, one entry per distinct non-zero color in `colors` (0 = transparent), each `Sprite`'s opacity/rowColors built directly from that color's pixels, in ascending color-index order.
2. Reject (surface a clear error) if the distinct-color count exceeds the remaining grid budget (8 total, or fewer if grids already exist) — same "no feasible import" case the original algorithm would also have hit, just with a simpler trigger condition (color count, not a search failure).
3. PNG import: file picker → decode via canvas `getImageData` → validate exactly 16x16 and every pixel's RGBA matches a palette entry (or full transparency) exactly, reject with a clear message otherwise → run `decomposeByColor` → replace/append resulting grids (respecting the 8-grid cap) → push to undo stack.
4. TinySprite `.tiny` import: text parser for the format in spec §6.1 (`!type`/`msx2` header, `#Slot N` blocks, digit/`.`/`0` decoding per spec §12.1) → for each slot in order, run `decomposeByColor`, respecting the skip-whole-slot-on-overflow rule (spec §12.2) → append resulting grids.
5. Surface a user-visible warning when an import was truncated (slot skipped) or when a PNG is rejected for palette/size violations.
6. Unit tests for `decomposeByColor`: single-color image (1 grid); a multi-color synthetic image (N distinct colors → N grids, each pixel-exact); the actual sample `.tiny` slot 0 (4 colors: 2, 10, 6, 9) → 4 grids, each reproducing exactly that color's pixels — confirmed pixel-exact against the composite, not byte-for-byte against the sample's own 2-grid `mask0/mask1` (that specific 2-grid breakdown is what the backlogged optimal algorithm would reproduce, not this one).
7. Manual check: round-trip the provided `tinysprite_backup.tiny` sample through import, confirm the resulting grids' **composite** visually reproduces the sample's ASCII art exactly (even though the grid count/breakdown differs from the sample's own authored `mask0`/`mask1` split).

**Exit criteria:** matches spec §6.1–§6.2 and §12.1–§12.2, using the simplified per-color strategy; pixel-exact reproduction, not grid-count-optimal.

---

## 10. Phase 10 — Export: TinySprite, BASIC

**Goal:** the two remaining export formats.

1. TinySprite `.tiny` export: for each grid, render its own 16x16 image (its own opacity+row-colors only, no cross-grid OR composite — per spec §7's table) as ASCII using the digit convention from §6.1, wrapped in `#Slot N` blocks with the `!type`/`msx2` header.
2. BASIC export: `DATA` statements for pattern + color/attribute bytes (reuse Phase 8's encoders) formatted like `tinysprite.bas`'s structure, plus the minimal fixed loader (spec §12.3): sets pattern generator table address (`R#6`/`VDP`), sprite color table (derived as attribute-table-address − 512 per spec §11.2), sprite attribute table entries (Y/X per each grid's preview offset, pattern number a multiple of 4 per grid), turns sprites on, and stops (no runtime interactivity, per resolved scope).
3. Manual check (ideally in an MSX2 emulator, e.g. openMSX, if available in this environment/toolset) — load the exported BASIC program and visually confirm the displayed OR effect matches the in-browser preview exactly. This is the ultimate correctness check for the whole tool's core premise.

**Exit criteria:** matches spec §7 in full; ideally validated end-to-end in a real/emulated MSX2.

---

## 11. Phase 11 — Polish Pass

1. Error/warning UI for import rejections and truncations (currently just "surfaced" in Phase 9 — make sure it's an actual visible, non-blocking UI element, not a console log or `alert()`).
2. Keyboard/accessibility pass on toolbar buttons (labels, focus states) — not in spec but low-cost baseline quality.
3. Re-read `FUNCTIONAL_SPEC.md` end-to-end against the running tool as a final acceptance check, one section at a time.

---

## Backlog — BASIC Export Doesn't Actually Run on a Real/Emulated MSX2

Reported after Phase 10 shipped (`src/codec/basic-export.js`): the
generated `.bas` was never actually validated in an emulator at
implementation time (no running openMSX instance was available/
launchable in that session — see IMPLEMENTATION_PLAN.md §10 step 3,
which flagged this as best-effort). Two failures observed testing the
real output against openMSX:

1. **`LOAD"sprites.bas"` → `Direct statement in file`.** Our export is
   plain ASCII text, but MSX-BASIC's `LOAD` defaults to expecting a
   BSAVE-tokenized binary program; loading an ASCII file needs the
   explicit `LOAD"sprites.bas",A` form, or MSX-BASIC misparses the raw
   bytes as a tokenized program and throws this exact error. Likely
   just needs either (a) a note in the exported file/export UI telling
   the user to use `,A`, or (b) rename/re-save as `.bas` with whatever
   convention makes emulators/real hardware default to ASCII load, if
   one exists.
2. **Pasting the code directly (bypassing LOAD) still yields a black
   screen** — i.e. even once the "direct statement" parse issue is
   sidestepped, the program itself doesn't visibly render sprites.
   Root cause unconfirmed; the loader's `SPRITE$`/`COLOR SPRITE$`/
   `PUT SPRITE` design (see the design comment atop `basic-export.js`)
   was based on general MSX-BASIC knowledge, not verified against the
   handbook or a real emulator run, so any of these are suspect:
   - `PUT SPRITE n,(x,y),,p` — unconfirmed that the empty color
     argument actually falls back to the `COLOR SPRITE$` table instead
     of, say, defaulting to color 0/invisible.
   - Whether `SCREEN 5`'s default sprite mode is really Mode 2, or an
     explicit switch is also needed.
   - `COLOR 15,1,1` (foreground/background/border) — possible the
     background color choice or screen state otherwise obscures the
     sprites, or this call has a different arity/effect than assumed.
   - Whether `SPRITE$(n)=`/`COLOR SPRITE$(n)=` need the sprite plane
     "enabled" some other way before `PUT SPRITE` takes effect.

**Next step when picked up:** get this actually running under openMSX
(with the user's explicit involvement per `openmsx-debug`'s boot
rule — an agent must not launch it unattended) and iterate line-by-line
against real output rather than documentation inference.

---

## Backlog — Optimal Decomposition Algorithm

Deferred (not on the active phase sequence). This is the original,
grid-count-**minimizing** decomposition engine — a strict upgrade over
Phase 9's "one grid per color" strategy, which it could later replace
without changing PNG/TinySprite import's UI or external behavior (same
input, same pixel-exact guarantee, just fewer grids and OR-grouping
where profitable).

**Goal:** minimum-grid-count decomposition of an unconstrained 16x16
target image (spec §6.3), using OR-compositing across grids rather
than one grid per color.

1. Input: a 16x16 array of "target" color indices (0 = transparent, 1–15 = color), i.e. an *unconstrained* per-pixel image.
2. Per-row subproblem: for each of the 16 rows independently, enumerate the ways to cover that row's per-pixel target colors using a small ordered stack of (color, opacity-mask) contributions such that later (OR) contributions bitwise-OR onto the earlier (base) one only where both are opaque, and the final visible color at each opaque pixel matches the target exactly. Row-local search space is small (≤16 pixels, ≤15 colors) — brute-force/backtracking per row is tractable.
3. Global merge: combine the 16 rows' per-row solutions into whole 16-row sprites — each "layer" in a row's solution becomes one row-slice of some grid; the minimization goal is the fewest total grids (spec §6.3), which means preferring to reuse the same grid-layer-index across as many rows as possible rather than minimizing each row in isolation. Concretely: try increasing sprite counts `n = 1, 2, ... 8`; for each `n`, check via constraint search whether every row's target can be produced by some assignment of (up to `n`) per-row (color, opacity, OR-flag) contributions consistent with a fixed set of `n` grids each having exactly one color per row; stop at the first feasible `n`.
4. Reject (surface a clear error) if no feasible decomposition exists within 8 grids (or the remaining import budget) — this can genuinely happen for adversarial/invalid inputs.
5. Unit tests: a single-color 16x16 image (trivial, n=1); a genuinely 2-layer OR image built from two hand-designed sprites (should recover n=2, matching colors); the actual sample `.tiny` slot's row 12 (`6699` mixing colors 6 and 9) as a real-world regression case — confirm it decomposes to a 2-grid solution with the second grid OR-flagged, matching the sample's own `mask1/attr1`.
6. This is the highest-algorithmic-risk piece in the whole project — budget significant implementation time if/when this is picked back up.

**Exit criteria (if picked up):** a standalone, well-tested pure function that can be swapped in for `decomposeByColor` in Phase 9's import call sites.

---

## Suggested File Structure

```
mode2_sprites/
  index.html
  src/
    model.js           # Sprite/Project data structures
    palette.js          # MSX2 palette table
    grid-view.js         # canvas-based single-grid renderer + input handling
    composite.js        # Phase 3: compositeGrids() + OR hardware rule
    history.js           # Phase 4: undo/redo stack
    clipboard.js          # Phase 5
    transform.js          # Phase 6: rotate/mirror
    persistence.js         # Phase 7: localStorage
    codec/
      pattern.js         # Phase 8: encodePattern/encodeColorTable (+ decode for import)
      png.js              # Phase 8/9: PNG export/import
      c-export.js         # Phase 8
      bin-export.js        # Phase 8
      tinysprite.js         # Phase 9/10: .tiny parse/serialize
      basic-export.js       # Phase 10
    decompose-by-color.js    # Phase 9 (simplified); backlog swaps in decompose.js (optimal) later
    app.js                  # wiring/UI glue
  test/
    composite.test.js
    codec.test.js
    decompose-by-color.test.js
    transform.test.js
  References/               # (existing, untouched)
  USER_SPECIFICATIONS.md
  FUNCTIONAL_SPEC.md
  IMPLEMENTATION_PLAN.md
```

---

## Dependency Summary

```
Phase 1 (single grid) ──┬─→ Phase 2 (multi-grid) ──┬─→ Phase 3 (OR preview) ──→ Phase 4 (undo/redo) ──┬─→ Phase 5 (select/cut/copy/paste)
                         │                          │                                                  ├─→ Phase 6 (rotate/mirror)
                         │                          │                                                  └─→ Phase 7 (autosave)
                         │                          └─→ Phase 8 (PNG/C/BIN export) ── (byte encoders reused by) ──┐
                         │                                                                                       │
                         └─→ Phase 9 (PNG/TinySprite import, simplified per-color decomposition) ────────────────┤
                                                                                                                   ↓
                                                                                            Phase 10 (TinySprite/BASIC export)
                                                                                                                   ↓
                                                                                                       Phase 11 (polish)

Backlog: optimal decomposition algorithm — a drop-in replacement for
Phase 9's `decomposeByColor`, deferred indefinitely.
```

Phases 8 and 9 can be built in parallel (independent of each other);
both feed Phase 10. Everything before Phase 8 is a strict linear chain.
Phase 9 no longer depends on the (now-backlogged) optimal decomposition
algorithm.
