/**
 * Public tests for `identicon()`: the golden vectors, the bit-to-cell map,
 * the mirror, the never-blank rule, the hue, verbatim UTF-8 seeds, fresh
 * results per call, and the package entry point.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { formatVersion, type BuildInfoDto } from "../src/build-info.js";
import { identicon, type Identicon } from "../src/identicon.js";

/** Five row strings, row 0 first; `#` is true and `.` is false. */
function grid(...rows: string[]): boolean[] {
  assert.equal(rows.length, 5);
  return rows.flatMap((row) => {
    assert.equal(row.length, 5);
    return [...row].map((ch) => ch === "#");
  });
}

function assertFace(
  result: Identicon,
  rows: [string, string, string, string, string],
  hue: number,
): void {
  assert.deepEqual([...result.cells], grid(...rows));
  assert.equal(result.hue, hue);
}

function assertShape(result: Identicon): void {
  assert.deepEqual(Object.keys(result).sort(), ["cells", "hue"]);
  assert.ok(Array.isArray(result.cells));
  assert.equal(result.cells.length, 25);
  for (const cell of result.cells) assert.equal(typeof cell, "boolean");
  assert.ok(Number.isInteger(result.hue));
  assert.ok(result.hue >= 0 && result.hue <= 359);
}

function assertPalindromeRows(result: Identicon): void {
  for (let r = 0; r < 5; r++) {
    assert.equal(result.cells[r * 5 + 3], result.cells[r * 5 + 1]);
    assert.equal(result.cells[r * 5 + 4], result.cells[r * 5 + 0]);
  }
}

/** Bit `row * 3 + column` of `hash` decides columns 0-2. */
function assertCellsFollowHash(result: Identicon, hash: number): void {
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 3; column++) {
      assert.equal(
        result.cells[row * 5 + column],
        ((hash >>> (row * 3 + column)) & 1) === 1,
        `row ${row} column ${column}`,
      );
    }
  }
}

const identified: BuildInfoDto = {
  version: "1.4.2",
  gitSha: "7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09",
  gitShortSha: "7f3a9c1",
  buildTime: "2026-09-17T09:14:00.000Z",
  gitRef: "main",
  dirty: false,
};

// --- happy-1: the result has exactly the two fields of Identicon ---

test("[happy-1] the result has exactly cells (25 booleans) and an integer hue in range", () => {
  const result = identicon("usr_01HZY3K7Q8");
  assertShape(result);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
});

test("[happy-1] the shape holds at both ends of the hue range and for the empty seed", () => {
  for (const seed of ["", "seed-72", "seed-704", "seed-14378", "seed-53536"]) {
    assertShape(identicon(seed));
  }
});

// --- happy-2: golden vectors ---

test("[happy-2] the pinned seeds a, usr_01HZY3K7Q8 and org_7f3a9c1 yield their pinned faces", () => {
  assertFace(identicon("a"), ["..#..", "#.#.#", "..#..", "..#..", ".#.#."], 120);
  assertFace(
    identicon("usr_01HZY3K7Q8"),
    ["..#..", "..#..", "#####", ".....", ".###."],
    25,
  );
  assertFace(
    identicon("org_7f3a9c1"),
    [".#.#.", "#.#.#", "#####", "#####", "....."],
    64,
  );
});

test("[happy-2] the pinned empty seed yields its pinned face", () => {
  assertFace(identicon(""), ["#.#.#", ".....", "#####", ".###.", "#...#"], 225);
});

// --- happy-3: cells for "" are row-major ---

test("[happy-3] the cells array for the empty seed is row-major", () => {
  assert.deepEqual(
    [...identicon("").cells],
    [
      true, false, true, false, true,
      false, false, false, false, false,
      true, true, true, true, true,
      false, true, true, true, false,
      true, false, false, false, true,
    ],
  );
});

