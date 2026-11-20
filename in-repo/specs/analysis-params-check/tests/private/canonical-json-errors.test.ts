import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalJson } from "../../src/analysis.js";

/**
 * What canonicalJson rejects: bigints with JSON.stringify's own TypeError,
 * undefined, functions and symbols with one fixed Error at any depth, and
 * cyclic values with the engine's stack overflow RangeError.
 */

const NOT_JSON = "Cache parameters must be JSON values.";

/** Asserts `fn` throws an `Error` whose message is exactly the fixed text. */
function assertNotJson(fn: () => unknown, label = ""): void {
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(error instanceof Error, label);
      assert.equal(error.message, NOT_JSON, label);
      return true;
    },
    label,
  );
}

/** The TypeError JSON.stringify itself throws for a bigint. */
function bigintError(): TypeError {
  try {
    JSON.stringify(1n);
  } catch (error) {
    assert.ok(error instanceof TypeError);
    return error;
  }
  assert.fail("JSON.stringify(1n) did not throw");
}

/** Asserts `fn` throws a TypeError with JSON.stringify's bigint message. */
function assertBigintError(fn: () => unknown, label = ""): void {
  const expected = bigintError();
  assert.throws(
    fn,
    (error: unknown) => {
      assert.ok(error instanceof TypeError, label);
      assert.equal(error.message, expected.message, label);
      return true;
    },
    label,
  );
}

/** The RangeError the engine throws when unbounded recursion overflows the stack. */
function stackOverflowError(): RangeError {
  const recurse = (depth: number): number => recurse(depth + 1) + 1;
  try {
    recurse(0);
  } catch (error) {
    assert.ok(error instanceof RangeError);
    return error;
  }
  assert.fail("unbounded recursion did not throw");
}

/** Asserts `fn` throws the engine's stack overflow RangeError. */
function assertStackOverflow(fn: () => unknown): void {
  const expected = stackOverflowError();
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof RangeError);
    assert.equal(error.message, expected.message);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Bigints
// ---------------------------------------------------------------------------

// Extends "[unhappy-3] a bigint throws JSON.stringify's TypeError at any depth":
// the error is JSON.stringify's own TypeError, message and all, not any TypeError.
test("[unhappy-3] a bigint throws a TypeError with the message JSON.stringify gives", () => {
  for (const value of [1n, -5n, 2n ** 64n, { a: 1n }, [1n], [0, { b: [2n] }]]) {
    assertBigintError(() => canonicalJson(value), String(typeof value));
  }
});

// Extends "[unhappy-3] boundary: a zero bigint deep inside arrays and objects throws a TypeError":
// a bigint behind sorted keys and after holes is still reached.
test("[unhappy-3] a bigint after other keys, after holes and deep in a large value throws JSON.stringify's TypeError", () => {
  // eslint-disable-next-line no-sparse-arrays
  assertBigintError(() => canonicalJson([, , 3n]));
  assertBigintError(() => canonicalJson({ a: 1, b: "x", c: [null, true], z: { y: { x: 10n } } }));
  const big = Array.from({ length: 100 }, (_, index) => ({ index }));
  assertBigintError(() => canonicalJson([...big, { last: 7n }]));
});

// ---------------------------------------------------------------------------
// undefined, functions and symbols
// ---------------------------------------------------------------------------

// Extends "[unhappy-4] a non-JSON value throws an Error with a fixed message":
// other kinds of function at the top level and as values.
test("[unhappy-4] classes, async, generator, bound and built-in functions throw the fixed Error", () => {
  class Thing {}
  const values: unknown[] = [
    Thing,
    async () => 1,
    function* gen() {
      yield 1;
    },
    function named() {
      return 1;
    }.bind(null),
    Math.max,
    Object,
    Symbol.iterator,
    Symbol.for("registered"),
    Symbol(),
  ];
  for (const value of values) {
    assertNotJson(() => canonicalJson(value), String(typeof value));
    assertNotJson(() => canonicalJson({ v: value }), "as property");
    assertNotJson(() => canonicalJson([value]), "as element");
  }
});

// Extends "[unhappy-4] boundary: a non-JSON value deep inside arrays and objects throws the same Error":
// a non-JSON value as the last element, the last sorted key, and beside valid values.
test("[unhappy-4] a non-JSON value after many valid values, at any position, throws the fixed Error", () => {
  assertNotJson(() => canonicalJson([1, 2, 3, 4, 5, undefined]));
  assertNotJson(() => canonicalJson([undefined, 1, 2]));
  assertNotJson(() => canonicalJson({ a: 1, b: 2, c: 3, zz: undefined }));
  assertNotJson(() => canonicalJson({ zz: 1, a: () => 1 }));
  assertNotJson(() => canonicalJson({ a: [{}, [], { b: [null, { c: Symbol("x") }] }] }));
  // eslint-disable-next-line no-sparse-arrays
  assertNotJson(() => canonicalJson([, , undefined]));
  const deep: Record<string, unknown> = {};
  let cursor = deep;
  for (let depth = 0; depth < 50; depth += 1) {
    const next: Record<string, unknown> = {};
    cursor["k"] = next;
    cursor = next;
  }
  cursor["leaf"] = undefined;
  assertNotJson(() => canonicalJson(deep));
});

