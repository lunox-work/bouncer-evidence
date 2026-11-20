/**
 * Hidden tests for the hue and for how `identicon()` reads its seed: verbatim
 * UTF-8, no trimming, case folding or normalization, lone surrogates as
 * U+FFFD, and no length limit.
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

/** The spec's FNV-1a over `new TextEncoder().encode(seed)`, unsigned. */
function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(seed)) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const FFFD_FACE: Rows = [".#.#.", "#...#", "#...#", ".###.", "#...#"];

// --- boundary-2: the hue ---

// Extends "[boundary-2] the hue reaches 0": hue 0 both from a hash below
// 2^15 (high bits all zero) and from high bits equal to exactly 360.
test("[boundary-2] the hue is 0 when the 17 high bits are 0 and when they are exactly 360", () => {
  // hash("acct-340438") = 0x00007095: (h >>> 15) is 0, but h % 360 is 21.
  assertFace(
    identicon("acct-340438"),
    ["#.#.#", ".#.#.", ".#.#.", ".....", "#####"],
    0,
  );
  // hash("acct-457619") = 0x00b44c05: (h >>> 15) is 360.
  assertFace(
    identicon("acct-457619"),
    ["#.#.#", ".....", ".....", ".###.", "..#.."],
    0,
  );
});

// Extends "[boundary-2] the hue reaches 359": 359 straight from the high
// bits, with no wrap-around.
test("[boundary-2] the hue is 359 when the 17 high bits are exactly 359", () => {
  // hash("acct-124752") = 0x00b385bc
  assertFace(
    identicon("acct-124752"),
    ["..#..", "#####", ".###.", ".#.#.", "....."],
    359,
  );
});

// Extends "[boundary-2] ...": the largest possible high bits, 0x1ffff, wrap
// to 131071 % 360 = 31; a signed shift would go negative here.
test("[boundary-2] the hue is 31 when all 17 high bits are set", () => {
  // hash("acct-8085") = 0xffffe4c6
  assertFace(
    identicon("acct-8085"),
    [".###.", ".....", "##.##", ".#.#.", ".###."],
    31,
  );
});

// Extends both "[boundary-2]" tests: a thousand further seeds against the
// spec's definition of the hue.
test("[boundary-2] the hue of 1000 further seeds is (hash >>> 15) % 360, an integer in 0..359", () => {
  for (let i = 0; i < 1000; i++) {
    const seed = `hue-${i}`;
    const { hue } = identicon(seed);
    assert.equal(hue, (fnv1a(seed) >>> 15) % 360, seed);
    assert.ok(Number.isInteger(hue) && hue >= 0 && hue <= 359, seed);
  }
});

// --- boundary-5: the empty seed ---

// Extends "[boundary-5] the empty seed gives a well-formed result, not a
// placeholder": its exact face, call after call, and a single NUL byte (one
// zero byte hashed) is a different face, not treated as empty.
test("[boundary-5] the empty seed gives its exact face every time, distinct from a NUL seed", () => {
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(identicon(""), {
      cells: grid("#.#.#", ".....", "#####", ".###.", "#...#"),
      hue: 225,
    });
  }
  assertFace(identicon("\u0000"), ["#####", "##.##", "..#..", ".###.", "#.#.#"], 64);
  assert.notDeepEqual(identicon("\u0000"), identicon(""));
});

// --- boundary-6: verbatim seeds ---

// Extends "[boundary-6] leading and trailing whitespace change the face":
// tab, newline, no-break space and a byte-order mark, all of which
// String.prototype.trim would strip.
test("[boundary-6] tab, newline, no-break space and BOM around a seed change the face", () => {
  assertFace(identicon("\talice"), ["..#..", ".#.#.", ".###.", "..#..", "#.#.#"], 6);
  assertFace(identicon("alice\n"), ["#####", ".#.#.", ".....", "#####", "#.#.#"], 154);
  assertFace(identicon(" alice"), ["#...#", "#.#.#", "#...#", ".....", "....."], 84);
  assertFace(identicon("﻿alice"), [".....", "#.#.#", "#.#.#", "#.#.#", ".###."], 357);
  const alice = identicon("alice");
  for (const seed of ["\talice", "alice\n", " alice", "﻿alice"]) {
    assert.notDeepEqual(identicon(seed), alice, JSON.stringify(seed));
  }
});

// Extends "[boundary-6] case changes the face": non-ASCII case pairs whose
// toUpperCase or toLowerCase changes the length or the bytes.
test("[boundary-6] sharp s, SS, ss and dotted capital I keep their own faces", () => {
  assertFace(identicon("ß"), ["#####", ".#.#.", "..#..", ".#.#.", "....."], 52);
  assertFace(identicon("SS"), ["##.##", "..#..", "##.##", "#.#.#", "#...#"], 29);
  assertFace(identicon("ss"), ["##.##", "..#..", "#...#", "#.#.#", "#...#"], 4);
  assertFace(identicon("İ"), ["#...#", "##.##", "..#..", "#####", ".#.#."], 288);
});

// --- boundary-7: non-ASCII seeds ---