test("[happy-3] the corner indices of the empty seed's cells sit at row-major positions", () => {
  const { cells } = identicon("");
  assert.equal(cells[0], true); // row 0, column 0
  assert.equal(cells[4], true); // row 0, column 4
  assert.equal(cells[5], false); // row 1, column 0
  assert.equal(cells[20], true); // row 4, column 0
  assert.equal(cells[24], true); // row 4, column 4
  assert.equal(cells[25], undefined);
});

// --- happy-4: low 15 bits map row by row onto columns 0-2 ---

test("[happy-4] the low 15 bits of hash('') map row by row onto columns 0-2", () => {
  const { cells } = identicon("");
  const columns02 = (row: number) => [0, 1, 2].map((c) => cells[row * 5 + c]);
  assert.deepEqual(columns02(0), [true, false, true]);
  assert.deepEqual(columns02(1), [false, false, false]);
  assert.deepEqual(columns02(2), [true, true, true]);
  assert.deepEqual(columns02(3), [false, true, true]);
  assert.deepEqual(columns02(4), [true, false, false]);
});

test("[happy-4] every drawn cell, through bit 14, follows its hash bit for the other pinned seeds", () => {
  assertCellsFollowHash(identicon("a"), 0xe40c292c);
  assertCellsFollowHash(identicon("usr_01HZY3K7Q8"), 0x97ece1e4);
  assertCellsFollowHash(identicon("org_7f3a9c1"), 0xbeac0fea);
  assertCellsFollowHash(identicon("seed-72"), 0x594c77ba);
  assertCellsFollowHash(identicon("seed-704"), 0x0d5b97e0);
  // Bit 14 is set for usr_01HZY3K7Q8: row 4, column 2.
  assert.equal(identicon("usr_01HZY3K7Q8").cells[22], true);
});

// --- happy-5: every row is a palindrome ---

test("[happy-5] every row is a palindrome for the listed seeds", () => {
  for (const seed of ["", "a", "usr_01HZY3K7Q8", "org_7f3a9c1", "Alice", "😀"]) {
    assertPalindromeRows(identicon(seed));
  }
});

test("[happy-5] every row is a palindrome for full, forced-centre and extreme-hue seeds", () => {
  for (const seed of [
    "seed-53536",
    "seed-14378",
    "seed-52655",
    "seed-72",
    "seed-704",
    "\ud83d",
    "a".repeat(10000),
  ]) {
    assertPalindromeRows(identicon(seed));
  }
});

// --- boundary-1: all 15 low bits set fills every cell ---

test("[boundary-1] all 15 low bits set fills every cell, hue 9", () => {
  const result = identicon("seed-53536");
  assert.ok(result.cells.every((cell) => cell === true));
  assert.equal(result.hue, 9);
});

test("[boundary-1] the full grid is exactly 25 true cells, mirrored columns included", () => {
  assertFace(
    identicon("seed-53536"),
    ["#####", "#####", "#####", "#####", "#####"],
    9,
  );
});

// --- boundary-2: the hue reaches both ends of its range ---

test("[boundary-2] the hue reaches 0", () => {
  assertFace(
    identicon("seed-72"),
    [".#.#.", "#####", ".###.", "##.##", "#####"],
    0,
  );
});

test("[boundary-2] the hue reaches 359", () => {
  assertFace(
    identicon("seed-704"),
    [".....", "..#..", "#####", "##.##", "#...#"],
    359,
  );
});

// --- boundary-3: an empty grid becomes a single centre dot ---

test("[boundary-3] an empty grid becomes a single centre dot (seed-14378)", () => {
  const result = identicon("seed-14378");
  assertFace(result, [".....", ".....", "..#..", ".....", "....."], 263);
  result.cells.forEach((cell, index) => assert.equal(cell, index === 12));
});

test("[boundary-3] an empty grid becomes a single centre dot (seed-52655)", () => {
  const result = identicon("seed-52655");
  assertFace(result, [".....", ".....", "..#..", ".....", "....."], 26);
  result.cells.forEach((cell, index) => assert.equal(cell, index === 12));
});

// --- boundary-4: a non-empty grid with the centre off keeps it off ---

