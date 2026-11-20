import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANALYSIS_ERROR_CODES,
  ANALYSIS_STATUSES,
  ARTIFACT_KINDS,
  type AnalysisErrorCode,
  type AnalysisParams,
  type AnalysisStatus,
  type ArtifactKind,
  canonicalJson,
  expiredAnalysis,
  GRAPHIFY_TOOL_VERSION,
} from "../src/analysis.js";
import { BOUNTY_COMPLEXITIES, priceFor } from "../src/bounty.js";
import { normalizeHandle } from "../src/handle.js";
import * as core from "../src/index.js";

/**
 * The analysis domain rules from ticket #68: vocabulary constants, the
 * parameters an analysis takes, what an expired worker lease does to an
 * analysis, and the canonical JSON form its cache key is built from.
 */

const NOT_JSON = "Cache parameters must be JSON values.";

/** Asserts `fn` throws an `Error` whose message is exactly the fixed text. */
function assertNotJson(fn: () => unknown): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, NOT_JSON);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Vocabulary constants
// ---------------------------------------------------------------------------

test("[happy-1] ANALYSIS_STATUSES lists the four statuses in order", () => {
  assert.deepEqual(ANALYSIS_STATUSES, [
    "queued",
    "running",
    "succeeded",
    "failed",
  ]);
});

test("[happy-1] boundary: ANALYSIS_STATUSES has exactly four entries, starting queued and ending failed", () => {
  const statuses: readonly AnalysisStatus[] = ANALYSIS_STATUSES;
  assert.equal(statuses.length, 4);
  assert.equal(statuses[0], "queued");
  assert.equal(statuses[3], "failed");
  assert.equal(statuses[4], undefined);
});

test("[happy-2] ANALYSIS_ERROR_CODES lists the eight error codes in order", () => {
  assert.deepEqual(ANALYSIS_ERROR_CODES, [
    "too_large",
    "too_many_files",
    "source_unavailable",
    "tool_failed",
    "tool_timeout",
    "upload_failed",
    "worker_lost",
    "cancelled",
  ]);
  assert.equal(ANALYSIS_ERROR_CODES.length, 8);
});

test("[happy-2] boundary: ANALYSIS_ERROR_CODES holds each code at its listed index and nothing past index 7", () => {
  const codes: readonly AnalysisErrorCode[] = ANALYSIS_ERROR_CODES;
  const rows: ReadonlyArray<readonly [number, string]> = [
    [0, "too_large"],
    [1, "too_many_files"],
    [2, "source_unavailable"],
    [3, "tool_failed"],
    [4, "tool_timeout"],
    [5, "upload_failed"],
    [6, "worker_lost"],
    [7, "cancelled"],
  ];
  for (const [index, code] of rows) {
    assert.equal(codes[index], code);
  }
  assert.equal(codes[8], undefined);
});

test("[happy-3] ARTIFACT_KINDS lists the six artifact kinds in order", () => {
  assert.deepEqual(ARTIFACT_KINDS, [
    "graph_json",
    "graph_html",
    "report_md",
    "wiki_page",
    "manifest",
    "other",
  ]);
});

test("[happy-3] boundary: ARTIFACT_KINDS has exactly six entries, starting graph_json and ending other", () => {
  const kinds: readonly ArtifactKind[] = ARTIFACT_KINDS;
  assert.equal(kinds.length, 6);
  assert.equal(kinds[0], "graph_json");
  assert.equal(kinds[5], "other");
  assert.equal(kinds[6], undefined);
});

test("[happy-4] GRAPHIFY_TOOL_VERSION pins the Graphify driver", () => {
  assert.equal(GRAPHIFY_TOOL_VERSION, "graphifyy@0.4.18+driver-1");
});

test("[happy-4] boundary: GRAPHIFY_TOOL_VERSION is that exact string, not a near variant", () => {
  assert.equal(typeof GRAPHIFY_TOOL_VERSION, "string");
  assert.notEqual(GRAPHIFY_TOOL_VERSION, "graphify@0.4.18+driver-1");
  assert.notEqual(GRAPHIFY_TOOL_VERSION, "graphifyy@0.4.18");
  assert.notEqual(GRAPHIFY_TOOL_VERSION, " graphifyy@0.4.18+driver-1 ");
  assert.equal(GRAPHIFY_TOOL_VERSION.length, "graphifyy@0.4.18+driver-1".length);
});

