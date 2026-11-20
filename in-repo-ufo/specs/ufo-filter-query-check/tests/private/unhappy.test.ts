import { expect, test } from "vitest";
import { filterQuery } from "../../src/utils";

type Value = string | string[];

function recorder(returns: boolean | ((key: string, value: Value) => boolean)) {
  const calls: unknown[][] = [];
  const predicate = (...args: [string, Value]) => {
    calls.push(args);
    return typeof returns === "function" ? returns(...args) : returns;
  };
  return { calls, predicate };
}

// @unhappy 1: Prototype-polluting keys

// Extends "[unhappy-1] __proto__ is removed and never passed to the predicate": both keys together, other positions
test("[unhappy-1] __proto__ and constructor are both removed among other keys", () => {
  const { calls, predicate } = recorder(true);
  expect(
    filterQuery("/foo?a=1&constructor=2&__proto__=3&b=4", predicate),
  ).toBe("/foo?a=1&b=4");
  expect(calls).toEqual([
    ["a", "1"],
    ["b", "4"],
  ]);
});

// Extends "[unhappy-1] __proto__ is removed": key spelled with percent-encoding
test("[unhappy-1] percent-encoded __proto__ and constructor are removed too", () => {
  const { calls, predicate } = recorder(true);
  expect(
    filterQuery("/foo?__pro%74o__=1&con%73tructor=2&x=3", predicate),
  ).toBe("/foo?x=3");
  expect(calls).toEqual([["x", "3"]]);
});

// Extends "[unhappy-1] a lone constructor key leaves no query": repeated, full URL with hash
test("[unhappy-1] repeated prototype keys leave no query in a full URL", () => {
  const { calls, predicate } = recorder(true);
  expect(
    filterQuery(
      "http://foo.com/p?__proto__=1&__proto__=2&constructor=3#h",
      predicate,
    ),
  ).toBe("http://foo.com/p#h");
  expect(calls).toHaveLength(0);
});

test("[unhappy-1] valueless __proto__ is removed", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?__proto__&y", predicate)).toBe("/foo?y");
  expect(calls).toEqual([["y", ""]]);
});

test("[unhappy-1] only the two named keys are removed; look-alike keys are passed on", () => {
  const { calls, predicate } = recorder(true);
  expect(
    filterQuery(
      "/foo?toString=1&hasOwnProperty=2&prototype=3&Constructor=4",
      predicate,
    ),
  ).toBe("/foo?toString=1&hasOwnProperty=2&prototype=3&Constructor=4");
  expect(calls).toEqual([
    ["toString", "1"],
    ["hasOwnProperty", "2"],
    ["prototype", "3"],
    ["Constructor", "4"],
  ]);
});

test("[unhappy-1] filtering does not pollute Object.prototype", () => {
  filterQuery("/foo?__proto__=polluted&constructor=x&a=1", () => true);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted")).toBe(
    false,
  );
});

// @unhappy 2: A throwing predicate

class PredicateError extends Error {}

// Extends "[unhappy-2] rethrows the predicate's error and stops calling it": throw in the middle of three
test("[unhappy-2] a throw on the middle key stops before the last key", () => {
  const error = new PredicateError("boom");
  const { calls, predicate } = recorder((key) => {
    if (key === "b") {
      throw error;
    }
    return true;
  });
  let caught: unknown;
  try {
    filterQuery("/foo?a=1&b=2&c=3", predicate);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBe(error);
  expect((caught as Error).message).toBe("boom");
  expect(calls).toEqual([
    ["a", "1"],
    ["b", "2"],
  ]);
});

// Extends "[unhappy-2] rethrows the predicate's error": the first call is decided by parsed key order
test("[unhappy-2] the first key in parsed order throws and nothing else is called", () => {
  const error = new Error("boom");
  const { calls, predicate } = recorder((key) => {
    if (key === "1") {
      throw error;
    }
    return true;
  });
  expect(() => filterQuery("/foo?b=x&a=y&1=z", predicate)).toThrow(error);
  expect(calls).toEqual([["1", "z"]]);
});

test("[unhappy-2] an error thrown for a repeated key is rethrown after one call", () => {
  const error = new TypeError("bad value");
  const { calls, predicate } = recorder((_key, value) => {
    if (Array.isArray(value)) {
      throw error;
    }
    return true;
  });
  let caught: unknown;
  try {
    filterQuery("/foo?a=1&a=2&b=3", predicate);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBe(error);
  expect(caught).toBeInstanceOf(TypeError);
  expect((caught as Error).message).toBe("bad value");
  expect(calls).toEqual([["a", ["1", "2"]]]);
});

test("[unhappy-2] the error is rethrown even when an earlier key was dropped", () => {
  const error = new Error("boom");
  const { calls, predicate } = recorder((key) => {
    if (key === "c") {
      throw error;
    }
    return false;
  });
  expect(() =>
    filterQuery("http://foo.com/p?a=1&b=2&c=3&d=4#h", predicate),
  ).toThrow(error);
  expect(calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
});