test("[boundary-4] a non-empty grid with the centre off keeps the centre off", () => {
  const result = identicon(" alice");
  assertFace(result, ["#...#", "#.#.#", ".....", "..#..", ".#.#."], 191);
  assert.equal(result.cells[12], false);
});

test("[boundary-4] other non-empty grids with the centre off are left untouched", () => {
  const upper = identicon("ALICE");
  assertFace(upper, ["#####", ".....", ".#.#.", "..#..", "#...#"], 47);
  assert.equal(upper.cells[12], false);
  const trailing = identicon("alice ");
  assertFace(trailing, ["#.#.#", ".....", "#...#", "#...#", ".#.#."], 138);
  assert.equal(trailing.cells[12], false);
});

// --- boundary-5: the empty seed is accepted ---

test("[boundary-5] the empty seed does not throw and has hue 225", () => {
  assert.doesNotThrow(() => identicon(""));
  assert.equal(identicon("").hue, 225);
});

test("[boundary-5] the empty seed gives a well-formed result, not a placeholder", () => {
  const result = identicon("");
  assertShape(result);
  assertCellsFollowHash(result, 0x811c9dc5);
});

// --- boundary-6: case and surrounding whitespace change the face ---

test("[boundary-6] case changes the face", () => {
  assertFace(identicon("alice"), ["#####", "..#..", "#####", "#...#", "#...#"], 68);
  assertFace(identicon("Alice"), ["#####", ".....", ".###.", ".#.#.", "....."], 291);
  assertFace(identicon("ALICE"), ["#####", ".....", ".#.#.", "..#..", "#...#"], 47);
});

test("[boundary-6] leading and trailing whitespace change the face", () => {
  assertFace(identicon(" alice"), ["#...#", "#.#.#", ".....", "..#..", ".#.#."], 191);
  assertFace(identicon("alice "), ["#.#.#", ".....", "#...#", "#...#", ".#.#."], 138);
  assert.notDeepEqual(identicon(" alice"), identicon("alice"));
  assert.notDeepEqual(identicon("alice "), identicon("alice"));
});

// --- boundary-7: non-ASCII seeds hash their UTF-8 bytes, NFC != NFD ---

test("[boundary-7] precomposed and decomposed é hash their own UTF-8 bytes", () => {
  assertFace(identicon("é"), ["#...#", ".....", "##.##", "..#..", ".###."], 195);
  assertFace(identicon("é"), ["#####", "##.##", "..#..", "##.##", "..#.."], 151);
  assert.notDeepEqual(identicon("é"), identicon("é"));
});

test("[boundary-7] an astral emoji hashes its four UTF-8 bytes", () => {
  assertFace(identicon("\u{1F600}"), [".....", "#...#", ".....", "##.##", "#...#"], 157);
});

// --- unhappy-1: a lone surrogate is hashed as U+FFFD ---

test("[unhappy-1] a lone high surrogate is hashed as U+FFFD and does not throw", () => {
  assert.doesNotThrow(() => identicon("\ud83d"));
  const result = identicon("\ud83d");
  assert.deepEqual(result, identicon("�"));
  assertFace(result, [".#.#.", "#...#", "#...#", ".###.", "#...#"], 239);
});

test("[unhappy-1] a lone low surrogate and a surrogate inside a seed also become U+FFFD", () => {
  assert.doesNotThrow(() => identicon("\udc00"));
  assert.deepEqual(identicon("\udc00"), identicon("�"));
  assert.deepEqual(identicon("a\ud83d"), identicon("a�"));
  assert.deepEqual(identicon("\ude00\ud83d"), identicon("��"));
});

// --- boundary-8: a very long seed is accepted with no length limit ---

test("[boundary-8] a 10,000-character seed is accepted and pinned", () => {
  const seed = "a".repeat(10000);
  assert.doesNotThrow(() => identicon(seed));
  assertFace(identicon(seed), ["#.#.#", ".#.#.", "..#..", "#####", ".#.#."], 197);
});

