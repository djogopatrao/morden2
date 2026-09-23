# Functional Specification — MSX2 Mode 2 Multi-Color Sprite Editor

Derived from `USER_SPECIFICATIONS.md`. This document translates the raw
requirements into a concrete functional spec: data model, UI behavior,
and feature contracts. It is the basis for the stepped implementation
plan that follows.

---

## 1. Purpose

A browser-based (HTML/JS) editor for MSX2 Mode 2 (Graphic 3 / Screen 5-ish
"sprite mode 2") sprites, with first-class support for designing and
previewing the **OR-color** effect between overlapping sprites — a
capability missing from existing tools (e.g. TinySprite).

---

## 2. Domain Model (MSX2 Mode 2 Sprites)

### 2.1 Sprite geometry
- Size: **16x16 pixels only** (v1 scope, per project decision). 8x8
  support is out of scope unless requested later.
- Stored in VRAM as a **bitmap**: 1 byte per 8-pixel-wide row.
  - 16x16 sprites are 4 such bitplane-like patterns (top-left, top-right,
    bottom-left, bottom-right 8x8 quadrants) per MSX hardware layout, OR
    modeled internally as a 16x16 boolean grid and serialized to hardware
    layout at export time. **Internal editor model should be a simple
    16x16 (or 8x8) boolean opacity grid + a per-row color, independent of
    the hardware quadrant byte order; hardware layout is an export-time
    concern.**
- Each pixel is binary: `0` = transparent, `1` = opaque (uses the row's
  color). There is no per-pixel color — color is **per row (line)**.