test("[boundary-1] the constant arrays are not frozen", () => {
  assert.equal(Object.isFrozen(ANALYSIS_STATUSES), false);
  assert.equal(Object.isFrozen(ANALYSIS_ERROR_CODES), false);
  assert.equal(Object.isFrozen(ARTIFACT_KINDS), false);
});

test("[boundary-1] boundary: the constant arrays are Arrays, unfrozen just like the bounty constants", () => {
  assert.equal(Array.isArray(ANALYSIS_STATUSES), true);
  assert.equal(Array.isArray(ANALYSIS_ERROR_CODES), true);
  assert.equal(Array.isArray(ARTIFACT_KINDS), true);
  const bountyFrozen = Object.isFrozen(BOUNTY_COMPLEXITIES);
  assert.equal(Object.isFrozen(ANALYSIS_STATUSES), bountyFrozen);
  assert.equal(Object.isFrozen(ANALYSIS_ERROR_CODES), bountyFrozen);
  assert.equal(Object.isFrozen(ARTIFACT_KINDS), bountyFrozen);
});

test("[happy-5] the analysis exports are re-exported from the package index", () => {
  const index: Record<string, unknown> = { ...core };
  assert.equal(index["ANALYSIS_STATUSES"], ANALYSIS_STATUSES);
  assert.equal(index["ANALYSIS_ERROR_CODES"], ANALYSIS_ERROR_CODES);
  assert.equal(index["ARTIFACT_KINDS"], ARTIFACT_KINDS);
  assert.equal(index["GRAPHIFY_TOOL_VERSION"], GRAPHIFY_TOOL_VERSION);
  assert.equal(index["expiredAnalysis"], expiredAnalysis);
  assert.equal(index["canonicalJson"], canonicalJson);
});

test("[happy-5] boundary: the index still re-exports existing exports unchanged alongside the analysis ones", () => {
  const index: Record<string, unknown> = { ...core };
  assert.equal(index["normalizeHandle"], normalizeHandle);
  assert.equal(index["priceFor"], priceFor);
  assert.equal(index["BOUNTY_COMPLEXITIES"], BOUNTY_COMPLEXITIES);
  assert.equal(typeof index["canonicalJson"], "function");
  assert.equal(typeof index["expiredAnalysis"], "function");
});

// ---------------------------------------------------------------------------
// AnalysisParams
// ---------------------------------------------------------------------------

test("[happy-6] a params object with a deadline serializes as given", () => {
  const params: AnalysisParams = { deadlineMinutes: 30 };
  assert.equal(canonicalJson(params), '{"deadlineMinutes":30}');
});

test("[happy-6] boundary: a one-minute deadline serializes as given", () => {
  const params: AnalysisParams = { deadlineMinutes: 1 };
  assert.equal(canonicalJson(params), '{"deadlineMinutes":1}');
});

test("[unhappy-1] nothing in the seam rejects an out-of-range deadline", () => {
  const rows: ReadonlyArray<readonly [number, string]> = [
    [0, '{"deadlineMinutes":0}'],
    [-5, '{"deadlineMinutes":-5}'],
    [2.5, '{"deadlineMinutes":2.5}'],
    [Number.NaN, '{"deadlineMinutes":null}'],
    [Number.POSITIVE_INFINITY, '{"deadlineMinutes":null}'],
  ];
  for (const [minutes, json] of rows) {
    const params: AnalysisParams = { deadlineMinutes: minutes };
    assert.equal(canonicalJson(params), json, `deadlineMinutes ${minutes}`);
  }
});

test("[unhappy-1] boundary: -Infinity and -0 deadlines are written as JSON.stringify writes them", () => {
  const negInf: AnalysisParams = { deadlineMinutes: Number.NEGATIVE_INFINITY };
  assert.equal(canonicalJson(negInf), '{"deadlineMinutes":null}');
  const negZero: AnalysisParams = { deadlineMinutes: -0 };
  assert.equal(canonicalJson(negZero), '{"deadlineMinutes":0}');
});

// ---------------------------------------------------------------------------
// expiredAnalysis: re-queue below the limit
// ---------------------------------------------------------------------------

