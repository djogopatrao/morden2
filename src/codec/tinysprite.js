import { GRID_SIZE, getPixel } from '../model.js';

// Parses the TinySprite `.tiny` backup format (FUNCTIONAL_SPEC.md §6.1),
// confirmed against References/File_Formats/tinysprite_backup.tiny:
//
//   !type
//   msx2
//   #Slot 0
//   <16 lines of 16 characters>
//   #Slot 1
//   ...
//
// Each character: `.` or `0` = transparent (§12.1: `0` is an alias for
// `.`), `1`-`9`/`A`-`F` (case-insensitive) = palette color 1-15.
//
// Unlike our grid model, a slot's rows are NOT constrained to one color
// per line (TinySprite stores an authored preview image per slot, not
// real hardware sprite data) — decomposition into real one-color-per-row
// grids happens on import via decomposeByColor, not here.
//
// Returns an array of `{ index, colors }`, one per `#Slot N` block, in
// file order, where `colors` is a Uint8Array(256) (row-major, 0-15).
// Throws with a clear message on any structural violation.

const HEX_DIGITS = '0123456789ABCDEF';

function decodeChar(ch) {
  if (ch === '.' || ch === '0') return 0;
  const value = HEX_DIGITS.indexOf(ch.toUpperCase());
  if (value === -1) throw new Error(`Invalid .tiny file: unrecognized pixel character "${ch}".`);
  return value;
}

export function parseTinySprite(text) {
  const lines = text.split(/\r\n|\r|\n/);
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

  let i = 0;
  function nextLine(context) {
    if (i >= lines.length) throw new Error(`Invalid .tiny file: unexpected end of file${context ? ` (${context})` : ''}.`);
    return lines[i++];
  }

  const header = nextLine('expected "!type" header').trim();
  if (header !== '!type') {
    throw new Error(`Invalid .tiny file: expected "!type" header, got "${header}".`);
  }
  const type = nextLine('expected type value').trim();
  if (type !== 'msx2') {
    throw new Error(`Unsupported .tiny type "${type}" (only "msx2" is supported).`);
  }

  const slots = [];
  while (i < lines.length) {
    const slotHeader = nextLine('expected "#Slot N" header').trim();
    if (slotHeader === '') continue;
    const match = /^#Slot\s+(\d+)/.exec(slotHeader);
    if (!match) {
      throw new Error(`Invalid .tiny file: expected "#Slot N" header, got "${slotHeader}".`);
    }
    const slotIndex = Number(match[1]);
    const colors = new Uint8Array(GRID_SIZE * GRID_SIZE);
    for (let row = 0; row < GRID_SIZE; row++) {
      const line = nextLine(`Slot ${slotIndex}, row ${row}`);
      if (line.length !== GRID_SIZE) {
        throw new Error(`Invalid .tiny file: Slot ${slotIndex} row ${row} must be exactly ${GRID_SIZE} characters (got ${line.length}).`);
      }
      for (let col = 0; col < GRID_SIZE; col++) {
        colors[row * GRID_SIZE + col] = decodeChar(line[col]);
      }
    }
    slots.push({ index: slotIndex, colors });
  }

  return slots;
}

// ---- Export (FUNCTIONAL_SPEC.md §7's "TinySprite backup" row) ----
//
// One `#Slot N` per grid, each storing that grid's own per-pixel
// colors (opacity + its already-uniform-per-row rowColors) — not the
// cross-grid OR composite, matching TinySprite's own per-slot
// semantics (an OR pair round-trips as two separate slots, same as
// the reference sample's mask0/mask1 split).

const ENCODE_DIGITS = '0123456789ABCDEF';

function encodeTinyChar(colorIndex) {
  return colorIndex === 0 ? '.' : ENCODE_DIGITS[colorIndex];
}

export function spriteToTinyRows(sprite) {
  const rows = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    let line = '';
    for (let col = 0; col < GRID_SIZE; col++) {
      line += getPixel(sprite, row, col) ? encodeTinyChar(sprite.rowColors[row]) : '.';
    }
    rows.push(line);
  }
  return rows;
}

export function serializeTinySprite(project) {
  const lines = ['!type', 'msx2'];
  project.grids.forEach((sprite, i) => {
    lines.push(`#Slot ${i}`);
    lines.push(...spriteToTinyRows(sprite));
  });
  return lines.join('\n') + '\n';
}
