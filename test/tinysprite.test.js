import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTinySprite } from '../src/codec/tinysprite.js';

const SAMPLE_PATH = new URL('../References/File_Formats/tinysprite_backup.tiny', import.meta.url);

test('parseTinySprite parses the real sample: one slot, 16x16, row 11 (0-indexed) mixes colors 6 and 9', () => {
  const text = readFileSync(SAMPLE_PATH, 'utf8');
  const slots = parseTinySprite(text);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].index, 0);
  assert.equal(slots[0].colors.length, 256);
  assert.equal(slots[0].colors[0 * 16 + 0], 2);
  // Row 11 (0-indexed), ".........6699..." — the sample's own hand-authored
  // OR case, matching test/codec.test.js's buildSlot0Grids().
  assert.equal(slots[0].colors[11 * 16 + 9], 6);
  assert.equal(slots[0].colors[11 * 16 + 10], 6);
  assert.equal(slots[0].colors[11 * 16 + 11], 9);
  assert.equal(slots[0].colors[11 * 16 + 12], 9);
});

test('parseTinySprite: "0" digit is an alias for transparent', () => {
  const text = ['!type', 'msx2', '#Slot 0', '0...............', ...Array(15).fill('.'.repeat(16))].join('\n');
  const slots = parseTinySprite(text);
  assert.equal(slots[0].colors[0], 0);
});

test('parseTinySprite: hex digits A-F decode to colors 10-15 (case-insensitive)', () => {
  const row = 'ABCDEF..........';
  const text = ['!type', 'msx2', '#Slot 0', row, ...Array(15).fill('.'.repeat(16))].join('\n');
  const slots = parseTinySprite(text);
  assert.deepEqual(Array.from(slots[0].colors.slice(0, 6)), [10, 11, 12, 13, 14, 15]);
});

test('parseTinySprite parses multiple slots in order', () => {
  const blank = '.'.repeat(16);
  const text = ['!type', 'msx2', '#Slot 0', ...Array(16).fill(blank), '#Slot 1', ...Array(16).fill(blank)].join('\n');
  const slots = parseTinySprite(text);
  assert.deepEqual(slots.map((s) => s.index), [0, 1]);
});

test('parseTinySprite rejects a missing "!type" header', () => {
  assert.throws(() => parseTinySprite('nope\nmsx2\n'), /!type/);
});

test('parseTinySprite rejects a non-msx2 type', () => {
  assert.throws(() => parseTinySprite('!type\nmsx1\n'), /msx1/);
});

test('parseTinySprite rejects a malformed slot header', () => {
  assert.throws(() => parseTinySprite('!type\nmsx2\nNotASlot\n'), /#Slot/);
});

test('parseTinySprite rejects a row with the wrong length', () => {
  const text = ['!type', 'msx2', '#Slot 0', 'short'].join('\n');
  assert.throws(() => parseTinySprite(text), /16 characters/);
});

test('parseTinySprite rejects an invalid pixel character', () => {
  const row = 'X' + '.'.repeat(15);
  const text = ['!type', 'msx2', '#Slot 0', row, ...Array(15).fill('.'.repeat(16))].join('\n');
  assert.throws(() => parseTinySprite(text), /unrecognized pixel character/);
});