test("[happy-7] an expired analysis below the limit is re-queued with the next attempt", () => {
  const rows: ReadonlyArray<readonly [number, number, number]> = [
    [1, 3, 2],
    [2, 3, 3],
    [1, 2, 2],
    [0, 1, 1],
  ];
  for (const [attempt, maxAttempts, next] of rows) {
    assert.deepEqual(
      expiredAnalysis(attempt, maxAttempts),
      { status: "queued", attempt: next },
      `expiredAnalysis(${attempt}, ${maxAttempts})`,
    );
  }
});

test("[happy-7] boundary: the last attempt just below a large limit is still re-queued", () => {
  assert.deepEqual(expiredAnalysis(9, 10), { status: "queued", attempt: 10 });
});

test("[happy-8] a three-attempt analysis walks through its attempts and then fails", () => {
  const maxAttempts = 3;
  const first = expiredAnalysis(1, maxAttempts);
  const second = expiredAnalysis(first.attempt, maxAttempts);
  const third = expiredAnalysis(second.attempt, maxAttempts);
  assert.deepEqual(
    [first, second, third],
    [
      { status: "queued", attempt: 2 },
      { status: "queued", attempt: 3 },
      { status: "failed", attempt: 3 },
    ],
  );
});

test("[happy-8] boundary: a one-attempt analysis started at 0 is queued once and then fails", () => {
  const first = expiredAnalysis(0, 1);
  const second = expiredAnalysis(first.attempt, 1);
  assert.deepEqual(
    [first, second],
    [
      { status: "queued", attempt: 1 },
      { status: "failed", attempt: 1 },
    ],
  );
});

// ---------------------------------------------------------------------------
// expiredAnalysis: fail at or above the limit
// ---------------------------------------------------------------------------

test("[boundary-2] exactly maxAttempts attempts used fails, it is not retried", () => {
  assert.deepEqual(expiredAnalysis(3, 3), { status: "failed", attempt: 3 });
});

test("[boundary-2] boundary: a single allowed attempt, once used, fails", () => {
  assert.deepEqual(expiredAnalysis(1, 1), { status: "failed", attempt: 1 });
});

test("[boundary-3] more attempts than allowed also fails, with the attempt unchanged", () => {
  assert.deepEqual(expiredAnalysis(5, 3), { status: "failed", attempt: 5 });
});

test("[boundary-3] boundary: one attempt over the limit fails with that attempt", () => {
  assert.deepEqual(expiredAnalysis(4, 3), { status: "failed", attempt: 4 });
});

test("[happy-9] the result has exactly the keys status and attempt", () => {
  assert.deepEqual(Object.keys(expiredAnalysis(1, 3)), ["status", "attempt"]);
});

test("[happy-9] boundary: a failed result also has exactly the keys status and attempt", () => {
  assert.deepEqual(Object.keys(expiredAnalysis(3, 3)), ["status", "attempt"]);
});

test("[boundary-4] each call returns a new object", () => {
  const a = expiredAnalysis(1, 3);
  const b = expiredAnalysis(1, 3);
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
});

test("[boundary-4] boundary: failed results are new objects too, so changing one leaves the next untouched", () => {
  const a = expiredAnalysis(3, 3);
  const b = expiredAnalysis(3, 3);
  assert.notEqual(a, b);
  a.attempt = 99;
  assert.deepEqual(b, { status: "failed", attempt: 3 });
  assert.deepEqual(expiredAnalysis(3, 3), { status: "failed", attempt: 3 });
});

// ---------------------------------------------------------------------------
// expiredAnalysis: no validation
// ---------------------------------------------------------------------------

test("[unhappy-2] unusual inputs are neither rejected nor clamped", () => {
  const rows: ReadonlyArray<
    readonly [number, number, "queued" | "failed", number]
  > = [
    [1, 0, "failed", 1],
    [0, 0, "failed", 0],
    [-1, 0, "queued", 0],
    [1, -2, "failed", 1],
    [1.5, 2, "queued", 2.5],
    [2, 2.5, "queued", 3],
    [1, Number.NaN, "failed", 1],
    [Number.NaN, 3, "failed", Number.NaN],
    [1, Number.POSITIVE_INFINITY, "queued", 2],
  ];
  for (const [attempt, maxAttempts, status, result] of rows) {
    assert.deepEqual(
      expiredAnalysis(attempt, maxAttempts),
      { status, attempt: result },
      `expiredAnalysis(${attempt}, ${maxAttempts})`,
    );
  }
});