// Extends "[unhappy-4] a non-JSON value throws": an own enumerable toJSON
// function throws wherever it sits, rather than being called.
test("[unhappy-4] an own enumerable toJSON function throws at any depth and is never called", () => {
  let called = 0;
  const toJSON = (): string => {
    called += 1;
    return "x";
  };
  assertNotJson(() => canonicalJson({ toJSON, a: 1 }));
  assertNotJson(() => canonicalJson({ nested: { toJSON } }));
  assertNotJson(() => canonicalJson([{ toJSON }]));
  const date = Object.assign(new Date(0), { toJSON });
  assertNotJson(() => canonicalJson(date));
  assert.equal(called, 0);
});

// Extends "[unhappy-4] a non-JSON value throws": a non-JSON value inside a
// non-plain object's own enumerable property also throws.
test("[unhappy-4] a function or undefined own property of a class instance or Map throws the fixed Error", () => {
  class Holder {
    callback = (): number => 1;
  }
  assertNotJson(() => canonicalJson(new Holder()));
  const map = Object.assign(new Map(), { missing: undefined });
  assertNotJson(() => canonicalJson(map));
});

// Extends "[unhappy-5] an undefined property is not dropped the way JSON.stringify drops it":
// function and symbol properties, which JSON.stringify also drops, throw too.
test("[unhappy-5] function and symbol properties JSON.stringify drops throw instead", () => {
  const withFunction = { a: 1, f: () => 1 };
  const withSymbol = { a: 1, s: Symbol("s") };
  assert.equal(JSON.stringify(withFunction), '{"a":1}');
  assert.equal(JSON.stringify(withSymbol), '{"a":1}');
  assertNotJson(() => canonicalJson(withFunction));
  assertNotJson(() => canonicalJson(withSymbol));
});

// Extends "[unhappy-5] an undefined property is not dropped": undefined
// properties nested, sorted first, and among many keys all throw.
test("[unhappy-5] undefined properties nested, sorted first or among many keys throw instead of being dropped", () => {
  const cases: unknown[] = [
    { "": undefined, a: 1 },
    { z: 1, y: 2, x: 3, w: 4, a: undefined },
    { outer: { inner: { a: 1, b: undefined } } },
    [{ a: 1, b: undefined }],
  ];
  for (const value of cases) {
    assert.notEqual(JSON.stringify(value), undefined);
    assertNotJson(() => canonicalJson(value));
  }
  const params: { deadlineMinutes?: number } = { deadlineMinutes: undefined };
  assert.equal(JSON.stringify(params), "{}");
  assertNotJson(() => canonicalJson(params));
});

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

// Extends "[unhappy-6] a cyclic value overflows the stack": the RangeError is
// the engine's stack overflow, not a RangeError from a cycle check.
test("[unhappy-6] a self-referencing object throws the engine's stack overflow RangeError", () => {
  const input: { a: number; self?: unknown } = { a: 1 };
  input.self = input;
  assertStackOverflow(() => canonicalJson(input));
});

// Extends "[unhappy-6] boundary: a cycle through an array also throws a RangeError":
// longer cycles through several objects and arrays.
test("[unhappy-6] cycles through several objects and arrays throw the engine's stack overflow RangeError", () => {
  const a: Record<string, unknown> = { name: "a" };
  const b: Record<string, unknown> = { name: "b" };
  const c: unknown[] = [b];
  a["next"] = b;
  b["next"] = c;
  c.push(a);
  assertStackOverflow(() => canonicalJson(a));
  const self: unknown[] = [1];
  self.push(self);
  assertStackOverflow(() => canonicalJson(self));
  assertStackOverflow(() => canonicalJson({ wrapper: [a] }));
});

// Extends "[unhappy-6] a cyclic value overflows the stack": with no cycle
// detection, an object shared by two branches is not a cycle and is written twice.
test("[unhappy-6] a shared but acyclic object is written in every place it appears", () => {
  const shared = { y: 2, x: 1 };
  const list = [shared, shared];
  assert.equal(
    canonicalJson({ b: shared, a: shared, c: list, d: [list, list] }),
    '{"a":{"x":1,"y":2},"b":{"x":1,"y":2},"c":[{"x":1,"y":2},{"x":1,"y":2}],"d":[[{"x":1,"y":2},{"x":1,"y":2}],[{"x":1,"y":2},{"x":1,"y":2}]]}',
  );
});
