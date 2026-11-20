/**
 * Hidden tests for how `identicon()` turns hash bits into cells: one bit at
 * a time, the mirror, a full grid and the never-blank rule.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { identicon, type Identicon } from "../../src/identicon.js";

type Rows = [string, string, string, string, string];

/** Five row strings, row 0 first; `#` is true and `.` is false. */
function grid(...rows: string[]): boolean[] {
  assert.equal(rows.length, 5);
  return rows.flatMap((row) => {
    assert.equal(row.length, 5);
    return [...row].map((ch) => ch === "#");
  });
}

function assertFace(result: Identicon, rows: Rows, hue: number): void {
  assert.deepEqual([...result.cells], grid(...rows));
  assert.equal(result.hue, hue);
}

function assertPalindromeRows(result: Identicon, label: string): void {
  for (let r = 0; r < 5; r++) {
    assert.equal(result.cells[r * 5 + 3], result.cells[r * 5 + 1], `${label} row ${r}`);
    assert.equal(result.cells[r * 5 + 4], result.cells[r * 5 + 0], `${label} row ${r}`);
  }
}

/** The spec's FNV-1a over `new TextEncoder().encode(seed)`, unsigned. */
function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(seed)) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The spec's cells, steps 3 and 4, for `hash`. */
function cellsFor(hash: number): boolean[] {
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    const bit = (column: number) => ((hash >>> (row * 3 + column)) & 1) === 1;
    cells.push(bit(0), bit(1), bit(2), bit(1), bit(0));
  }
  if (cells.every((cell) => !cell)) cells[12] = true;
  return cells;
}

const sweep: string[] = Array.from({ length: 1000 }, (_, i) => `sweep-${i}`);

/** Seeds whose bits 0..14 are exactly one bit, keyed by that bit. */
const oneHot: Array<[number, string, Rows, number]> = [
  [0, "acct-81247", ["#...#", ".....", ".....", ".....", "....."], 61],
  [1, "acct-85871", [".#.#.", ".....", ".....", ".....", "....."], 357],
  [2, "acct-4403", ["..#..", ".....", ".....", ".....", "....."], 169],
  [3, "acct-29729", [".....", "#...#", ".....", ".....", "....."], 260],
  [4, "acct-90798", [".....", ".#.#.", ".....", ".....", "....."], 110],
  [5, "acct-2940", [".....", "..#..", ".....", ".....", "....."], 65],
  [6, "acct-6597", [".....", ".....", "#...#", ".....", "....."], 274],
  [7, "acct-27730", [".....", ".....", ".#.#.", ".....", "....."], 147],
  [8, "acct-27006", [".....", ".....", "..#..", ".....", "....."], 34],
  [9, "acct-55942", [".....", ".....", ".....", "#...#", "....."], 161],
  [10, "acct-38279", [".....", ".....", ".....", ".#.#.", "....."], 349],
  [11, "acct-2863", [".....", ".....", ".....", "..#..", "....."], 293],
  [12, "acct-45617", [".....", ".....", ".....", ".....", "#...#"], 216],
  [13, "acct-122365", [".....", ".....", ".....", ".....", ".#.#."], 103],
  [14, "acct-12136", [".....", ".....", ".....", ".....", "..#.."], 73],
];

// Extends "[happy-4] the low 15 bits of hash('') map row by row ...": each
// of the 15 bits on its own, so every bit-to-cell link is checked in isolation.
test("[happy-4] each of bits 0..14 alone turns on exactly its own cell and its mirror", () => {
  for (const [bit, seed, rows, hue] of oneHot) {
    const row = Math.floor(bit / 3);
    const column = bit % 3;
    const result = identicon(seed);
    assertFace(result, rows, hue);
    assert.equal(result.cells[row * 5 + column], true, `bit ${bit}`);
    assert.equal(result.cells.filter(Boolean).length, column === 2 ? 1 : 2, `bit ${bit}`);
  }
});

// Extends "[happy-4] every drawn cell, through bit 14, follows its hash bit":
// bits 0..13 set with bit 14 clear leaves only row 4 column 2 off.
test("[happy-4] bits 0..13 set and bit 14 clear leave only row 4 column 2 off", () => {
  // hash("acct-107141") = 0xc1e5bfff
  assertFace(
    identicon("acct-107141"),
    ["#####", "#####", "#####", "#####", "##.##"],
    275,
  );
});