test("[unhappy-2] boundary: infinite attempts are compared and incremented as plain numbers", () => {
  assert.deepEqual(expiredAnalysis(Number.NEGATIVE_INFINITY, 3), {
    status: "queued",
    attempt: Number.NEGATIVE_INFINITY,
  });
  assert.deepEqual(
    expiredAnalysis(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    { status: "failed", attempt: Number.POSITIVE_INFINITY },
  );
});

// ---------------------------------------------------------------------------
// canonicalJson: primitives
// ---------------------------------------------------------------------------

test("[happy-10] primitives are written exactly as JSON.stringify writes them", () => {
  const rows: ReadonlyArray<readonly [unknown, string]> = [
    [null, "null"],
    [true, "true"],
    [false, "false"],
    [0, "0"],
    [-0, "0"],
    [42, "42"],
    [0.1, "0.1"],
    [1e21, "1e+21"],
    ["abc", '"abc"'],
    ["", '""'],
    ['a"b', '"a\\"b"'],
    ["line\nbreak", '"line\\nbreak"'],
  ];
  for (const [value, json] of rows) {
    assert.equal(canonicalJson(value), json, `canonicalJson(${String(value)})`);
  }
});

test("[happy-10] boundary: control characters and lone surrogates are escaped as JSON.stringify escapes them", () => {
  for (const value of ["\u0000", "\t\\", "\ud800", "x\udfffy", "😀"]) {
    assert.equal(canonicalJson(value), JSON.stringify(value));
  }
});

test("[boundary-5] non-finite numbers become null", () => {
  for (const value of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    assert.equal(canonicalJson(value), "null");
  }
});

test("[boundary-5] boundary: non-finite numbers inside an array become null", () => {
  assert.equal(
    canonicalJson([Number.NaN, Number.NEGATIVE_INFINITY]),
    "[null,null]",
  );
});

test("[unhappy-3] a bigint throws JSON.stringify's TypeError at any depth", () => {
  for (const value of [1n, { a: 1n }, [1n]]) {
    assert.throws(() => canonicalJson(value), TypeError);
  }
});

test("[unhappy-3] boundary: a zero bigint deep inside arrays and objects throws a TypeError", () => {
  assert.throws(() => canonicalJson(0n), TypeError);
  assert.throws(() => canonicalJson({ a: [{ b: [0n] }] }), TypeError);
});

// ---------------------------------------------------------------------------
// canonicalJson: key order and whitespace
// ---------------------------------------------------------------------------

test("[happy-11] key order in the input does not change the output", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalJson({ a: 2, b: 1 }), '{"a":2,"b":1}');
});

test("[happy-11] boundary: every insertion order of three keys gives the same output", () => {
  const orders = [
    { a: 1, b: 2, c: 3 },
    { a: 1, c: 3, b: 2 },
    { b: 2, a: 1, c: 3 },
    { b: 2, c: 3, a: 1 },
    { c: 3, a: 1, b: 2 },
    { c: 3, b: 2, a: 1 },
  ];
  for (const value of orders) {
    assert.equal(canonicalJson(value), '{"a":1,"b":2,"c":3}');
  }
});

test("[happy-12] nested objects are sorted too, including objects inside arrays", () => {
  assert.equal(
    canonicalJson({ z: { y: 1, x: [{ b: true, a: null }] }, a: "s" }),
    '{"a":"s","z":{"x":[{"a":null,"b":true}],"y":1}}',
  );
});

test("[happy-12] boundary: objects inside arrays inside arrays are sorted", () => {
  assert.equal(
    canonicalJson([[{ d: { f: 1, e: 2 }, c: 0 }]]),
    '[[{"c":0,"d":{"e":2,"f":1}}]]',
  );
});

test("[boundary-6] empty containers", () => {
  assert.equal(canonicalJson({}), "{}");
  assert.equal(canonicalJson([]), "[]");
});

test("[boundary-6] boundary: empty containers nested in containers", () => {
  assert.equal(canonicalJson({ b: [], a: {} }), '{"a":{},"b":[]}');
  assert.equal(canonicalJson([[], {}]), "[[],{}]");
});

