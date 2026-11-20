/**
 * Hidden tests for `identicon()`: the result's shape, the golden vectors and
 * the row-major layout, pushed past the seeds the public suite uses.
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

function assertShape(result: Identicon): void {
  assert.deepEqual(Object.keys(result).sort(), ["cells", "hue"]);
  assert.ok(Array.isArray(result.cells));
  assert.equal(result.cells.length, 25);
  for (let i = 0; i < 25; i++) {
    assert.ok(i in result.cells, `index ${i} is present`);
    assert.equal(typeof result.cells[i], "boolean", `index ${i}`);
  }
  assert.equal(typeof result.hue, "number");
  assert.ok(Number.isInteger(result.hue));
  assert.ok(result.hue >= 0 && result.hue <= 359, `hue ${result.hue}`);
}

const manySeeds: string[] = [
  ...Array.from({ length: 400 }, (_, i) => `acct-${i}`),
  "é",
  "é",
  "中",
  "\u{1F600}",
  "\ud83d",
  "\u0000",
  " ",
  "usr_01J0000000",
  "org_0000000",
];

// Extends "[happy-1] the shape holds at both ends of the hue range ...":
// hundreds of other seeds, not only the handful the public suite names.
test("[happy-1] the shape holds for 400 generated seeds and assorted non-ASCII seeds", () => {
  for (const seed of manySeeds) assertShape(identicon(seed));
});

// Extends "[happy-1] the result has exactly cells ...": the result is a
// plain object holding a plain array, for a full, a blank and a golden seed.
test("[happy-1] the result is a plain object with a plain Array for full, forced-centre and golden seeds", () => {
  for (const seed of ["acct-28864", "acct-14303", "org_7f3a9c1", ""]) {
    const result = identicon(seed);
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(Object.getPrototypeOf(result.cells), Array.prototype);
    assert.deepEqual(Object.keys(result).sort(), ["cells", "hue"]);
    assertShape(result);
  }
});

// Extends "[happy-2] the pinned seeds ... yield their pinned faces": the whole
// result deep-equals a plain { cells, hue } object, so no extra field or
// exotic array slips through.
test("[happy-2] each golden result deep-equals a plain object of exactly its cells and hue", () => {
  const golden: Array<[string, Rows, number]> = [
    ["", ["#.#.#", ".....", "#####", ".###.", "#...#"], 225],
    ["a", ["..#..", "#.#.#", "..#..", "..#..", ".#.#."], 120],
    ["usr_01HZY3K7Q8", ["..#..", "..#..", "#####", ".....", ".###."], 25],
    ["org_7f3a9c1", [".#.#.", "#.#.#", "#####", "#####", "....."], 64],
  ];
  // Reverse order: the faces do not depend on which seed is asked first.
  for (const [seed, rows, hue] of [...golden].reverse()) {
    assert.deepEqual(identicon(seed), { cells: grid(...rows), hue });
  }
});

// Extends "[happy-2] the pinned seeds ...": seeds next to the golden ones,
// which a lookup table of the four golden faces would get wrong.
test("[happy-2] seeds adjacent to the golden ones yield the faces the algorithm defines", () => {
  assertFace(identicon("A"), ["..#..", "#...#", "##.##", "##.##", "#####"], 295);
  assertFace(identicon("b"), ["#.#.#", "..#..", "#####", ".###.", ".#.#."], 216);
  assertFace(identicon("aa"), ["#####", ".###.", ".....", ".#.#.", "....."], 106);
  assertFace(identicon("ab"), [".#.#.", "#...#", "#####", ".#.#.", "....."], 258);
  assertFace(identicon("ba"), ["..#..", "#...#", "##.##", "##.##", ".#.#."], 207);
  assertFace(
    identicon("usr_01HZY3K7Q"),
    ["..#..", ".###.", "..#..", ".#.#.", "#.#.#"],
    306,
  );
  assertFace(
    identicon("usr_01HZY3K7Q8org_7f3a9c1"),
    ["#...#", "##.##", ".###.", "..#..", "##.##"],
    320,
  );
  assertFace(
    identicon("usr_01J0000000"),
    ["#####", ".#.#.", ".###.", ".###.", "..#.."],
    300,
  );
  assertFace(
    identicon("org_0000000"),
    [".###.", ".###.", "##.##", ".#.#.", ".#.#."],
    266,
  );
});

// Extends "[happy-3] the cells array for the empty seed is row-major": other
// golden seeds, whose grids are not symmetric under transposition, so a
// column-major layout cannot pass.
test("[happy-3] the cells arrays for org_7f3a9c1, usr_01HZY3K7Q8 and a are row-major", () => {
  assert.deepEqual(
    [...identicon("org_7f3a9c1").cells],
    [
      false, true, false, true, false,
      true, false, true, false, true,
      true, true, true, true, true,
      true, true, true, true, true,
      false, false, false, false, false,
    ],
  );
  assert.deepEqual(
    [...identicon("usr_01HZY3K7Q8").cells],
    [
      false, false, true, false, false,
      false, false, true, false, false,
      true, true, true, true, true,
      false, false, false, false, false,
      false, true, true, true, false,
    ],
  );
  assert.deepEqual(
    [...identicon("a").cells],
    [
      false, false, true, false, false,
      true, false, true, false, true,
      false, false, true, false, false,
      false, false, true, false, false,
      false, true, false, true, false,
    ],
  );
});

// Extends "[happy-3] the corner indices ...": a single drawn cell lands at
// index row * 5 + column, not at column * 5 + row.
test("[happy-3] a lone cell at row 4 column 2 sits at index 22 of a flat array", () => {
  // hash("acct-12136") = 0xbdfcc000: of bits 0..14 only bit 14 is set.
  const { cells } = identicon("acct-12136");
  assert.equal(cells.length, 25);
  cells.forEach((cell, index) => assert.equal(cell, index === 22, `index ${index}`));
});