test("[boundary-8] a long seed is hashed in full, not truncated", () => {
  const long = identicon("a".repeat(10000));
  assert.notDeepEqual(long, identicon("a".repeat(256)));
  assert.notDeepEqual(long, identicon("a".repeat(10000) + "b"));
});

// --- happy-6: repeated calls are deep-equal but not the same objects ---

test("[happy-6] repeated calls are deep-equal but not the same objects", () => {
  const first = identicon("org_7f3a9c1");
  const second = identicon("org_7f3a9c1");
  assert.deepEqual(first, second);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.cells, second.cells);
});

test("[happy-6] repeated calls with the empty seed are fresh objects too", () => {
  const first = identicon("");
  const second = identicon("");
  assert.deepEqual(first, second);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.cells, second.cells);
});

// --- boundary-9: the returned object and array are not frozen ---

test("[boundary-9] the returned object and array are not frozen", () => {
  const result = identicon("a");
  assert.equal(Object.isFrozen(result), false);
  assert.equal(Object.isFrozen(result.cells), false);
});

test("[boundary-9] a forced-centre result is not frozen either", () => {
  const result = identicon("seed-14378");
  assert.equal(Object.isFrozen(result), false);
  assert.equal(Object.isFrozen(result.cells), false);
});

// --- boundary-10: mutating a result does not affect later calls ---

test("[boundary-10] mutating a returned result does not affect later calls", () => {
  const result = identicon("a");
  const cells = result.cells as boolean[];
  cells[0] = true;
  cells.length = 0;
  assertFace(identicon("a"), ["..#..", "#.#.#", "..#..", "..#..", ".#.#."], 120);
});

test("[boundary-10] clearing a forced centre does not affect later calls", () => {
  const result = identicon("seed-14378");
  (result.cells as boolean[])[12] = false;
  assertFace(
    identicon("seed-14378"),
    [".....", ".....", "..#..", ".....", "....."],
    263,
  );
});

// --- concurrency-1: interleaved calls give the same results ---

test("[concurrency-1] interleaved calls give the same results as isolated calls", () => {
  const first = identicon("a");
  identicon("");
  identicon("seed-14378");
  identicon("usr_01HZY3K7Q8");
  const again = identicon("a");
  assert.deepEqual(again, first);
});

test("[concurrency-1] calls inside 100 microtasks alternating a and '' agree with isolated calls", async () => {
  const first = identicon("a");
  const seeds = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? "a" : ""));
  const results = await Promise.all(
    seeds.map((seed) => Promise.resolve().then(() => identicon(seed))),
  );
  results.forEach((result, i) => {
    if (seeds[i] === "a") assert.deepEqual(result, first);
    else assert.equal(result.hue, 225);
  });
});

// --- happy-7: identicon is reachable from the package entry point ---

/**
 * Imported dynamically and untyped: the entry point does not re-export
 * identicon until the spec is implemented, and a static import would not
 * compile before then.
 */
async function entryPoint(): Promise<Record<string, unknown>> {
  return (await import("../src/index.js")) as unknown as Record<
    string,
    unknown
  >;
}

test("[happy-7] identicon from the entry point is the same function and gives hue 120 for a", async () => {
  const entry = await entryPoint();
  assert.equal(entry.identicon, identicon);
  const fromEntry = entry.identicon as typeof identicon;
  assert.equal(fromEntry("a").hue, 120);
});

test("[happy-7] the entry point still exports its existing schemas next to identicon", async () => {
  const entry = await entryPoint();
  assert.equal(typeof entry.identicon, "function");
  assert.ok(entry.handleSchema !== undefined);
  assert.ok(entry.organizationRoleSchema !== undefined);
});

// --- happy-8: build-info exports behave as before ---

test("[happy-8] formatVersion still joins version and short sha", () => {
  assert.equal(formatVersion(identified), "1.4.2+7f3a9c1");
});

test("[happy-8] formatVersion still marks a dirty tree", () => {
  assert.equal(
    formatVersion({ ...identified, dirty: true }),
    "1.4.2+7f3a9c1-dirty",
  );
});