test("[boundary-7] keys sort by UTF-16 code unit, not by number, locale or code point", () => {
  assert.equal(canonicalJson({ a: 1, B: 2 }), '{"B":2,"a":1}');
  assert.equal(
    canonicalJson({ "2": "two", "10": "ten" }),
    '{"10":"ten","2":"two"}',
  );
  assert.equal(canonicalJson({ "ｚ": 1, "😀": 2 }), '{"😀":2,"ｚ":1}');
  assert.equal(canonicalJson({ "é": 1, z: 2 }), '{"z":2,"é":1}');
});

test("[boundary-7] boundary: the empty key and prefixes sort first", () => {
  assert.equal(
    canonicalJson({ aa: 1, a: 2, "": 3, "1": 4 }),
    '{"":3,"1":4,"a":2,"aa":1}',
  );
});

test("[boundary-8] keys are escaped as JSON strings", () => {
  assert.equal(canonicalJson({ 'q"k': 1 }), '{"q\\"k":1}');
});

test("[boundary-8] boundary: keys with newlines and backslashes are escaped as JSON.stringify escapes them", () => {
  assert.equal(canonicalJson({ "a\nb": 1 }), `{${JSON.stringify("a\nb")}:1}`);
  assert.equal(canonicalJson({ "\\": 1 }), '{"\\\\":1}');
});

test("[happy-13] the input object is not mutated", () => {
  const input = { b: 1, a: { d: 2, c: 3 } };
  canonicalJson(input);
  assert.deepEqual(Object.keys(input), ["b", "a"]);
  assert.deepEqual(Object.keys(input.a), ["d", "c"]);
});

test("[happy-13] boundary: arrays and objects inside arrays keep their order after the call", () => {
  const input = { z: [3, 1, 2], y: [{ b: 1, a: 2 }] };
  canonicalJson(input);
  assert.deepEqual(Object.keys(input), ["z", "y"]);
  assert.deepEqual(input.z, [3, 1, 2]);
  assert.deepEqual(Object.keys(input.y[0] ?? {}), ["b", "a"]);
});

// ---------------------------------------------------------------------------
// canonicalJson: arrays
// ---------------------------------------------------------------------------

test("[happy-14] arrays are not sorted", () => {
  const unsorted = canonicalJson([3, 1, 2]);
  const sorted = canonicalJson([1, 2, 3]);
  assert.equal(unsorted, "[3,1,2]");
  assert.equal(sorted, "[1,2,3]");
  assert.notEqual(unsorted, sorted);
});

test("[happy-14] boundary: arrays of strings keep reverse order", () => {
  assert.equal(canonicalJson(["b", "a"]), '["b","a"]');
  assert.notEqual(canonicalJson(["b", "a"]), canonicalJson(["a", "b"]));
});

test("[happy-15] mixed arrays canonicalize each element in place", () => {
  assert.equal(
    canonicalJson([{ b: 1, a: 2 }, "x", null, [false]]),
    '[{"a":2,"b":1},"x",null,[false]]',
  );
});

test("[happy-15] boundary: a single-element array holding an unsorted object", () => {
  assert.equal(canonicalJson([{ y: [2, 1], x: "" }]), '[{"x":"","y":[2,1]}]');
});

// ---------------------------------------------------------------------------
// canonicalJson: undefined, functions and symbols
// ---------------------------------------------------------------------------

test("[unhappy-4] a non-JSON value throws an Error with a fixed message", () => {
  const values: unknown[] = [
    undefined,
    () => 1,
    Symbol("s"),
    { a: 1, b: undefined },
    { nested: { f() {} } },
    { s: Symbol("s") },
    [1, undefined],
    [() => 1],
    [Symbol("s")],
    { toJSON: () => "x" },
  ];
  for (const value of values) {
    assertNotJson(() => canonicalJson(value));
  }
});

test("[unhappy-4] boundary: a non-JSON value deep inside arrays and objects throws the same Error", () => {
  assertNotJson(() => canonicalJson({ a: [{ b: [1, undefined] }] }));
  assertNotJson(() => canonicalJson([[{ c: Symbol("deep") }]]));
  assertNotJson(() => canonicalJson({ z: { y: { x: () => 0 } } }));
});

test("[unhappy-5] an undefined property is not dropped the way JSON.stringify drops it", () => {
  assert.equal(JSON.stringify({ a: 1, b: undefined }), '{"a":1}');
  assertNotJson(() => canonicalJson({ a: 1, b: undefined }));
});