// Extends "[happy-4] every drawn cell ... follows its hash bit": a thousand
// further seeds against the spec's own definition of the cells.
test("[happy-4] the cells of 1000 further seeds follow bits 0..14 of their FNV-1a hash", () => {
  for (const seed of sweep) {
    assert.deepEqual([...identicon(seed).cells], cellsFor(fnv1a(seed)), seed);
  }
});

// Extends "[happy-5] every row is a palindrome for the listed seeds": a
// thousand more seeds, and the one-hot seeds whose single bit tests one mirror.
test("[happy-5] every row is a palindrome for 1000 further seeds and every one-hot seed", () => {
  for (const seed of sweep) assertPalindromeRows(identicon(seed), seed);
  for (const [, seed] of oneHot) assertPalindromeRows(identicon(seed), seed);
});

// Extends "[happy-5] every row is a palindrome ...": column 3 copies column 1
// and column 4 copies column 0, not the other way round from column 2.
test("[happy-5] column 3 mirrors column 1 and column 4 mirrors column 0 for one-bit seeds", () => {
  // Bit 0 alone: columns 0 and 4 of row 0 only.
  const bit0 = identicon("acct-81247");
  assert.deepEqual([...bit0.cells.slice(0, 5)], [true, false, false, false, true]);
  // Bit 1 alone: columns 1 and 3 of row 0 only.
  const bit1 = identicon("acct-85871");
  assert.deepEqual([...bit1.cells.slice(0, 5)], [false, true, false, true, false]);
  // Bit 2 alone: column 2 of row 0, which has no mirror.
  const bit2 = identicon("acct-4403");
  assert.deepEqual([...bit2.cells.slice(0, 5)], [false, false, true, false, false]);
});

// Extends "[boundary-1] all 15 low bits set fills every cell": two more full
// seeds with other hues, one of them with bit 15 set as well.
test("[boundary-1] other seeds with all 15 low bits set fill every cell, with their own hue", () => {
  // hash("acct-28864") = 0x9f2c7fff, hash("acct-73734") = 0x6fd1ffff
  assertFace(
    identicon("acct-28864"),
    ["#####", "#####", "#####", "#####", "#####"],
    136,
  );
  assertFace(
    identicon("acct-73734"),
    ["#####", "#####", "#####", "#####", "#####"],
    11,
  );
});

// Extends "[boundary-3] an empty grid becomes a single centre dot": three
// more blank seeds, two with bit 15 set and one with bits 0..15 all clear.
test("[boundary-3] three more blank seeds each become a single centre dot with their own hue", () => {
  const blanks: Array<[string, number]> = [
    ["acct-14303", 313], // 0x9a988000
    ["acct-106886", 22], // 0x82d30000
    ["acct-170083", 129], // 0xd1148000
  ];
  for (const [seed, hue] of blanks) {
    const result = identicon(seed);
    assertFace(result, [".....", ".....", "..#..", ".....", "....."], hue);
    result.cells.forEach((cell, index) => assert.equal(cell, index === 12, `${seed} ${index}`));
  }
});

// Extends "[boundary-3] ...": a natural centre-only grid (bit 8 alone) and a
// forced one look the same, and the forced one keeps its own hue.
test("[boundary-3] the forced centre dot matches the centre-only grid of bit 8 alone", () => {
  const natural = identicon("acct-27006"); // bit 8 only, hue 34
  const forced = identicon("acct-14303"); // bits 0..14 clear, hue 313
  assert.deepEqual([...forced.cells], [...natural.cells]);
  assert.equal(natural.hue, 34);
  assert.equal(forced.hue, 313);
});

// Extends "[boundary-4] other non-empty grids with the centre off are left
// untouched": grids with a single cell on, or one mirrored pair, are not
// blank, so the centre stays off. This catches a "too few cells" rule and a
// blank test that looks at fewer than 15 bits.
test("[boundary-4] grids with only one cell or one mirrored pair on keep the centre off", () => {
  for (const [bit, seed, rows, hue] of oneHot) {
    if (bit === 8) continue;
    const result = identicon(seed);
    assert.equal(result.cells[12], false, `bit ${bit}`);
    assertFace(result, rows, hue);
  }
});

// Extends "[boundary-4] a non-empty grid with the centre off ...": across a
// thousand seeds, the centre is on exactly when bit 8 is set or bits 0..14
// are all clear.
test("[boundary-4] across 1000 seeds the centre is on only for bit 8 or a blank grid", () => {
  for (const seed of sweep) {
    const h = fnv1a(seed);
    const expected = ((h >>> 8) & 1) === 1 || (h & 0x7fff) === 0;
    assert.equal(identicon(seed).cells[12], expected, seed);
  }
});