// Extends "[boundary-7] precomposed and decomposed é ...": the edges of each
// UTF-8 length, 1 to 4 bytes.
test("[boundary-7] code points at each UTF-8 length boundary hash their own bytes", () => {
  assertFace(identicon("\u0080"), ["#####", "##.##", "#.#.#", "##.##", "....."], 113); // c2 80
  assertFace(identicon("߿"), ["##.##", ".....", ".#.#.", ".###.", "#.#.#"], 323); // df bf
  assertFace(identicon("ࠀ"), ["#####", ".###.", ".###.", "..#..", "#...#"], 207); // e0 a0 80
  assertFace(identicon("￿"), ["..#..", "..#..", "..#..", "..#..", "#...#"], 295); // ef bf bf
  assertFace(identicon("\u{10000}"), ["#.#.#", ".###.", ".###.", "#...#", "#.#.#"], 314); // f0 90 80 80
  assertFace(identicon("\u{10FFFF}"), [".#.#.", "#####", ".....", ".###.", "##.##"], 187); // f4 8f bf bf
});

// Extends "[boundary-7] ...": other non-ASCII letters, and characters that
// NFC or NFKC would rewrite (angstrom sign to Å, the fi ligature to "fi").
test("[boundary-7] ñ, 中, the angstrom sign and the fi ligature are hashed without normalization", () => {
  assertFace(identicon("ñ"), ["#...#", "#####", "##.##", "#...#", "..#.."], 147);
  assertFace(identicon("中"), ["..#..", ".###.", "#####", "#...#", "#.#.#"], 29);
  assertFace(identicon("Å"), [".....", "#...#", "#.#.#", "..#..", "##.##"], 100);
  assertFace(identicon("Å"), ["#.#.#", ".#.#.", "##.##", ".#.#.", "#...#"], 132);
  assertFace(identicon("ﬁ"), ["#.#.#", ".#.#.", "..#..", "..#..", "#####"], 187);
  assertFace(identicon("fi"), [".....", ".#.#.", "##.##", "#####", "#.#.#"], 13);
});

// Extends "[boundary-7] an astral emoji hashes its four UTF-8 bytes": mixed
// ASCII, 2-, 3- and 4-byte seeds checked against the spec's FNV-1a.
test("[boundary-7] mixed-script seeds follow FNV-1a over their TextEncoder bytes", () => {
  const seeds = [
    "usr_été",
    "中文-\u{1F600}",
    "العربية",
    "\u{1F468}‍\u{1F469}‍\u{1F467}",
    "Zoë Łódź",
  ];
  for (const seed of seeds) {
    const h = fnv1a(seed);
    const result = identicon(seed);
    assert.equal(result.hue, (h >>> 15) % 360, seed);
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 3; column++) {
        const on = ((h >>> (row * 3 + column)) & 1) === 1;
        assert.equal(result.cells[row * 5 + column], on, `${seed} ${row},${column}`);
      }
    }
  }
});

// --- unhappy-1: lone surrogates ---

// Extends "[unhappy-1] a lone low surrogate and a surrogate inside a seed
// also become U+FFFD": the ends of both surrogate ranges, pinned to the
// U+FFFD face rather than only compared with it.
test("[unhappy-1] lone surrogates at the ends of both ranges give the pinned U+FFFD face", () => {
  for (const seed of ["\ud800", "\udbff", "\udc00", "\udfff"]) {
    assert.doesNotThrow(() => identicon(seed));
    assertFace(identicon(seed), FFFD_FACE, 239);
  }
});

// Extends "[unhappy-1] ...": a lone surrogate before a valid pair, and one
// between ASCII letters; the valid pair itself stays a 4-byte character.
test("[unhappy-1] a lone surrogate next to a valid pair or between letters becomes U+FFFD alone", () => {
  const beforePair = identicon("\ud83d😀");
  assert.deepEqual(beforePair, identicon("�\u{1F600}"));
  assertFace(beforePair, ["##.##", ".#.#.", ".#.#.", "#####", "#...#"], 182);
  const between = identicon("x\ud83dy");
  assert.deepEqual(between, identicon("x�y"));
  assertFace(between, ["##.##", ".....", ".....", ".....", "#.#.#"], 25);
});

// --- boundary-8: long seeds ---

// Extends "[boundary-8] a 10,000-character seed is accepted and pinned":
// ten times longer, pinned, and different from its own prefix one shorter.
test("[boundary-8] a 100,000-character seed is hashed in full", () => {
  const seed = "a".repeat(100000);
  assert.doesNotThrow(() => identicon(seed));
  assertFace(identicon(seed), ["#.#.#", "..#..", ".#.#.", ".###.", "..#.."], 122);
  assertFace(
    identicon("a".repeat(99999)),
    [".###.", ".....", ".###.", "#.#.#", "##.##"],
    226,
  );
});

// Extends "[boundary-8] a long seed is hashed in full, not truncated": long
// multi-byte seeds, 150,000 UTF-8 bytes and a mixed one.
test("[boundary-8] long multi-byte seeds are hashed in full", () => {
  assertFace(
    identicon("中".repeat(50000)),
    ["#.#.#", ".#.#.", ".###.", ".....", "#####"],
    245,
  );
  assertFace(
    identicon("usr_01HZY3K7Q8-é-\u{1F600}-".repeat(4000)),
    ["#.#.#", "..#..", ".....", ".....", "#...#"],
    94,
  );
});