test("[unhappy-5] boundary: an object whose only property is undefined throws instead of giving {}", () => {
  assert.equal(JSON.stringify({ only: undefined }), "{}");
  assertNotJson(() => canonicalJson({ only: undefined }));
});

// ---------------------------------------------------------------------------
// canonicalJson: sparse arrays
// ---------------------------------------------------------------------------

test("[boundary-9] sparse array holes are skipped, not read as undefined", () => {
  assert.equal(canonicalJson([1, , 3]), "[1,,3]");
  assert.equal(canonicalJson([1, ,]), "[1,]");
  assert.equal(canonicalJson(new Array(2)), "[,]");
  assert.equal(canonicalJson({ a: [, 1] }), '{"a":[,1]}');
});

test("[boundary-9] boundary: arrays made only of holes write only commas", () => {
  assert.equal(canonicalJson(new Array(3)), "[,,]");
  assert.equal(canonicalJson(new Array(1)), "[]");
});

// ---------------------------------------------------------------------------
// canonicalJson: non-plain objects
// ---------------------------------------------------------------------------

test("[boundary-10] non-plain objects are read as records of their own enumerable string keys", () => {
  assert.equal(canonicalJson(new Date(0)), "{}");
  assert.equal(canonicalJson(new Map([["a", 1]])), "{}");
  assert.equal(canonicalJson(new Set([1])), "{}");
  assert.equal(
    canonicalJson(
      new (class {
        x = 1;
        toJSON(): string {
          return "t";
        }
      })(),
    ),
    '{"x":1}',
  );
  assert.equal(canonicalJson(Object.create({ inherited: 1 })), "{}");
});

test("[boundary-10] boundary: a Date with an own property and a null-prototype object are read by their own keys", () => {
  const date = Object.assign(new Date(0), { x: 1 });
  assert.equal(canonicalJson(date), '{"x":1}');
  const bare = Object.create(null) as Record<string, number>;
  bare["b"] = 1;
  bare["a"] = 2;
  assert.equal(canonicalJson(bare), '{"a":2,"b":1}');
});

test("[boundary-11] symbol keys and non-enumerable keys are left out", () => {
  const input = { a: 1, [Symbol("s")]: 2 };
  Object.defineProperty(input, "hidden", { value: 3, enumerable: false });
  assert.equal(canonicalJson(input), '{"a":1}');
});

test("[boundary-11] boundary: ignored keys are not checked, so non-JSON values behind them do not throw", () => {
  const input: Record<PropertyKey, unknown> = { [Symbol("only")]: 1 };
  Object.defineProperty(input, "fn", { value: () => 1, enumerable: false });
  Object.defineProperty(input, "u", { value: undefined, enumerable: false });
  input[Symbol("f")] = () => 2;
  assert.equal(canonicalJson(input), "{}");
});

// ---------------------------------------------------------------------------
// canonicalJson: cycles
// ---------------------------------------------------------------------------

test("[unhappy-6] a cyclic value overflows the stack", () => {
  const input: { a: number; self?: unknown } = { a: 1 };
  input.self = input;
  assert.throws(() => canonicalJson(input), RangeError);
});

test("[unhappy-6] boundary: a cycle through an array also throws a RangeError", () => {
  const list: unknown[] = [];
  list.push({ list });
  assert.throws(() => canonicalJson(list), RangeError);
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

test("[happy-16] repeated calls with equal inputs give equal results", () => {
  const params = { deadlineMinutes: 30 };
  assert.equal(canonicalJson(params), '{"deadlineMinutes":30}');
  assert.equal(canonicalJson(params), '{"deadlineMinutes":30}');
  assert.deepEqual(expiredAnalysis(2, 3), { status: "queued", attempt: 3 });
  assert.deepEqual(expiredAnalysis(2, 3), { status: "queued", attempt: 3 });
});

test("[happy-16] boundary: separately built equal inputs give equal results", () => {
  const first: AnalysisParams = { deadlineMinutes: 30 };
  const second: AnalysisParams = { deadlineMinutes: 30 };
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.deepEqual(expiredAnalysis(3, 3), expiredAnalysis(3, 3));
  assert.deepEqual(expiredAnalysis(3, 3), { status: "failed", attempt: 3 });
});
