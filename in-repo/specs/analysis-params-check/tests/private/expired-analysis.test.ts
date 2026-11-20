import assert from "node:assert/strict";
import { test } from "node:test";

import { expiredAnalysis } from "../../src/analysis.js";

/**
 * What an expired worker lease does to an analysis: re-queued with
 * `attempt + 1` while `attempt < maxAttempts`, otherwise failed with the
 * attempt unchanged, with no validation of either argument.
 */

type Row = readonly [number, number, "queued" | "failed", number];

function assertRows(rows: readonly Row[]): void {
  for (const [attempt, maxAttempts, status, result] of rows) {
    assert.deepEqual(
      expiredAnalysis(attempt, maxAttempts),
      { status, attempt: result },
      `expiredAnalysis(${attempt}, ${maxAttempts})`,
    );
  }
}

// Extends "[happy-7] an expired analysis below the limit is re-queued with the next attempt":
// limits and attempts the public rows do not use, so a lookup table fails.
test("[happy-7] re-queue below other limits carries attempt + 1", () => {
  assertRows([
    [1, 5, "queued", 2],
    [4, 5, "queued", 5],
    [0, 3, "queued", 1],
    [2, 4, "queued", 3],
    [6, 7, "queued", 7],
    [1, 100, "queued", 2],
    [50, 100, "queued", 51],
    [99, 100, "queued", 100],
    [999, 1000, "queued", 1000],
    [0, 2, "queued", 1],
  ]);
});

// Extends "[happy-7] boundary: the last attempt just below a large limit is still re-queued":
// every attempt below a limit of 20 is re-queued with the next number.
test("[happy-7] every attempt from 0 to 19 below a limit of 20 is re-queued with the next number", () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.deepEqual(expiredAnalysis(attempt, 20), {
      status: "queued",
      attempt: attempt + 1,
    });
  }
});

// Extends "[happy-8] a three-attempt analysis walks through its attempts and then fails":
// a five-attempt analysis started at 1.
test("[happy-8] a five-attempt analysis walks from 1 through 5 and then fails at 5", () => {
  const results: Array<{ status: string; attempt: number }> = [];
  let attempt = 1;
  for (let step = 0; step < 5; step += 1) {
    const result = expiredAnalysis(attempt, 5);
    results.push(result);
    attempt = result.attempt;
  }
  assert.deepEqual(results, [
    { status: "queued", attempt: 2 },
    { status: "queued", attempt: 3 },
    { status: "queued", attempt: 4 },
    { status: "queued", attempt: 5 },
    { status: "failed", attempt: 5 },
  ]);
});

// Extends "[happy-8] a three-attempt analysis walks through its attempts and then fails":
// once failed, feeding the attempt back keeps failing with the same attempt.
test("[happy-8] a two-attempt analysis started at 0 is queued twice and then keeps failing at 2", () => {
  const first = expiredAnalysis(0, 2);
  const second = expiredAnalysis(first.attempt, 2);
  const third = expiredAnalysis(second.attempt, 2);
  const fourth = expiredAnalysis(third.attempt, 2);
  assert.deepEqual(
    [first, second, third, fourth],
    [
      { status: "queued", attempt: 1 },
      { status: "queued", attempt: 2 },
      { status: "failed", attempt: 2 },
      { status: "failed", attempt: 2 },
    ],
  );
});

// Extends "[boundary-2] exactly maxAttempts attempts used fails, it is not retried":
// other equal pairs, so `<=` or a special case for 3 fails.
test("[boundary-2] attempt equal to other limits fails with that attempt", () => {
  assertRows([
    [2, 2, "failed", 2],
    [5, 5, "failed", 5],
    [10, 10, "failed", 10],
    [100, 100, "failed", 100],
    [1000, 1000, "failed", 1000],
    [2.5, 2.5, "failed", 2.5],
  ]);
});

// Extends "[boundary-3] more attempts than allowed also fails, with the attempt unchanged":
// the attempt is never clamped to the limit or incremented.
test("[boundary-3] attempts well past the limit fail with the attempt unchanged", () => {
  assertRows([
    [100, 3, "failed", 100],
    [2, 1, "failed", 2],
    [11, 10, "failed", 11],
    [7, 2, "failed", 7],
    [Number.MAX_SAFE_INTEGER, 3, "failed", Number.MAX_SAFE_INTEGER],
  ]);
});

