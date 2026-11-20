/**
 * Hidden tests for fresh, unshared results per call, interleaved calls, the
 * package entry point and the existing build-info exports.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuildInfoDto } from "../../src/build-info.js";
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

const A_FACE: Rows = ["..#..", "#.#.#", "..#..", "..#..", ".#.#."];
const EMPTY_FACE: Rows = ["#.#.#", ".....", "#####", ".###.", "#...#"];
const DOT_FACE: Rows = [".....", ".....", "..#..", ".....", "....."];
const FULL_FACE: Rows = ["#####", "#####", "#####", "#####", "#####"];

const identified: BuildInfoDto = {
  version: "1.4.2",
  gitSha: "7f3a9c1e5b2d8a4f6c0e9b3a1d7f5c2e8a4b6d09",
  gitShortSha: "7f3a9c1",
  buildTime: "2026-09-17T09:14:00.000Z",
  gitRef: "main",
  dirty: false,
};

// --- happy-6: fresh objects per call ---

// Extends "[happy-6] repeated calls are deep-equal but not the same objects":
// more calls, and forced-centre and full seeds, every array distinct.
test("[happy-6] five calls each for blank, full and golden seeds are deep-equal and all distinct", () => {
  for (const seed of ["seed-14378", "seed-53536", "usr_01HZY3K7Q8"]) {
    const results = Array.from({ length: 5 }, () => identicon(seed));
    for (let i = 0; i < results.length; i++) {
      assert.deepEqual(results[i], results[0]);
      for (let j = i + 1; j < results.length; j++) {
        assert.notStrictEqual(results[i], results[j]);
        assert.notStrictEqual(results[i]!.cells, results[j]!.cells);
      }
    }
  }
});

// Extends "[happy-6] ...": calls with different seeds never hand back one
// shared array, and an earlier result keeps its own cells.
test("[happy-6] results for different seeds are different arrays and keep their own cells", () => {
  const a = identicon("a");
  const empty = identicon("");
  const full = identicon("seed-53536");
  assert.notStrictEqual(a.cells, empty.cells);
  assert.notStrictEqual(a.cells, full.cells);
  assert.notStrictEqual(empty.cells, full.cells);
  assertFace(a, A_FACE, 120);
  assertFace(empty, EMPTY_FACE, 225);
  assertFace(full, FULL_FACE, 9);
});

// --- boundary-9: not frozen ---

// Extends "[boundary-9] the returned object and array are not frozen": a
// full, an empty-seed, a non-ASCII and a long-seed result.
test("[boundary-9] results for full, empty, non-ASCII and long seeds are not frozen", () => {
  for (const seed of ["seed-53536", "", "\u{1F600}", "a".repeat(10000)]) {
    const result = identicon(seed);
    assert.equal(Object.isFrozen(result), false, JSON.stringify(seed.slice(0, 8)));
    assert.equal(Object.isFrozen(result.cells), false, JSON.stringify(seed.slice(0, 8)));
  }
});

// Extends "[boundary-9] ...": the array is mutable in practice; writes,
// push and a length change all take effect.
test("[boundary-9] the returned cells array accepts writes, push and a length change", () => {
  const cells = identicon("seed-53536").cells as boolean[];
  cells[0] = false;
  assert.equal(cells[0], false);
  cells.push(true);
  assert.equal(cells.length, 26);
  cells.length = 3;
  assert.equal(cells.length, 3);
});

// --- boundary-10: mutation does not leak ---

// Extends "[boundary-10] mutating a returned result does not affect later
// calls": other mutations (fill, reverse, push) on other seeds.
test("[boundary-10] filling, reversing and growing returned arrays does not affect later calls", () => {
  (identicon("").cells as boolean[]).fill(false);
  assertFace(identicon(""), EMPTY_FACE, 225);

  (identicon("usr_01HZY3K7Q8").cells as boolean[]).reverse();
  assertFace(
    identicon("usr_01HZY3K7Q8"),
    ["..#..", "..#..", "#####", ".....", ".###."],
    25,
  );

  (identicon("seed-53536").cells as boolean[]).push(false, false);
  assertFace(identicon("seed-53536"), FULL_FACE, 9);
});

// Extends "[boundary-10] clearing a forced centre ...": turning every cell of
// a blank seed's result on does not stop later calls forcing just the centre.
test("[boundary-10] filling a forced-centre result does not affect later calls", () => {
  (identicon("seed-52655").cells as boolean[]).fill(true);
  assertFace(identicon("seed-52655"), DOT_FACE, 26);
});

// --- concurrency-1: interleaving ---

// Extends "[concurrency-1] interleaved calls give the same results as
// isolated calls": the first result must still hold its own face after the
// interleaved calls, not just equal the later one.
test("[concurrency-1] an earlier result keeps its own face after interleaved calls", () => {
  const first = identicon("a");
  const empty = identicon("");
  const dot = identicon("seed-14378");
  const usr = identicon("usr_01HZY3K7Q8");
  const again = identicon("a");
  assertFace(first, A_FACE, 120);
  assertFace(again, A_FACE, 120);
  assertFace(empty, EMPTY_FACE, 225);
  assertFace(dot, DOT_FACE, 263);
  assertFace(usr, ["..#..", "..#..", "#####", ".....", ".###."], 25);
});

// Extends "[concurrency-1] calls inside 100 microtasks ...": 200 microtasks
// over five seeds, every result checked against its full face.
test("[concurrency-1] 200 microtasks over five seeds each resolve to that seed's full face", async () => {
  const faces: Array<[string, Rows, number]> = [
    ["a", A_FACE, 120],
    ["", EMPTY_FACE, 225],
    ["seed-14378", DOT_FACE, 263],
    ["seed-53536", FULL_FACE, 9],
    ["org_7f3a9c1", [".#.#.", "#.#.#", "#####", "#####", "....."], 64],
  ];
  const picks = Array.from({ length: 200 }, (_, i) => faces[(i * 3) % faces.length]!);
  const results = await Promise.all(
    picks.map(([seed]) => Promise.resolve().then(() => identicon(seed))),
  );
  results.forEach((result, i) => {
    const [, rows, hue] = picks[i]!;
    assertFace(result, rows, hue);
  });
  assert.equal(new Set(results.map((result) => result.cells)).size, results.length);
});

// Extends "[concurrency-1] ...": the same seeds asked in opposite orders give
// the same results.
test("[concurrency-1] asking seeds in forward and reverse order gives the same results", () => {
  const seeds = ["a", "", "seed-14378", "usr_01HZY3K7Q8", "\ud83d", "seed-53536", "alice"];
  const forward = seeds.map((seed) => identicon(seed));
  const backward = [...seeds].reverse().map((seed) => identicon(seed)).reverse();
  assert.deepEqual(backward, forward);
});

// --- happy-7: the entry point ---

/**
 * Imported dynamically and untyped: the entry point does not re-export
 * identicon until the spec is implemented, and a static import would not
 * compile before then.
 */
