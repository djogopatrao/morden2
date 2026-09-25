# HANDOFF.md — MSX2 Mode 2 Multi-Color Sprite Editor

Written for a coding agent with no prior context on this repo. Source of
truth is the actual code as of commit `e3bab00` (repo root, single commit,
branch `master`). Verified by direct inspection, not memory.

---

## 1. Project Overview

A browser-based editor for **MSX2 "Mode 2" hardware sprites**, specifically
built to design and preview the **OR-color effect**: when two sprite planes
overlap and one is flagged "OR mode" (`CC` bit), the hardware bitwise-ORs
their color indices per-pixel instead of one occluding the other. No
existing MSX sprite tool (e.g. TinySprite) lets you preview this — that's
this project's whole reason to exist (see `USER_SPECIFICATIONS.md`).

User-facing features (all implemented and working):
- Paint up to 8 sprite "grids" (16x16, one color per row — the real
  hardware constraint), with select/cut/copy/paste, rotate, mirror,
  undo/redo.
- A live composited preview panel showing the real OR-hardware rule, with
  draggable per-sprite positioning.
- Cross-sprite pixel hover highlighting + a coordinate/color readout
  (row, col, this sprite's color, and the actual composited color).
- A palette panel that shows, for the selected color, every pair of *other*
  colors that bitwise-OR into it, highlighting pairs that reuse
  already-used colors.
- Two selectable palettes: `regular` (standard MSX2 hues) and `screen8`
  (brighter RGB332-style hues) — swaps every color's rendered/exported hue
  without touching the underlying color-index data.
- Import: PNG (16x16, exact-palette pixels only), TinySprite `.tiny`
  backup format.
- Export: PNG (per-grid + composite), C array, raw BIN, TinySprite `.tiny`,
  MSX-BASIC program.
- `localStorage` autosave/restore.

**Status**: All items in `IMPLEMENTATION_PLAN.md` Phases 1–11 are
implemented. 69 unit tests pass (`npm test`). The BASIC export is
**functionally complete but unverified against real/emulated hardware**
(see §13). Several nice-to-have interaction tools from `USER_REVIEW.md`
are not implemented (see §14).

---

## 2. Technology Stack

| Tech | Role |
|---|---|
| Vanilla JavaScript (ES modules, `<script type="module">`) | Entire app. No framework (React/Vue/etc.) anywhere. |
| HTML5 `<canvas>` | All pixel rendering: per-grid editor, composite preview. No per-pixel DOM nodes. |
| Plain CSS (`src/style.css`) | No CSS framework, no preprocessor. |
| `node:test` (Node's built-in test runner) | All 69 unit tests, run via `npm test`. No Jest/Mocha/Vitest. |
| Browser-native `canvas.toBlob`, `createImageBitmap`, `getImageData` | PNG import/export — no image library. |
| `localStorage` | Autosave/restore. |

**No `package.json` dependencies or devDependencies at all** — this is a
deliberately zero-dependency, no-build-step project. `package.json` has
exactly one script (`test`). There is no bundler, no linter, no formatter
configured.

A throwaway Playwright/Chromium install was used once in a prior session
to manually verify browser behavior — **it is not part of this repo**, not
a dependency, and left no trace in `package.json`/`node_modules` here.

---

## 3. How to Run the Project

```bash
# Install: nothing to install — zero dependencies.

# Run the app locally (any static file server works):
python3 -m http.server 8000    # then open http://localhost:8000/index.html
# Opening index.html directly via file:// is UNVERIFIED — ES module
# <script type="module"> imports may be blocked by some browsers' CORS
# policy for file:// origins. Needs verification if that path matters.

# Run all unit tests:
npm test
# = node --test test/*.test.js   (69 tests, no browser needed)

# Build: N/A — no build step, static files served as-is.
# Lint/format: N/A — not configured.
```

No environment variables, no external services, no local databases. Any
modern evergreen browser with Canvas2D + ES modules + Pointer Events
should work; not explicitly cross-browser-tested (developed/verified in
Chromium via Playwright).

---

## 4. Repository Map

```text
index.html                 # entry point — loads src/app.js as a module
src/
├── app.js                 # 645 lines — ALL UI wiring/event handling/toolbar glue (see §5)
├── model.js                # Sprite/Project data structures + pure mutators (getPixel, paintPixel, recolorRow, addGrid, removeGrid, cloneSprite)
├── palette.js               # Two fixed 16-color palettes (regular/screen8) + the mutable "active palette" singleton (see §7 — load-bearing mechanism)
├── composite.js              # compositeGrids()/groupGrids() — the OR-hardware-rule algorithm (core value proposition of the whole tool)
├── history.js                # Snapshot-based undo/redo over project.grids only
├── clipboard.js               # copy/cut/clear/paste logic (whole-grid and rectangular)
├── transform.js                # rotateCW/mirrorHorizontal/mirrorVertical
├── decompose-by-color.js         # Import decomposition: one grid per distinct color (NON-optimal, see §13)
├── persistence.js                 # localStorage serialize/deserialize/autosave
├── download.js                     # <a download> blob-save helper
├── grid-view.js                     # 376 lines — one 16x16 editable grid's canvas + DOM (largest UI module)
├── palette-view.js                   # Palette swatches + OR-composition hint panel
├── preview-view.js                    # Composite preview canvas, drag-to-reposition, hover reporting
├── style.css                           # All styling
└── codec/
    ├── pattern.js                       # encodePattern/encodeColorTable — THE shared byte-layout source of truth (§10)
    ├── png.js                            # PNG import/export (uses pattern.js indirectly via composite, not directly)
    ├── c-export.js                        # .c file (sprite_patterns[]/sprite_attributes[])
    ├── bin-export.js                       # raw pattern.bin / colors.bin
    ├── tinysprite.js                        # .tiny parse + serialize
    └── basic-export.js                       # MSX-BASIC program generator (UNVERIFIED on hardware, see §13)
test/                                          # 11 files, node:test, mirrors most src/ modules (see §15 for gaps)
FUNCTIONAL_SPEC.md      # detailed technical spec, source of truth for hardware rules
IMPLEMENTATION_PLAN.md  # phase-by-phase build plan + two explicit backlog sections (read these — they document real known issues)
USER_SPECIFICATIONS.md  # original user brief — DO NOT EDIT (file says so; user-owned)
USER_REVIEW.md          # user's follow-up UX wishlist — partially implemented, see §14
References/             # reference material (MSX2 handbook excerpt, tinysprite sample files) — not code, don't need to read for most tasks
```

---

## 5. Application Entry Points

`index.html` is the only HTML page. It declares empty host `<div>`s by ID
and loads `src/app.js` as `<script type="module">` — that one script does
all initialization; there is no separate bootstrap/router.

**Startup sequence (top of `src/app.js`, executes synchronously in file
order on module load):**

1. `createProject()` — a default `Project` with one empty `Sprite` and
   `paletteType: 'regular'`.
2. `loadProject()` — reads `localStorage['mode2-sprites/project']`; if
   present and well-formed, its `grids`/`paletteType` overwrite the
   defaults.
3. `setPaletteType(project.paletteType)` — syncs the module-level active
   palette table in `palette.js` to match (see §7 — must happen before
   any rendering).
4. `createAutosave(project)` — sets up debounced localStorage writes.
5. DOM host elements looked up by ID (`document.getElementById(...)`) —
   **no existence check; a missing host div throws at startup.**
6. `createPaletteView`, palette-type toggle buttons, `createHistory`,
   `createPreviewView` are constructed and appended to their hosts.
7. Toolbar buttons (undo/redo/new project, pencil/select/cut/copy/
   paste/rotate/flip/clear, export buttons, import file-pickers) are
   created and wired to handler functions defined further down the file.
8. A `window.keydown` listener registers Ctrl/Cmd shortcuts (Z/Y/A/C/X/V)
   and Escape/Enter for paste-mode.
9. `renderGrids()` — builds the actual per-sprite grid DOM/canvases for
   the current `project.grids` (first real render).
10. `updateHistoryButtons()`, `updateEditButtons()` — final button-state
    sync.

There is no async work at startup (no fetch/network calls); everything
above runs before the page is interactive.

---

## 6. Architecture

**No framework, no virtual DOM, no formal state container.** The pattern
is: mutate plain JS objects/typed arrays directly, then explicitly call
the redraw function(s) that need to reflect the change. This is manual
and consistent, not implicit/reactive.

- **`app.js`** owns all transient UI state (module-level `let` variables)
  and is the only module that touches multiple other modules' functions
  together — it's the composition root / controller. Every toolbar
  action is a small `doX()` function: mutate `project` (usually via
  `history.perform(...)`), then call `renderGrids()` and/or `redraw()`
  (a helper that calls `preview.draw()` + `paletteView.render()`) and
  `updateHistoryButtons()`/`updateEditButtons()`.
- **`grid-view.js`** is a self-contained factory (`createGridView`) — one
  instance per sprite, each owning its own `<canvas>` and pointer-event
  handlers. It reports interactions back to `app.js` via callbacks in
  its `opts` (never imports/calls into `app.js`).
- **`preview-view.js`** and **`palette-view.js`** are the same pattern:
  factory functions returning `{ element, draw/render, ... }`, driven by
  callbacks, not events/pub-sub.
- **`composite.js`, `codec/*`, `model.js`, `transform.js`, `clipboard.js`,
  `history.js`, `decompose-by-color.js`** are pure logic modules with no
  DOM dependency at all — this is why they're independently unit-testable
  under plain Node (`node:test`), and why they're safe to read/reason
  about in isolation.

**Full-rebuild vs. targeted redraw**: `renderGrids()` in `app.js` does
`gridsHost.innerHTML = ''` and reconstructs every `GridView` from scratch
on *any* structural change (paint doesn't trigger this — only add/remove
grid, undo/redo, paste-commit, import, new-project, palette-type switch).
Plain pixel edits instead call the specific view's own `draw()` (cheap,
no DOM teardown). This distinction matters: adding a new per-grid
interaction should go through the *existing* `GridView` instance's local
state, not assume it survives a `renderGrids()` call (it doesn't — a new
`GridView` instance is created).

**Data flow direction:** `project.grids` (mutated) → `renderGrids()` /
view `.draw()` calls → canvas repaint. There is no reverse flow (DOM never
mutates `project` directly; all mutation goes through `model.js`/
`clipboard.js`/`transform.js` functions called from `app.js` event
handlers).

---

## 7. State Model

### `Project` (the only undo-tracked, persisted state)
```js
{ grids: Sprite[], paletteType: 'regular' | 'screen8' }
```
- Defined/created in `model.js` (`createProject()`).
- Owned by `app.js` (the single `const project = ...` instance; passed by
  reference into `createHistory`, `createPreviewView`, and per-grid
  `createGridView` calls).
- `grids.length` invariant: **1 ≤ length ≤ 8** (`MAX_GRIDS = 8` in
  `model.js`). `removeGrid()` refuses to go below 1.
- Persisted via `src/persistence.js` (`serializeProject`/
  `deserializeProject`) to `localStorage['mode2-sprites/project']`.

### `Sprite` (one hardware sprite plane)
```js
{
  opacity: Uint8Array(256),   // row-major 16x16, 0/1
  rowColors: Uint8Array(16),  // 0 = unset, 1-15 = palette color index
  orMode: boolean,            // the hardware "CC" bit
  x: number, y: number,       // preview-panel offset (can be negative)
}
```
- Created by `createSprite()` in `model.js`.
- **Invariant**: a row can only ever have ONE color at a time. Painting a
  pixel with a real color (`paintPixel`) unconditionally overwrites the
  *whole row's* `rowColors[row]`, even for already-opaque pixels in that
  row with a different color. This is the central hardware constraint the
  whole editor exists to enforce — never bypass it by writing to
  `opacity`/`rowColors` directly without going through `paintPixel`/
  `recolorRow`/the transform/clipboard functions that already respect it.
- `cloneSprite()` is the deep-clone used by `history.js` for undo
  snapshots — if you add a new field to `Sprite`, you **must** add it to
  `cloneSprite()` too, or undo/redo will silently drop it.

### Transient UI state (module-scope `let` in `app.js` — NOT in `Project`, NOT persisted, NOT undo-tracked)
| Variable | Shape | Purpose |
|---|---|---|
| `selectionState` | `{ gridIndex, selection }` | current select-tool selection, scoped to one grid |
| `clipboard` | `{kind:'whole',sprite}` \| `{kind:'rect',...}` \| `null` | see `clipboard.js` |
| `activeGridIndex` | `number` | last grid interacted with (paste/rotate/mirror target) |
| `pasteState` | `{gridIndex, clip, x, y}` \| `null` | floating rect-paste in progress |
| `hoverCell` | `{row, col, color, gridIndex}` \| `null` | pointer-hover cell, shared across all grid views + preview |
| `compositeHoverColor` | `number \| null` | OR-composited color at the hovered world position, reported by `preview-view.js` |
| `state` | `{ currentColor: 1-15\|0, tool: 'paint'\|'select' }` | shared paint state passed into every `GridView`/`PaletteView` |

### Palette active-table singleton (`palette.js`) — see §11, load-bearing/non-obvious
`MSX2_PALETTE` is a **mutable array, never reassigned**, initialized as a
copy of the regular palette. `setPaletteType(type)` overwrites its 16
entries **in place**. Every module that does
`import { MSX2_PALETTE } from './palette.js'` shares this exact array
object, so mutating it propagates automatically to every consumer without
re-importing. `palette.js` also exports a live-binding `paletteType`
variable that mirrors the last `setPaletteType()` call — **this is
separate from and can drift from `project.paletteType`** if a caller
updates one without the other (currently only `app.js` does this, and it
always updates both together — see §11 invariant #3).

---

## 8. Major Features

| Feature | Files | Notes |
|---|---|---|
| Paint / row-recolor | `grid-view.js`, `model.js` (`paintPixel`, `recolorRow`) | Left-click-drag paints; row "c" swatch recolors whole row. Right-click-erase, middle-click eyedropper implemented per USER_REVIEW.md. |
| Multi-grid management | `app.js` (`renderGrids`, add/remove handlers), `model.js` (`addGrid`/`removeGrid`) | Full teardown/rebuild of grid DOM on every add/remove. |
| OR-composite preview | `composite.js` (`compositeGrids`/`groupGrids`), `preview-view.js` | Core feature. `groupGrids` implements the "an OR-mode grid glues onto the nearest preceding non-OR grid" hardware rule (FUNCTIONAL_SPEC.md §2.3). Draggable per-sprite positioning via pointer events on the preview canvas. |
| Undo/redo | `history.js` | Snapshot-based, scoped to `project.grids` ONLY (palette-type switches and all transient UI state are explicitly excluded — see §11). |
| Select/cut/copy/paste/clear | `clipboard.js`, wired in `app.js`/`grid-view.js` | Whole-grid select via clicking the grid label; rectangular via drag in 'select' tool mode. Rect-paste is a floating draggable overlay, committed on outside-click/Enter, cancelled on Escape. |
| Rotate/mirror | `transform.js` | Whole-grid only (disabled when a partial rect selection is active). Rotate's new-row-color is majority-vote over contributing old rows, ties broken by lowest palette index — see code comment in `transform.js` for the exact rule. |
| Autosave/restore | `persistence.js` | 300ms debounce on `trigger()`, immediate on `flush()` (called on `beforeunload` and after "New Project"). |
| PNG/C/BIN export | `codec/png.js`, `codec/c-export.js`, `codec/bin-export.js`, `codec/pattern.js` | All three reuse `encodePattern`/`encodeColorTable` from `pattern.js` — the single byte-layout source of truth, verified byte-for-byte against the reference `tinysprite.c` sample in `test/codec.test.js`. |
| TinySprite import/export | `codec/tinysprite.js` | `.tiny` ASCII format, `#Slot N` blocks, hex-digit pixel encoding. Export is per-grid's own pixels (no cross-grid OR compositing) — matches the reference sample's own semantics. |
| PNG import | `codec/png.js` (`decodePngColors`), `decompose-by-color.js` | Strict validation: exactly 16x16, every pixel either fully transparent or an exact palette color (no anti-aliasing tolerance). Decomposition is **one grid per distinct color** — NOT the grid-count-optimal OR-based algorithm originally scoped (see §13). |
| BASIC export | `codec/basic-export.js` | Generates a full MSX-BASIC program using `SPRITE$`/`COLOR SPRITE$`/`PUT SPRITE` statements. **Never validated against real/emulated hardware** (see §13 — known-likely-broken). |
| Cross-sprite hover highlight + coord readout | `app.js` (`hoverCell`/`setHoverCell`/`updateCoordDisplay`), `grid-view.js`, `preview-view.js` | Hovering a pixel in any grid highlights the same `(row,col)` in every other grid AND at its composited world position in the preview; the toolbar readout shows `Row, Col, Color` (that sprite's own) and `Composite` (the actual OR-composited color, which can differ). |
| OR-composition hints | `palette-view.js` (`findCompositions`) | For the selected palette color, lists every pair of *other* colors whose bitwise OR produces it, highlighting pairs that reuse an already-painted color (`computeUsedColors()` in `app.js`). |
| Regular/Screen8 palette toggle | `palette.js`, `app.js` (`setActivePaletteType`) | Swaps every rendered/exported hue for existing color indices; does not alter sprite data. Persisted per-project. |

---

## 9. Persistence / External Data

**Only mechanism: `localStorage`, key `'mode2-sprites/project'`.**

```jsonc
// serializeProject() output shape:
{
  "paletteType": "regular" | "screen8",
  "grids": [
    { "opacity": [256 ints 0/1], "rowColors": [16 ints 0-15], "orMode": bool, "x": int, "y": int }
  ]
}
```
- No schema version field. `deserializeProject()` returns `null` (full
  reset to defaults) if `data.grids` is missing/not an array/empty;
  otherwise it coerces per-field (`Uint8Array.from`, `!!`, `| 0`) rather
  than validating strictly — malformed-but-array-shaped data won't throw,
  it'll just produce garbage sprites. **No migration path exists** if the
  shape changes incompatibly in the future.
- `paletteType` defaults to `'regular'` if absent/invalid (old saves
  without the field still load fine — this field was added after grids
  persistence already existed).
- **Hidden coupling — where autosave is actually triggered**: `autosave`
  (the `createAutosave()` instance) is NOT triggered by every mutation
  directly. It's triggered from exactly two call sites in `app.js`:
  (1) explicitly inside `setActivePaletteType()`, and (2) inside
  `updateHistoryButtons()` (`autosave.trigger()` at its last line) — a
  function named for syncing the Undo/Redo buttons' `disabled` state,
  which nearly every mutating `doX()` handler already calls afterward
  for that reason. In practice this means **almost every mutation ends
  up autosaved as a side effect of `updateHistoryButtons()`**, but a new
  mutation path that changes `project` state *without* calling
  `updateHistoryButtons()` (or `setActivePaletteType`) will silently
  never autosave. If you add a new mutating action, either route it
  through the existing `history.perform()`/`updateHistoryButtons()`
  pattern used everywhere else, or explicitly call `autosave.trigger()`.

**File import/export formats** (all implemented, no external services):
- **`.tiny`** (TinySprite ASCII) — parsed/serialized in `codec/tinysprite.js`. Format confirmed against `References/File_Formats/tinysprite_backup.tiny`.
- **PNG** — via `canvas.toBlob`/`createImageBitmap`/`getImageData`, no library.
- **`.c`**, **`.bin`** (×2), **`.bas`** — plain text/binary generation, no external format library.

No REST APIs, no IndexedDB, no cookies, no other browser storage used.

---

## 10. Important Functions and Modules

| Function | Location | Responsibility | Callers | Side effects |
|---|---|---|---|---|
| `compositeGrids(grids)` | `composite.js` | The OR-hardware rule: returns `{minX,minY,width,height,pixels}` flat buffer of final displayed colors | `preview-view.js`, `codec/png.js` (`compositeToCanvas`) | none (pure) |
| `groupGrids(grids)` | `composite.js` | Splits grids into OR-priority groups per the CC-bit chaining rule | `compositeGrids` only | none (pure) |
| `encodePattern(sprite)` / `encodeColorTable(sprite)` | `codec/pattern.js` | THE byte-layout source of truth (§11.1/§11.2 of FUNCTIONAL_SPEC.md) | `codec/c-export.js`, `codec/bin-export.js`, `codec/basic-export.js` | none (pure) — **changing this changes 3 export formats at once** |
| `paintPixel(sprite,row,col,colorIndex)` | `model.js` | Enforces the one-color-per-row hardware rule on write | `grid-view.js`, `decompose-by-color.js` | mutates `sprite.opacity`/`sprite.rowColors` in place |
| `createHistory(project, onRestore)` | `history.js` | Undo/redo stack (snapshot of `project.grids` only) | `app.js` (single instance, threaded through everywhere) | mutates `project.grids` on undo/redo |
| `decomposeByColor(colors)` | `decompose-by-color.js` | Import decomposition — one `Sprite` per distinct color | `app.js` (`doImportPng`, `doImportTiny`) | none (pure, returns new Sprites) |
| `setPaletteType(type)` | `palette.js` | Mutates `MSX2_PALETTE` in place | `app.js` only | **mutates the shared array every other module reads from** |
| `createGridView(sprite, state, onChange, opts)` | `grid-view.js` | One editable sprite grid's canvas + all its pointer/keyboard handling | `app.js` (`renderGrids`, once per grid, every full rebuild) | DOM creation, canvas drawing, calls `opts.onChange`/`onHover`/etc. |

---

## 11. Architectural Decisions and Constraints (preserve unless intentionally refactoring)

1. **No build step, no framework, no dependencies** — this is an explicit
   design decision recorded in `IMPLEMENTATION_PLAN.md` §0 ("keep the
   tool a single static page... a framework would also complicate the
   draggable-preview and canvas-based pixel editing, which are naturally
   imperative"). Do not introduce a bundler/framework without the user's
   explicit sign-off.
2. **Canvas per grid, not DOM-per-pixel** — same rationale (2048+ DOM
   nodes would be heavy and hard to hit-test). Preserve this for any new
   per-pixel rendering.
3. **`MSX2_PALETTE` mutated in place, never reassigned** (intentional,
   documented in `palette.js`'s own comments) — this is how the
   Regular/Screen8 switch propagates to every consuming module without
   each one re-fetching a fresh reference. Reassigning it (`export let`
   + reassignment) would break every existing `import { MSX2_PALETTE }`
   binding that isn't re-read per use.
4. **Undo/redo scope is deliberately narrow** — only `project.grids`.
   Palette-type switches and all transient UI state (selection, clipboard,
   hover, active grid) are intentionally excluded, matching how
   "New Project" already bypasses history. This is intentional design,
   not an oversight — confirmed consistent across every mutation site in
   `app.js`.
5. **`rotateCW`'s majority-vote tie-break (lowest palette index) and
   `pattern.js`'s CC-bit-only-set-on-painted-rows behavior** are both
   explicitly resolved implementation details for spec ambiguities —
   see the code comments in `transform.js` and `pattern.js` respectively
   for the reasoning. Don't "fix" these without re-reading
   `FUNCTIONAL_SPEC.md` §5.5/§11.2 first; they were deliberately chosen,
   not accidental.
6. **BASIC export's loader uses MSX-BASIC's native `SPRITE$`/
   `COLOR SPRITE$`/`PUT SPRITE` statements rather than raw VDP register
   pokes** — a deliberate choice (documented in `basic-export.js`'s
   header comment) to avoid needing to hand-compute VRAM table addresses,
   which the reference material left unspecified. This is intentional
   design that turned out to still be broken in practice (§13) — the
   *approach* was a reasoned choice, the *specific statement usage* is
   unverified.

---

## 12. Invariants and Dangerous Assumptions

- **`project.grids.length` is always between 1 and 8** (`MAX_GRIDS`).
  Every index-based lookup in `app.js` (`activeGridIndex`,
  `selectionState.gridIndex`, `pasteState.gridIndex`) is defensively
  reset to `-1`/`null` whenever a grid removal could invalidate it — see
  `onRemove` handler in `renderGrids()`. If you add a new piece of
  grid-index-tracking state, you must add the same defensive reset.
- **A `Sprite` row's `opacity` and `rowColors` must stay consistent**:
  `rowColors[row]` is only meaningful where `opacity` has at least one
  set bit in that row; an all-transparent row's `rowColors[row]` is
  either `0` or a stale leftover value — code that reads `rowColors`
  must always gate on `opacity`/`getPixel` first (every current call site
  does this correctly; preserve the pattern).
- **`GridView` instances are recreated, not diffed, on `renderGrids()`**
  — any per-`GridView` local state (`selectDragStart`, `paste`,
  `pasteDrag`) does NOT survive a full rebuild. `pasteState` is
  reconstructed from `app.js`'s own tracked state and passed back in via
  `opts.paste`, which is why that round-trip exists — don't assume a
  `GridView`'s internal closures persist across app-level mutations.
- **`history.js`'s `begin()`/`commit()` must be paired** around any
  gesture that should be one undo step; an unmatched `begin()` with no
  `commit()`/`cancel()` leaves `pending` set and silently drops the next
  `commit()`'s snapshot boundary. Every current call site pairs them
  correctly (see `pointerup`/`pointercancel` handlers in `grid-view.js`
  and `preview-view.js`).
- **`MSX2_PALETTE[0]` is always `null`** (transparent) — every renderer
  that indexes it for a possibly-0 color must guard (`c ? MSX2_PALETTE[c]
  : ...`); several call sites do this (`grid-view.js` line ~186,
  `preview-view.js` line ~67). A raw `MSX2_PALETTE[0]` access would
  produce `null` as a canvas fillStyle, which silently no-ops/throws
  depending on browser.
- **`palette.js`'s exported `paletteType` and `project.paletteType` are
  two separate variables that must be kept in sync manually.** Currently
  only `app.js` calls `setPaletteType()`, and it always does so alongside
  updating `project.paletteType` — but nothing enforces this pairing at
  the type/API level. A new caller of `setPaletteType()` that forgets to
  also update `project.paletteType` (or vice versa) will desync display
  colors from the persisted/undo-relevant project state.
- **OR-composition math (`palette-view.js`'s `findCompositions`,
  `composite.js`'s `compositeGrids`) operates on raw 1-15 integer color
  indices, independent of which palette (`regular`/`screen8`) is
  active.** This is correct — the hardware ORs index bits, not RGB values
  — but it means the composition-hint UI's pairs never change when you
  switch palette type, only their *rendered hue* does. Don't "fix" this
  to recompute per-palette; it would be wrong.
- **No DOM host existence checks at startup** — `app.js` does
  `document.getElementById(...)` for ~9 IDs with zero null-checks. Adding
  a new toolbar section requires updating both `index.html` (the host
  div) and `app.js` (the `getElementById` + population code) together, or
  startup throws.
- **The coordinate-readout placeholder string is duplicated as a literal
  in two files and only one of them is reachable at startup.**
  `index.html` line 12 hardcodes
  `Row –, Col –, Color –, Composite –` as `#coord-host`'s initial
  content; `app.js`'s `updateCoordDisplay()` has the identical string for
  its `!hoverCell` case — but `updateCoordDisplay()` is never called
  during startup (only from the hover callback chain), so
  **`index.html`'s copy is what's actually shown until the first hover
  event**, not a redundant fallback. If you change the readout's format,
  both copies must be updated together or the pre-hover and post-hover
  text will visibly mismatch.

---

## 13. Known Problems and Technical Debt

1. **BASIC export is likely broken on real/emulated MSX2 hardware** —
   documented in `IMPLEMENTATION_PLAN.md`'s own
   "Backlog — BASIC Export Doesn't Actually Run on a Real/Emulated MSX2"
   section. Two specific failures were previously observed testing real
   output against openMSX: (a) `LOAD"sprites.bas"` fails with
   `Direct statement in file` (needs `LOAD"sprites.bas",A` — plain-ASCII
   load, not tokenized-binary load), and (b) even bypassing that, pasting
   the code directly produced a black screen — root cause unconfirmed,
   several specific statements/args in `basic-export.js` are flagged as
   "unconfirmed against real hardware" in that same backlog section. Unit
   tests (`test/basic-export.test.js`) only check the generated byte
   content, not actual hardware behavior — this gap is **not covered by
   any automated test and cannot be**, it needs a real/emulated MSX2 run.
2. **Import decomposition (`decompose-by-color.js`) is not grid-count-
   optimal.** `USER_SPECIFICATIONS.md` originally asked for "the optimal
   combination of the least possible number of sprites... using OR"; the
   shipped implementation instead emits one grid per distinct color
   (always correct, pixel-exact, but not minimal). The optimal algorithm
   is fully scoped but deliberately deferred — see
   `IMPLEMENTATION_PLAN.md`'s "Backlog — Optimal Decomposition Algorithm"
   section for the complete design if picked up.
3. **8x8 sprite size is not implemented.** `USER_SPECIFICATIONS.md`
   mentions "8x8 or 16x16 pixels" as in scope, but `GRID_SIZE` is
   hardcoded to `16` in `model.js` and used as a literal constant
   throughout (`grid-view.js`, `composite.js`, `codec/*`). This is a
   silent scope reduction from the original brief, not documented
   anywhere as an explicit decision — flag to the user if 8x8 support is
   ever requested; it would touch nearly every module.
4. **Several `USER_REVIEW.md` UX requests are unimplemented**: right-click
   quick-erase, middle-click eyedropper, fill/line/box/circle paint tools,
   a "?" modal showing the full 15×15 OR reference table, per-pixel
   OR-contributor breakdown on preview hover (partially superseded — the
   composite *color* is now shown in the coordinate readout, but not a
   breakdown of *which grids* contributed it). None of these block any
   other feature; they're additive.
5. **`USER_REVIEW.md` says palette numbers should show in hex; the
   shipped implementation shows decimal.** This was a deliberate,
   explicit later instruction from the user in-session ("show pointed
   color in decimal") that superseded the earlier `USER_REVIEW.md` note.
   Not a bug — flagged here only so a future agent doesn't "fix" it back
   to hex based on `USER_REVIEW.md` alone.
6. **No automated tests exist for**: `app.js` (all wiring/state
   management), `grid-view.js`, `palette-view.js`, `preview-view.js`,
   the Screen8 palette table/`setPaletteType` (`palette.js`), the
   `paletteType` persistence round-trip (`persistence.test.js` predates
   this field and doesn't assert on it), the hover/cross-sprite-highlight
   feature, or the OR-composition-hint highlighting. All of this was
   manually verified in a live browser (once, via an ad hoc
   Playwright script not committed to the repo) rather than via checked-
   in tests. See §15.
7. **`app.js` is a single 645-line file** handling all UI wiring. Not
   deeply coupled (mostly independent `doX()` functions + a shared
   `redraw()`/`renderGrids()` pair), but large — a future refactor
   splitting it by feature area (toolbar/import/export/history) is
   reasonable but not currently blocking anything.
8. No linting/formatting configured — style consistency is manual/
   convention-only.
9. **`.row-swatch` CSS is split across two separate rule blocks in
   `src/style.css`**: a shared block at ~line 114
   (`.palette-swatch, .composition-swatch, .row-swatch { display:flex; ... }`,
   sizing-agnostic properties: centering, font weight, text-shadow) and a
   second `.row-swatch`-only block at ~line 314 (`width`, `border`,
   `cursor`, `font-size`). Editing only one of the two blocks will produce
   a partial style change — check both before assuming a `.row-swatch`
   style edit is complete.

---

## 14. Unfinished Work

| Item | State | Files | What remains |
|---|---|---|---|
| Optimal decomposition algorithm | Fully designed, not started | Would replace `decompose-by-color.js` | Full per-row constraint-search algorithm design already written out in `IMPLEMENTATION_PLAN.md` Backlog section — implement `decompose.js` as a drop-in replacement, same call signature as `decomposeByColor`. |
| BASIC export hardware validation | Generates plausible-looking BASIC, unverified | `codec/basic-export.js` | Needs an actual openMSX (or real hardware) run, iterating line-by-line against real output. Two specific failure modes already identified (§13.1) — start there. |
| Fill/line/box/circle paint tools | Not started - pending USER_REVIEW.md backlog implementation | Would extend `grid-view.js`'s paint handling | each is a bitmap-generation helper feeding the existing `paintPixel` primitive — no new data-model work needed per `IMPLEMENTATION_PLAN.md` Phase 1 backlog notes. |
| Right-click quick-erase / middle-click eyedropper | done | `grid-view.js` | Quick-erase via contextmenu + middle-click eyedropper. See src/grid-view.js lines 260-267 for gesture routing. |
| "?" OR reference modal | Not started - pending USER_REVIEW.md backlog implementation | Would extend `palette-view.js` | Static precomputed 15×15 `a|b` table, same logic as `findCompositions` generalized over all targets at once. |
| Per-pixel OR-contributor breakdown on hover | Partially done (composite color shown) - pending further implementation | `preview-view.js`, `composite.js` | Would need `compositeGrids` to optionally return per-pixel contributor grid indices, not just the final color. |
| Manage sprite order (drag/drop reordering) | Not started - documented gap in backlog | `grid-view.js`, `app.js` | Must allow users to drag/drop sprite grids to change rendering order; affects OR-compositing priority and anchor-color requirements (tracked in HANDOFF.md §14 item #1 from USER_REVIEW requests) |
| Remove non-first sprite (remove sprite N when N>0) | Not started - documented gap, but model layer requires update only | `app.js` | Only sprite-0 permanent; sprites 1+ deletable if more than one grid exists. Current `removeGrid()` function needs index-0 protection added per this backlog requirement |
| Reverse sprite order in preview display | Not started - documented gap | `preview-view.js`, `composite.js` | Visual display shows sprite-0 on top while preserving underlying render order (0 highest priority); requires canvas redraw ordering update |
| Anchor color support per MSX2 VIDREG rules | Not started - documented known hardware limitation | `composite.js` | Track per-pixel "anchor" requirement: when pixel is OR-composed, higher-priority sprite needs non-OR'd pixel to pass composite to lower sprites. Current implementation assumes simple OR; must track anchor pixels per VIDREG spec |

---

## 15. Testing and Validation

```bash
npm test     # node --test test/*.test.js — 69 tests, all passing, ~150ms
```

**Coverage** (pure-logic modules only, by design — see
`IMPLEMENTATION_PLAN.md` §0's testing strategy):
`composite.test.js`, `history.test.js`, `clipboard.test.js`,
`transform.test.js`, `persistence.test.js`, `codec.test.js` (byte-for-byte
against the real `tinysprite.c` reference sample — the single most
valuable test in the repo per its own header comment),
`decompose-by-color.test.js`, `png.test.js`, `tinysprite.test.js`,
`tinysprite-export.test.js`, `basic-export.test.js` (byte content only,
not hardware behavior).

**NOT covered by any automated test** (see §13.6 for the full list):
all DOM/canvas UI code (`app.js`, `grid-view.js`, `palette-view.js`,
`preview-view.js`), the Screen8 palette feature, paletteType persistence,
hover/highlight features, OR-composition-hint highlighting.

**Manual browser validation procedure** (no committed script exists for
this — do it fresh each time):
1. Serve statically (`python3 -m http.server`) and open `index.html`.
2. Paint on grid 0, add a second grid, paint overlapping pixels, toggle
   OR mode on grid 2 — confirm the preview panel shows the bitwise-OR'd
   color where they overlap.
3. Hover a pixel — confirm the toolbar readout shows
   `Row R, Col C, Color <this sprite's>, Composite <actual OR result>`
   and the same cell highlights green in every other grid + the preview.
4. Click the Screen8 toggle — confirm every swatch, row-color label,
   painted pixel, and the preview all re-color in one pass.
5. Check browser devtools console for errors (should be zero — this
   project has no `console.log`/`console.warn`/`console.error` calls of
   its own anywhere in `src/`, confirmed via grep, so anything appearing
   there is either a real error or from the browser itself).

---

## 16. Debugging Guide

- **No logging exists in the app itself** (`grep -rn "console\." src/`
  returns nothing) — if you need visibility, you're adding
  `console.log` yourself; there's no existing convention to follow beyond
  "keep it out of the final diff."
- **Canvas coordinate bugs** are the most likely fragile spot — check
  `cellFromEvent()` in `grid-view.js` (uses
  `canvas.getBoundingClientRect()` + `CELL` constant) and
  `worldToCanvas`/`canvasToWorld` in `preview-view.js` (uses `SCALE` +
  `PADDING_CELLS`). If you change `CELL` (20) or `SCALE` (6) or
  `PADDING_CELLS` (8), re-verify hit-testing and drag math, not just
  visuals.
- **Palette-looks-wrong bugs**: check whether `MSX2_PALETTE` was ever
  reassigned instead of mutated in place somewhere (it shouldn't be —
  see §11.3/§12). Also check `project.paletteType` vs. `palette.js`'s
  own `paletteType` binding are in sync (§12).
- **Undo/redo desync**: check for a `history.begin()` without a matching
  `commit()`/`cancel()`, or a direct `project.grids` mutation that
  bypassed `history.perform()`/`begin()`/`commit()` entirely.
- **Export byte content is wrong**: `encodePattern`/`encodeColorTable` in
  `codec/pattern.js` are the single source of truth for C/BIN/BASIC — a
  bug there affects all three. Run `test/codec.test.js` first; it's the
  byte-for-byte ground-truth check against a real TinySprite sample.
- **Import silently drops/rejects data**: `decodePngColors` (PNG) and
  `parseTinySprite` (.tiny) both throw `Error` with a specific message on
  any violation — those messages surface via `showImportMessage()` in
  `app.js` as a dismissible banner (`#import-message-host`), not a
  console log or `alert()`. Check that banner, not devtools, for
  user-facing import failures.

---

## 17. Safe Modification Guidelines

- Before touching `palette.js`: re-read §7/§11.3/§12 above. Never
  reassign `MSX2_PALETTE`; only mutate its contents.
- Before adding a new `Project`/`Sprite` field: update `createProject`/
  `createSprite` (`model.js`), `cloneSprite` (`model.js`, for undo),
  `serializeProject`/`deserializeProject` (`persistence.js`, for
  autosave) — all three, together, or the field will be silently dropped
  somewhere.
- Before changing pattern/color-table byte layout: read
  `FUNCTIONAL_SPEC.md` §11 first, then run `test/codec.test.js` after —
  it's the ground-truth check against real reference data.
- Before adding a new mutating user action: decide whether it should be
  undoable. If yes, wrap the mutation in `history.perform(fn)` or
  `history.begin()`/mutate/`history.commit()` (matching the existing
  pattern in every `doX()` function in `app.js`).
- Before changing `index.html`'s host `<div>` IDs: update the matching
  `document.getElementById` calls in `app.js` in the same change —
  there's no error handling for a missing host.
- After any `src/` change: run `npm test` (69 tests). There is no CI —
  this is the only automated gate that exists.
- For any UI/interaction change: there is no automated browser test
  suite. Manually verify in a real browser per §15's procedure before
  considering the change done.
- Don't edit `USER_SPECIFICATIONS.md` — it explicitly says (in the file
  itself) it's user-owned and not to be modified by an agent.

---

## 18. Recommended Next Tasks

Based only on existing backlog items, documented gaps, and known issues
found in the repo (no new features invented):

- Validate `codec/basic-export.js`'s output against a real/emulated MSX2
  (openMSX or hardware) and fix the two specific failure modes already
  identified in `IMPLEMENTATION_PLAN.md`'s BASIC-export backlog section
  (§13.1 above). This needs a human/emulator session, not just code
  reading.
- Implement the optimal minimum-grid-count decomposition algorithm
  (`IMPLEMENTATION_PLAN.md`'s "Backlog — Optimal Decomposition
  Algorithm") as a drop-in replacement for `decompose-by-color.js`.
- Add automated test coverage for the Screen8 palette (`palette.js`) and
  its persistence round-trip — currently the only shipped feature with
  zero automated verification.
- Implement the remaining `USER_REVIEW.md` interaction requests: right-
  click erase, middle-click eyedropper, fill/line/box/circle tools, "?"
  OR reference modal.
- Reconcile the 8x8-sprite-size gap: either implement it, or explicitly
  confirm with the project owner that 16x16-only is the intended final
  scope (don't edit `USER_SPECIFICATIONS.md` yourself either way — flag
  it, or update `FUNCTIONAL_SPEC.md`/`IMPLEMENTATION_PLAN.md` instead if
  that's authorized).

No explicit dependency ordering between these except: the optimal-
decomposition and BASIC-hardware-validation tasks are each independently
scoped and can be done in either order.

---

## 19. Quick Context for a New Coding Agent

1. Read `FUNCTIONAL_SPEC.md` first if you need the *hardware rules*
   (OR-compositing, byte layouts) — it's the technical source of truth,
   more detailed than this file for the domain logic.
2. Read `src/app.js` next — it's the composition root; everything else
   is a module it imports and wires together.
3. Architecture: vanilla JS ES modules, no framework, no build step,
   canvas-per-grid rendering, manual "mutate then redraw" pattern — no
   virtual DOM, no reactive state library.
4. Central state: `project = { grids: Sprite[], paletteType }`, owned by
   `app.js`, the only undo-tracked/persisted state. Everything else in
   `app.js` (selection, clipboard, hover, active grid, current tool/color)
   is transient and NOT persisted or undoable.
5. **`MSX2_PALETTE` (in `palette.js`) is a mutable singleton array, never
   reassigned — only its contents change.** This is the mechanism behind
   the Regular/Screen8 palette switch. Don't break this invariant.
6. **A sprite row has exactly one color at a time** — painting a pixel
   with a real color overwrites the entire row's color unconditionally.
   This is the core hardware constraint the tool exists to enforce; every
   mutation path (`paintPixel`, `recolorRow`, rotate/mirror, paste)
   already respects it — preserve that when adding new mutation paths.
7. Undo/redo (`history.js`) snapshots `project.grids` only — palette-type
   switches and all UI-transient state are intentionally excluded.
7b. **Autosave is triggered as a side effect of `updateHistoryButtons()`**
    (its last line is `autosave.trigger()`), not from every mutation
    directly. A new mutating action that doesn't call
    `updateHistoryButtons()` (or explicitly `autosave.trigger()`, as
    `setActivePaletteType()` does) will silently never persist — see §9.
8. The OR-hardware compositing rule lives in `composite.js`
   (`compositeGrids`/`groupGrids`) and is reused by both the live preview
   and PNG composite export — it's the single most important algorithm
   in the codebase and is unit-tested.
9. `codec/pattern.js`'s `encodePattern`/`encodeColorTable` are the single
   byte-layout source of truth reused by C/BIN/BASIC export — change it
   once, it changes three formats.
10. **BASIC export (`codec/basic-export.js`) is known-likely-broken on
    real/emulated hardware** — never claim it "works" without an actual
    emulator/hardware run; see §13.1.
11. Import decomposition (`decompose-by-color.js`) is intentionally
    non-optimal (one grid per color) — this is documented, not a bug to
    silently "fix" without picking up the full optimal-algorithm backlog
    task.
12. No linting/formatting/build tooling exists — don't assume any.
13. Run `npm test` (69 tests, `node:test`, no browser) after any `src/`
    change — it's the only automated gate.
14. No automated UI/browser tests exist — verify interaction changes
    manually in a real browser (§15's procedure).
15. `USER_SPECIFICATIONS.md` is user-owned — never edit it.
16. `USER_REVIEW.md` lists several still-unimplemented interaction
    requests (fill/line/box/circle tools, right-click erase, middle-click
    eyedropper, "?" OR modal) — these are legitimate open backlog items,
    not something already done.
17. Zero `TODO`/`FIXME`/`HACK` comments exist anywhere in `src/`/`test/`
    (verified via grep) — all known gaps are instead documented in prose
    in `IMPLEMENTATION_PLAN.md`'s two "Backlog" sections and in
    `USER_REVIEW.md`; read those documents rather than searching for code
    comments.
18. This repo is git-initialized with exactly one commit (`e3bab00` on
    `master`) — no branches, no remote, no CI configured.