// Extends "[happy-9] the result has exactly the keys status and attempt":
// the same two keys, in that order, for every path through the function.
test("[happy-9] queued, failed and NaN results all have exactly the keys status and attempt", () => {
  const inputs: ReadonlyArray<readonly [number, number]> = [
    [0, 1],
    [9, 10],
    [5, 3],
    [0, 0],
    [-1, 0],
    [Number.NaN, 3],
    [1, Number.NaN],
  ];
  for (const [attempt, maxAttempts] of inputs) {
    const result = expiredAnalysis(attempt, maxAttempts);
    assert.deepEqual(
      Object.keys(result),
      ["status", "attempt"],
      `expiredAnalysis(${attempt}, ${maxAttempts})`,
    );
    assert.equal(typeof result.status, "string");
    assert.equal(typeof result.attempt, "number");
  }
});

// Extends "[boundary-4] each call returns a new object": across six calls,
// repeated and different inputs alike, no result object is handed out twice.
test("[boundary-4] six calls with repeated and different inputs return six distinct objects", () => {
  const seen = new Set<object>();
  for (const [attempt, maxAttempts] of [
    [1, 3],
    [1, 3],
    [2, 3],
    [3, 3],
    [3, 3],
    [4, 3],
  ] as const) {
    const result = expiredAnalysis(attempt, maxAttempts);
    assert.equal(seen.has(result), false);
    seen.add(result);
  }
  assert.equal(seen.size, 6);
});

// Extends "[unhappy-2] unusual inputs are neither rejected nor clamped":
// other negative, fractional and non-finite combinations.
test("[unhappy-2] other negative, fractional and non-finite inputs are compared and incremented as given", () => {
  assertRows([
    [-5, 0, "queued", -4],
    [-3, -2, "queued", -2],
    [-2, -2, "failed", -2],
    [-1, -2, "failed", -1],
    [0, -1, "failed", 0],
    [0.5, 1, "queued", 1.5],
    [2.5, 3, "queued", 3.5],
    [3, 2.5, "failed", 3],
    [2.75, 2.5, "failed", 2.75],
    [0, 0.5, "queued", 1],
    [Number.NaN, Number.NaN, "failed", Number.NaN],
    [Number.NaN, Number.POSITIVE_INFINITY, "failed", Number.NaN],
    [1000, Number.POSITIVE_INFINITY, "queued", 1001],
    [5, Number.NEGATIVE_INFINITY, "failed", 5],
    [Number.POSITIVE_INFINITY, 3, "failed", Number.POSITIVE_INFINITY],
    [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "failed",
      Number.NEGATIVE_INFINITY,
    ],
  ]);
});

// Extends "[unhappy-2] unusual inputs are neither rejected nor clamped":
// the + 1 is a plain number addition, with its floating point results.
test("[unhappy-2] the increment is plain floating point addition", () => {
  assert.deepEqual(expiredAnalysis(0.1, 2), { status: "queued", attempt: 0.1 + 1 });
  assert.deepEqual(expiredAnalysis(2 ** 53, Number.POSITIVE_INFINITY), {
    status: "queued",
    attempt: 2 ** 53,
  });
  assert.deepEqual(expiredAnalysis(-0.5, 0), { status: "queued", attempt: 0.5 });
});

// Extends "[unhappy-2] unusual inputs are neither rejected nor clamped":
// a failed result keeps -0 exactly; a queued one adds 1 to it.
test("[unhappy-2] a -0 attempt is kept as -0 when failed and becomes 1 when queued", () => {
  const failed = expiredAnalysis(-0, 0);
  assert.equal(failed.status, "failed");
  assert.equal(Object.is(failed.attempt, -0), true);
  assert.deepEqual(expiredAnalysis(-0, 1), { status: "queued", attempt: 1 });
});

// Extends "[happy-16] repeated calls with equal inputs give equal results":
// interleaved calls do not affect each other.
test("[happy-16] interleaved expiredAnalysis calls each depend only on their own arguments", () => {
  const sequence: ReadonlyArray<readonly [number, number]> = [
    [2, 3],
    [3, 3],
    [2, 3],
    [0, 1],
    [2, 3],
    [7, 3],
    [2, 3],
  ];
  const results = sequence.map(([a, m]) => expiredAnalysis(a, m));
  assert.deepEqual(results, [
    { status: "queued", attempt: 3 },
    { status: "failed", attempt: 3 },
    { status: "queued", attempt: 3 },
    { status: "queued", attempt: 1 },
    { status: "queued", attempt: 3 },
    { status: "failed", attempt: 7 },
    { status: "queued", attempt: 3 },
  ]);
});