### 2.2 Color model
- Fixed MSX2 sprite palette: **15 colors + transparency** (transparency is
  not a "color" selectable for painting, it's the eraser / "0" bit).
- A sprite is:
  - **Monocolored**: every row uses the same color (still stored/edited as
    per-row color for uniformity, just happens to be identical).
  - **Multi-colored**: each of the sprite's rows (8 or 16 rows) has its
    own independently chosen color from the 15-color palette.
- Palette colors are **fixed** — not user-configurable (matches real
  hardware; the editor should embed the standard MSX2 sprite palette
  RGB values).

### 2.3 OR-color compositing

Confirmed against the MSX2 Technical Handbook (Ch.4 §5.3, "sprite colour
table", Figure 4.67/4.68) and cross-checked byte-for-byte against the
sample `tinysprite.bas`/`tinysprite.c` (see §11):

- Each sprite plane's **color table** has one byte per line (16 bytes for
  a 16-line sprite): `EC(bit7) | CC(bit6) | IC(bit5) | 0(bit4) | color(bits3-0)`.
  - `color` (0–15): 0 = transparent/backdrop for that line's opaque
    pixels (in practice never painted — see §2.2), 1–15 = palette index.
  - `CC` = the OR-color flag, **settable per line** on real hardware.
  - `IC` = suppresses conflict-detection for that line (not user-facing
    in v1; always 0).
  - `EC` = shifts that line 32 dots left (not user-facing in v1; always
    0).
- Grid **left-to-right order in the UI = sprite plane priority order**
  (plane 0 = highest priority = leftmost grid). This ordering is not
  cosmetic — it determines OR grouping (below) and normal-priority
  stacking.
- **Real hardware OR rule** (this is more specific than "any two
  OR-flagged sprites combine"): a line with `CC=1` does **not** have its
  own display priority. It shares the priority of, and — wherever both
  have opaque pixels at the same coordinate — bitwise-ORs its color
  with, **the nearest preceding sprite plane (lower index) whose
  corresponding line has `CC=0`**. A run of several consecutive `CC=1`
  planes all glue onto that same preceding `CC=0` plane and OR-combine
  with each other too. A `CC=1` plane with no preceding `CC=0` plane (or
  where an intervening plane breaks a chain the user intended) does not
  OR the way the user expects — this is a real hardware footgun.
- **v1 simplification**: the per-grid "OR-mode" toggle (§3) sets `CC=1`
  on **all 16 lines** of that grid (not per-line — matches the user
  spec's "a sprite can be configured to use or-color"). The preview and
  every export must still implement the exact **nearest-preceding-CC=0**
  grouping rule above using the current grid order, not a naive
  "OR all OR-flagged grids together regardless of order" shortcut —
  otherwise the tool would misrepresent what the real hardware renders,
  defeating its whole purpose.
- Non-OR (`CC=0`) sprites overlapping other sprites: normal priority
  stacking (topmost/lowest-index opaque pixel wins).
- OR effect is sprite-vs-sprite only; it never interacts with the
  background (screen/text layer).
- The editor's **preview** must emulate this exactly: composite all
  grids according to plane order, CC flags, and relative (draggable)
  position, and render the resulting combined image.
- **Why 8 grids max**: this is not arbitrary — MSX2 sprite mode 2 can
  display at most **8 sprites on any one horizontal scanline**. Capping
  the project at 8 grids guarantees every project the user builds is
  physically renderable simultaneously on one line, matching the tool's
  purpose of testing real OR combinations. (Hardware allows up to 32
  sprite planes total across a screen, just not more than 8 per line —
  out of scope since this tool is about one composite sprite group, not
  a full screen layout.)

---

## 3. Project / Document Model

A "project" (single in-browser working document) consists of:
- An ordered list of **1 to 8 sprite grids** ("slots"). Any grid,
  including grid 1, can be removed as long as at least one grid
  remains — a project can never be emptied to zero grids. (Originally
  grid 1 was pinned/unremovable; relaxed per user request.)
- Each grid holds:
  - Size: 16x16 (fixed, v1).
  - Per-row color assignments.
  - Pixel opacity bitmap.
  - OR-mode flag (on/off).
  - Position offset (X/Y), user-draggable in the composite preview —
    needed since OR-color depends on spatial overlap.
- Undo/redo history (global, across all grids, single linear stack).
- Clipboard state (for cut/copy/paste), which can hold either:
  - A whole-grid snapshot, or
  - A rectangular pixel-region snapshot (opacity + color-per-row subset
    is ambiguous since color is per full row — see §5.4 note).

---

## 4. UI Layout

```
┌───────────────────────────────────────────────────────────┐
│ [15-color palette + transparency swatch]  │  Sprite Preview │
│ [Undo][Redo][Cut][Copy][Rotate][Mirror][Clear][Export][Import] │
├───────────────────────────────────────────────────────────┤
│ ┌─────────────┐c ┌─────────────┐c        ...       [+]     │
│ │             │c │             │c                          │
│ │  Grid 1     │c │  Grid 2     │c   (up to 8 grids total)   │
│ │  16x16      │c │  16x16      │c                          │
│ │             │c │             │c                          │
│ └─────────────┘c └─────────────┘c                          │
└───────────────────────────────────────────────────────────┘
```

- **Palette panel**: 15 color swatches + 1 transparency swatch. Clicking
  selects the "current paint color."
- **Sprite preview panel**: live render of the OR-composited result of
  all currently visible/enabled grids, updated on every edit. Each
  sprite renders as a **draggable thumbnail** within this panel so the
  user can position sprites relative to each other to control overlap
  (and thus which pixels trigger the OR effect). Default position for a
  newly added grid: origin (0,0), i.e. fully overlapping the first
  sprite.
- **Toolbar**: Undo, Redo, Cut, Copy, Rotate, Mirror, Clear, Export,
  Import. Operates on the current selection (whole grid or rectangular
  region — see §5).
- **Grid editing area**: one panel per sprite, each with:
  - The pixel grid itself (8x8 or 16x16 cells).
  - A per-row color strip labeled "c" to the right of each row.
  - A "+" control after the last grid to add a new one (hidden/disabled
    at 8 grids).
  - Per-grid controls to remove it (except grid 1) and toggle its
    OR-mode flag.

---

## 5. Interaction Behavior

### 5.1 Painting
- Select a palette color (or transparency) → left-click a pixel cell in
  a grid → sets that pixel's opacity bit; if painting with a color (not
  transparency), and the row currently has a *different* color assigned,
  the **entire row's color is replaced** by the new color (rows are
  single-color; a row can't have two colors at once).
  - i.e., painting pixel (r, c) with color X: set bit (r,c)=1, and set
    row r's color = X, unconditionally overwriting the row's previous
    color.
- Painting with transparency clears bit (r,c)=0 and does not touch the
  row color.
- Click on a row's "c" swatch with a color selected → recolors **all
  opaque pixels in that row** (sets row color = selected color) without
  changing which pixels are opaque.

### 5.2 Grid management
- "+" adds a new grid immediately to the right of the last one, default
  empty, same default size as existing grids, max 8 total.
- Any grid can be removed via a per-grid control (e.g. an "×" on the
  grid header), as long as more than one grid currently exists — the
  last remaining grid can't be removed.
- Removing a grid shifts subsequent grids left; does not renumber
  saved/exported sprite indices ambiguously — export order = current
  left-to-right grid order.

### 5.3 Selection
- Two selection modes:
  1. **Whole-grid select**: click a grid's header/background (or a
     dedicated "select all" affordance) to select the entire sprite.
  2. **Rectangular region select**: click-drag within a grid to select a
     sub-rectangle of cells.
- Selection is scoped to a single grid at a time (no cross-grid multi-
  select for cut/copy in v1).

### 5.4 Cut / Copy / Paste
- Cut/Copy operate on the current selection (whole grid or rectangle),
  capturing opacity bits **and** the color(s) of the affected rows.
  - Caveat: since color is per-row, copying a partial-width rectangle
    still carries full row color info for the rows it spans; pasting
    into a target whose rows already have different colors will (per
    §5.1 semantics) overwrite target row colors with source row colors
    for any row where the pasted region contains at least one opaque
    pixel.
- Paste:
  - Whole-grid clipboard → pastes directly into a chosen target grid
    (replacing its contents), no drag needed, or optionally also
    draggable (implementation choice — default: immediate replace, no
    drag, since there's only one placement that makes sense for a full
    grid overwrite... unless pasted into a grid of different size, then
    positioning is needed. See open question).
  - Rectangular-region clipboard → enters a **"floating paste" mode**:
    the copied pixels render as a draggable overlay on top of the target
    grid; user drags to desired position; a confirm action (e.g. click
    outside, Enter, or a dedicated "commit" button) finalizes the paste
    into the grid at that position; **Escape** or a "cancel" action
    aborts without modifying the grid.
- Clear: sets all pixels in the selection to transparent (row colors
  left as-is, or reset — implementation choice, default: leave row
  colors unchanged since transparent rows have no visible color anyway).

### 5.5 Rotate / Mirror
- Applies to the current selection (whole grid, since rotate/mirror of
  an arbitrary rectangle mid-grid is ambiguous for non-square regions —
  default: these two tools operate on whole grids only, disabled when a
  partial rectangle is selected).
- Rotate: 90° CW step per click, repeatable (so 180°/270° = multiple
  clicks). Pixel bitmap rotates; since color is per-row and rotation
  mixes columns into rows, **each newly-formed row's color is
  auto-assigned to the color of whichever original column contributed
  the most opaque pixels to it** (majority vote; ties broken by lowest
  palette index or by original row/column order — implementation
  detail).
- Mirror: horizontal flip (left-right) — row membership unaffected, so
  row colors are preserved directly; vertical flip (top-bottom) swaps
  row order and thus row colors move with their row.

### 5.6 Undo / Redo
- Standard linear undo/redo stack covering all editing operations
  (paint, recolor, grid add/remove, cut/paste, rotate, mirror, clear,
  import). Import/export of files is undoable at the "load" boundary
  (i.e. undo after import reverts to the pre-import state).

---

## 6. Import

### 6.1 TinySprite backup format (`.tiny`, confirmed from sample)

Plain text. Structure, from `References/File_Formats/tinysprite_backup.tiny`:

```
!type
msx2
#Slot 0
2...............
22..............
.22.............
...             (16 lines total, one per pixel row)
#Slot 1
...
```

- Header: literal `!type` line, then a value line (`msx2`; other values
  such as an MSX1 variant are presumably possible and out of scope —
  reject/error if not `msx2`).
- Then one or more `#Slot N` blocks, each followed by exactly **16
  lines** of **16 characters**. Each character encodes one pixel:
  - `.` = transparent.
  - `1`–`9`, `A`–`F` = palette color index 1–15 (inferred convention —
    `0` never appears since transparent already uses `.`; **flagged as
    an assumption to confirm** if a `0` digit or other symbol ever
    shows up in a real file).
- **Important**: unlike our grid model, a TinySprite slot's rows are
  **not** constrained to one color per line — the sample's row 12
  (`.........6699...`) has two different colors in the same line. This
  is because TinySprite's `.tiny` format stores an authored *preview
  image* per slot, not real per-hardware-sprite data; TinySprite itself
  only decomposes it into real one-color-per-line (+OR) hardware
  sprites at BASIC/C export time — which is exactly the step this tool
  needs to expose and let the user control directly (see §1 rationale).

**Import behavior**: parse all `#Slot` blocks in order. For each slot's
16x16 target image, run the same **decomposition algorithm** as PNG
import (§6.2) to produce 1+ grids reproducing that slot's image
exactly. Append the resulting grids, in order, to the project's grid
list. Stop once **8 grids total** have been filled; if a slot's
decomposition would only partially fit in the remaining budget, skip
that whole slot (do not add a partial/incomplete sprite) and warn the
user that the import was truncated.

### 6.2 PNG import

Strictly validated: must be exactly 16x16 pixels, using only colors
from the fixed MSX2 palette (15 colors) plus one fully-transparent
color, no anti-aliasing/other colors allowed (reject with a clear error
otherwise). Uses the same decomposition algorithm as §6.1.

### 6.3 Decomposition algorithm (shared by TinySprite and PNG import)

- Goal: given a target 16x16 image where each pixel has a color index
  in {transparent, 1..15}, find the smallest set of sprites S1..Sn
  (n ≤ 8, or ≤ remaining grid budget), each with per-row single color +
  opacity bitmap, plus a CC(OR)-flag-per-plane assignment, such that
  compositing them **using the real nearest-preceding-CC=0 hardware
  rule** (§2.3) reproduces the target exactly.
- Because OR-index arithmetic only helps when `colorA | colorB == target`
  for palette indices, the search is combinatorial; "optimal" (minimum
  sprite count) implies some form of exact or branch-and-bound search
  over row-color assignments per candidate sprite — a nontrivial
  algorithmic component to design in the implementation plan, likely
  factored into 16 independent per-row subproblems (OR composition is
  row-local — a row's final per-pixel color depends only on that row's
  contributing sprites) merged into a globally consistent minimal
  sprite count and plane ordering.

---

## 7. Export

All formats below share two per-grid byte blocks, derived directly from
the MSX2 VDP hardware layout (§11) and confirmed against the sample
files:

- **Pattern bytes** (32 bytes/grid): the grid's 16x16 opacity bitmap in
  hardware quadrant order — top-left(8) → bottom-left(8) → top-right(8)
  → bottom-right(8), 1 bit/pixel, MSB = leftmost pixel of the byte's
  8-pixel span, `1` = opaque.
- **Color/attribute bytes** (16 bytes/grid): one byte per pixel row =
  `EC(0) | CC(grid's OR flag) | IC(0) | 0 | color(0-15)` per §2.3. `CC`
  is set (bit6=1) on all 16 bytes if the grid's OR-mode toggle is on,
  else 0.

Export order = current left-to-right grid order = plane priority order
(§2.3) — this order is semantically required for OR grouping to
reproduce what the preview shows, not just a display convenience.

| Format | Contents |
|---|---|
| **TinySprite backup** (primary) | Same `.tiny` text format as import (§6.1): `!type`/`msx2` header, one `#Slot N` block per grid, each the grid's rendered 16x16 image (post-OR-composite is **not** written here — each slot stores that individual grid's own per-pixel colors, matching TinySprite's own per-slot semantics). |
| **PNG** | One PNG per grid (that sprite alone against transparency) **plus** one additional PNG of the full OR-composite preview. |
| **BASIC (MSX-BASIC) code** | `DATA` statements for pattern bytes and color/attribute bytes per grid (format confirmed from `References/File_Formats/tinysprite.bas`, see §11.3), plus a loader/display program that sets up the pattern generator table, sprite color table, and sprite attribute table (Y/X/pattern number) via `VDP`/`VPOKE`/`BASE` and places the grids at their preview-panel relative offsets, demonstrating the OR effect. (No existing reference implementation for the loader — the sample's loader section is an explicit stub, "REM -- MSX2 LOADER NOT YET IMPLEMENTED" — this tool must design it from the handbook's register spec, §11.) |
| **BIN** | Two raw binary files: (1) concatenated 32-byte pattern blocks, one per grid, in grid order; (2) concatenated 16-byte color/attribute blocks, one per grid, in grid order. Ready to be POKEd/loaded directly into VRAM at the pattern generator table and sprite color table addresses respectively. |
| **C** | A `.c` text file with `sprite_patterns[]` (concatenated 32-byte pattern blocks) and `sprite_attributes[]` (concatenated 16-byte color/attribute blocks) arrays, formatted as standard C array initializers (format confirmed from `References/File_Formats/tinysprite.c`, see §11.3). |

---

## 8. Non-Functional Requirements

- Pure client-side web app: modern HTML/CSS/JS, runs from a static
  file (no server dependency for core editing).
- Libraries: TBD during implementation planning (e.g. a canvas or SVG
  rendering approach for pixel grids, a small PNG encode/decode lib if
  the browser's native canvas APIs aren't sufficient for palette-exact
  PNG I/O).
- **Autosave**: the current project (all grids, colors, OR flags,
  preview positions, clipboard is not required to survive) is
  automatically persisted to browser `localStorage` on every change (or
  debounced), and restored on page load. Explicit export remains the
  only way to produce shareable/portable files; autosave is a
  convenience against accidental tab close/refresh, not a substitute
  for export.

---

## 9. Resolved Decisions (v1)

1. **Sprite size**: 16x16 only. 8x8 out of scope for v1.
2. **Whole-grid paste size mismatch**: moot — all grids are 16x16, no
   size mismatch can occur.
3. **Rotate semantics for multi-color sprites**: auto-assign each
   newly-formed row's color by majority vote of contributing original
   columns' colors (see §5.5).
4. **OR preview spatial arrangement**: sprites are draggable thumbnails
   directly within the composite preview panel; default position is
   full overlap at origin (0,0).
5. **Persistence**: add `localStorage` autosave of the full project,
   restored on load, in addition to explicit export/import.

## 10. Reference Files Consulted

- `References/File_Formats/tinysprite_backup.tiny` — sample `.tiny`
  import format (one slot, one sprite + one OR companion sprite).
- `References/File_Formats/tinysprite.bas` — template for BASIC export
  (`DATA` statement layout per slot: mask0/attr0, mask1/attr1).
- `References/File_Formats/tinysprite.c` — template for C export
  (`patterns[]`/`attributes[]` array layout, matches the `.bas` bytes
  exactly, cross-checked bit-for-bit in §11).
- `References/CHAPTER 4 - VDP AND DISPLAY SCREEN...MSX2-Technical-Handbook.html`
  — authoritative VDP register and table layout (§5.3 "Sprite mode 2":
  pattern generator table, sprite attribute table, sprite color table,
  CC/EC/IC bits, Figures 4.60/4.66/4.67/4.68).
- `https://github.com/pvmm/spritetools.py` (linked, not fetched) — not
  yet consulted; may be worth a look during implementation for a
  second reference on MSX sprite tooling conventions, not required to
  unblock this spec.

## 11. Confirmed Hardware Byte Layouts

### 11.1 Pattern generator table (per grid, 32 bytes)
Four consecutive 8-byte 8x8 patterns, one bit per pixel (MSB = leftmost
pixel of that byte's 8-pixel span), `1` = opaque:
1. Bytes 0–7: top-left quadrant (rows 0–7, cols 0–7)
2. Bytes 8–15: bottom-left quadrant (rows 8–15, cols 0–7)
3. Bytes 16–23: top-right quadrant (rows 0–7, cols 8–15)
4. Bytes 24–31: bottom-right quadrant (rows 8–15, cols 8–15)

Verified by decoding `tinysprite.bas`'s `mask 0` DATA bytes against the
`.tiny` sample's ASCII art pixel-for-pixel (e.g. byte `0x01` at offset 8
= bottom-left quadrant row 0 = overall row 8, which the ASCII art shows
with an opaque pixel exactly at column 7).

### 11.2 Sprite color table (per grid, 16 bytes, one per pixel row)
```
bit:    7    6    5    4    3 2 1 0
       EC    CC   IC   0    color code (0-15)
```
- `color code`: palette index for that line's opaque pixels (0 acts as
  transparent/backdrop; never used since transparent pixels are
  encoded via the pattern bit being 0, not via color 0 — but the field
  physically allows 0-15).