async function entryPoint(): Promise<Record<string, unknown>> {
  return (await import("../../src/index.js")) as unknown as Record<string, unknown>;
}

// Extends "[happy-7] identicon from the entry point is the same function ...":
// other seeds through the entry point give the full faces.
test("[happy-7] identicon from the entry point gives the full golden and boundary faces", async () => {
  const fromEntry = (await entryPoint()).identicon as typeof identicon;
  assert.equal(typeof fromEntry, "function");
  assertFace(fromEntry(""), EMPTY_FACE, 225);
  assertFace(fromEntry("org_7f3a9c1"), [".#.#.", "#.#.#", "#####", "#####", "....."], 64);
  assertFace(fromEntry("seed-14378"), DOT_FACE, 263);
});

// Extends "[happy-7] ...": the module's only runtime export is identicon, and
// that is the very function the entry point re-exports.
test("[happy-7] the identicon module exports only identicon, the one the entry point re-exports", async () => {
  const module = (await import("../../src/identicon.js")) as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(module), ["identicon"]);
  const entry = await entryPoint();
  assert.equal(entry.identicon, module.identicon);
  assertFace((entry.identicon as typeof identicon)("a"), A_FACE, 120);
});

// --- happy-8: existing exports unchanged ---

// Extends "[happy-8] formatVersion still joins version and short sha": the
// build-info exports reached through the entry point, now that it also
// re-exports identicon, behave as before.
test("[happy-8] build-info exports through the entry point that now carries identicon behave as before", async () => {
  const entry = await entryPoint();
  assert.equal(typeof entry.identicon, "function");
  const formatVersion = entry.formatVersion as (info: BuildInfoDto) => string;
  const releaseTag = entry.releaseTag as (version: string) => string;
  assert.equal(formatVersion(identified), "1.4.2+7f3a9c1");
  assert.equal(formatVersion({ ...identified, dirty: true }), "1.4.2+7f3a9c1-dirty");
  assert.equal(releaseTag("1.0.0"), "sandbox-factory-v1.0.0");
});

// Extends "[happy-8] ...": the schemas in index.ts still behave as before
// next to identicon.
test("[happy-8] handleSchema through the entry point that now carries identicon behaves as before", async () => {
  const entry = await entryPoint();
  assert.equal(typeof entry.identicon, "function");
  const handleSchema = entry.handleSchema as {
    safeParse(input: unknown): { success: boolean; data?: unknown };
  };
  const result = handleSchema.safeParse("  FeverSoul  ");
  assert.equal(result.success, true);
  assert.equal(result.data, "feversoul");
  assert.equal(handleSchema.safeParse("no").success, false);
});