- `CC` (bit 6): OR-color flag for that line (§2.3). Verified: sample
  byte `0x46` = `0100 0110` → CC=1, color=6, matching the `.tiny`
  sample's row where colors `6` and `9` co-occur in one visual row (the
  base sprite's row is color 9, the OR-companion sprite's same row is
  color 6 with CC=1).
- `IC` (bit 5), `EC` (bit 7): not user-facing in v1, always written 0.
- The color table's VRAM address is fixed at **512 bytes before** the
  sprite attribute table's start address (hardware-automatic, not
  independently configurable) — relevant only to the BASIC loader's
  `VDP`/`BASE` setup, not to file export layout.

### 11.3 Sprite attribute table (per grid, 4 bytes: Y, X, pattern#, unused)
Mostly a **runtime placement** concern (Y/X are wherever the host
program wants to draw the sprite), not a static art asset. The BASIC
loader (§7) computes these at load/display time from each grid's
preview-panel offset; they are not part of the BIN/C static export
(which only exports pattern + color bytes, matching the samples where
"attr" = the 16-byte color table, not this 4-byte struct).
- Pattern number field must reference a multiple-of-4 pattern index
  (since 16x16 sprites consume 4 consecutive 8-byte pattern slots).
- Y = 216 (`0xD8`) is a hardware sentinel meaning "stop rendering
  further sprite planes" — the loader must ensure any unused plane
  slots beyond the project's actual grid count don't accidentally get
  used, or explicitly terminate the plane list this way if writing into
  a larger, previously-used attribute table region.

## 12. Resolved Assumptions (v1)

1. **Digit `0` in `.tiny` text**: treated as an alias for `.`
   (transparent), same as any pixel with no digit.
2. **Multi-slot truncation**: if a slot's OR-decomposition doesn't fully
   fit in the remaining grid budget (out of 8), the whole slot is
   skipped — never a partial/incomplete sprite import.
3. **BASIC loader scope**: minimal fixed demo. It loads pattern +
   color/attribute bytes into VRAM (pattern generator table, sprite
   color table) and places each grid's sprite plane at its
   preview-panel relative (X, Y) offset once, then stops — just enough
   to visually confirm the OR effect matches the editor's preview. No
   interactive/runtime controls in v1.
