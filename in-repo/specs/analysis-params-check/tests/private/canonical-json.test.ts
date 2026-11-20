import assert from "node:assert/strict";
import { test } from "node:test";

import { type AnalysisParams, canonicalJson } from "../../src/analysis.js";

/**
 * The canonical JSON form a cache key is built from: primitives as
 * `JSON.stringify` writes them, object keys sorted by UTF-16 code unit at
 * every level, arrays in index order with holes written as nothing, and no
 * whitespace.
 */

/** Recursively freezes a value, so any write to it throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// AnalysisParams
// ---------------------------------------------------------------------------

// Extends "[happy-6] a params object with a deadline serializes as given".
test("[happy-6] params with other whole-minute deadlines serialize as given", () => {
  for (const minutes of [5, 15, 45, 60, 90, 1440, 10080]) {
    const params: AnalysisParams = { deadlineMinutes: minutes };
    assert.equal(canonicalJson(params), `{"deadlineMinutes":${minutes}}`);
  }
});

// Extends "[unhappy-1] nothing in the seam rejects an out-of-range deadline":
// other out-of-range values, all written as JSON.stringify writes the number.
test("[unhappy-1] tiny, huge, negative fractional and unsafe deadlines are written without complaint", () => {
  const rows: ReadonlyArray<readonly [number, string]> = [
    [-2.5, '{"deadlineMinutes":-2.5}'],
    [-1e9, '{"deadlineMinutes":-1000000000}'],
    [1e21, '{"deadlineMinutes":1e+21}'],
    [1e-7, '{"deadlineMinutes":1e-7}'],
    [Number.MAX_SAFE_INTEGER + 2, '{"deadlineMinutes":9007199254740992}'],
    [Number.MAX_VALUE, '{"deadlineMinutes":1.7976931348623157e+308}'],
    [Number.MIN_VALUE, '{"deadlineMinutes":5e-324}'],
    [0.30000000000000004, '{"deadlineMinutes":0.30000000000000004}'],
  ];
  for (const [minutes, json] of rows) {
    const params: AnalysisParams = { deadlineMinutes: minutes };
    assert.equal(canonicalJson(params), json, `deadlineMinutes ${minutes}`);
  }
});

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

// Extends "[happy-10] primitives are written exactly as JSON.stringify writes them":
// numbers in every format JSON.stringify chooses between.
test("[happy-10] numbers of every magnitude are written exactly as JSON.stringify writes them", () => {
  const numbers = [
    -1,
    -42.5,
    1e20,
    1e21,
    -1e21,
    1.5e300,
    1e-6,
    1e-7,
    123.456,
    0.000001234,
    2 ** 53,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
    Number.MAX_VALUE,
    Number.MIN_VALUE,
    Number.EPSILON,
    1 / 3,
  ];
  for (const value of numbers) {
    assert.equal(canonicalJson(value), JSON.stringify(value), String(value));
  }
  assert.equal(canonicalJson(1e-7), "1e-7");
  assert.equal(canonicalJson(-1e21), "-1e+21");
});

// Extends "[happy-10] primitives are written exactly as JSON.stringify writes them":
// every character up to U+00FF, and the line and paragraph separators, are
// escaped exactly as JSON.stringify escapes them.
test("[happy-10] every Latin-1 character and U+2028/U+2029 is escaped as JSON.stringify escapes it", () => {
  for (let code = 0; code <= 0xff; code += 1) {
    const value = `a${String.fromCharCode(code)}z`;
    assert.equal(canonicalJson(value), JSON.stringify(value), `U+${code.toString(16)}`);
  }
  for (const value of [" ", " ", "﻿", "￿", "􏿿", "\ud83d"]) {
    assert.equal(canonicalJson(value), JSON.stringify(value));
  }
  assert.equal(canonicalJson("\b\f\r\t"), '"\\b\\f\\r\\t"');
  assert.equal(canonicalJson("\u001f"), '"\\u001f"');
  assert.equal(canonicalJson("\u007f"), '"\u007f"');
  assert.equal(canonicalJson("/"), '"/"');
});

// Extends "[boundary-5] non-finite numbers become null": as object values,
// deep inside containers, next to finite numbers.
test("[boundary-5] non-finite numbers become null as object values and deep inside containers", () => {
  assert.equal(
    canonicalJson({ c: Number.NaN, b: Number.POSITIVE_INFINITY, a: Number.NEGATIVE_INFINITY }),
    '{"a":null,"b":null,"c":null}',
  );
  assert.equal(
    canonicalJson([1, Number.NaN, [Number.POSITIVE_INFINITY, { x: Number.NaN }], -0]),
    '[1,null,[null,{"x":null}],0]',
  );
});

// ---------------------------------------------------------------------------
// Key order
// ---------------------------------------------------------------------------

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) {
    return [[...items]];
  }
  const out: T[][] = [];
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) {
      out.push([item, ...tail]);
    }
  });
  return out;
}

// Extends "[happy-11] boundary: every insertion order of three keys gives the same output":
// all 120 insertion orders of five keys.
test("[happy-11] every insertion order of five keys gives the same sorted output", () => {
  const entries: ReadonlyArray<readonly [string, unknown]> = [
    ["delta", 4],
    ["alpha", "x"],
    ["echo", null],
    ["charlie", [2, 1]],
    ["bravo", true],
  ];
  const expected = '{"alpha":"x","bravo":true,"charlie":[2,1],"delta":4,"echo":null}';
  const orders = permutations(entries);
  assert.equal(orders.length, 120);
  for (const order of orders) {
    const value: Record<string, unknown> = {};
    for (const [key, item] of order) {
      value[key] = item;
    }
    assert.equal(canonicalJson(value), expected);
  }
});

// Extends "[happy-11] key order in the input does not change the output":
// two nested objects built in opposite orders at every level.
test("[happy-11] nested objects built in opposite insertion orders give the same output", () => {
  const forward = { a: { x: 1, y: { p: 1, q: 2 } }, b: [{ m: 1, n: 2 }], c: "c" };
  const backward = { c: "c", b: [{ n: 2, m: 1 }], a: { y: { q: 2, p: 1 }, x: 1 } };
  const expected = '{"a":{"x":1,"y":{"p":1,"q":2}},"b":[{"m":1,"n":2}],"c":"c"}';
  assert.equal(canonicalJson(forward), expected);
  assert.equal(canonicalJson(backward), expected);
});

// Extends "[happy-12] nested objects are sorted too, including objects inside arrays":
// sorting at five levels, through arrays and objects alternately.
test("[happy-12] keys are sorted at every one of five nesting levels", () => {
  const value = {
    z: [{ y: { x: [{ w: 1, v: { u: 2, t: 3 } }], s: 0 }, r: null }],
    q: { p: { o: { n: { m: 1, l: 2 } } } },
  };
  assert.equal(
    canonicalJson(value),
    '{"q":{"p":{"o":{"n":{"l":2,"m":1}}}},"z":[{"r":null,"y":{"s":0,"x":[{"v":{"t":3,"u":2},"w":1}]}}]}',
  );
});

// Extends "[happy-12] nested objects are sorted too": a deep but acyclic
// value is written in full, with no depth limit short of the engine's.
test("[happy-12] an object nested 300 levels deep is written in full and sorted at each level", () => {
  let value: unknown = 0;
  let expected = "0";
  for (let depth = 0; depth < 300; depth += 1) {
    value = { b: value, a: depth };
    expected = `{"a":${depth},"b":${expected}}`;
  }
  assert.equal(canonicalJson(value), expected);
});

// Extends "[boundary-6] empty containers": empties nested several levels deep.
test("[boundary-6] empty containers nested several levels deep stay empty", () => {
  assert.equal(canonicalJson([[[]]]), "[[[]]]");
  assert.equal(canonicalJson({ a: { b: { c: {} } } }), '{"a":{"b":{"c":{}}}}');
  assert.equal(canonicalJson([{}, [], [{}], { "": [] }]), '[{},[],[{}],{"":[]}]');
  assert.equal(canonicalJson({ "": {} }), '{"":{}}');
});

// Extends "[boundary-7] keys sort by UTF-16 code unit, not by number, locale or code point":
// more keys, including integer-like keys that Object.keys lists first.
test("[boundary-7] integer-like keys sort as strings, not in the order Object.keys lists them", () => {
  assert.equal(
    canonicalJson({ b: 1, "1": 2, "01": 3, "100": 4, "20": 5, "9": 6, "-1": 7 }),
    '{"-1":7,"01":3,"1":2,"100":4,"20":5,"9":6,"b":1}',
  );
  assert.equal(
    canonicalJson({ "10": "ten", "9": "nine", a: "a", "1": "one" }),
    '{"1":"one","10":"ten","9":"nine","a":"a"}',
  );
});

// Extends "[boundary-7] keys sort by UTF-16 code unit, not by number, locale or code point":
// case, punctuation and accents, where a locale comparison disagrees.
test("[boundary-7] upper case, punctuation, lower case and accents sort by code unit", () => {
  assert.equal(
    canonicalJson({ b: 1, A: 2, a: 3, B: 4, _: 5, "~": 6, Z: 7, "é": 8, e: 9, f: 10 }),
    '{"A":2,"B":4,"Z":7,"_":5,"a":3,"b":1,"e":9,"f":10,"~":6,"é":8}',
  );
});

// Extends "[boundary-7] keys sort by UTF-16 code unit, not by number, locale or code point":
// characters above the surrogate range sort after astral characters.
test("[boundary-7] astral keys sort before U+E000 to U+FFFF keys, as their code units say", () => {
  assert.equal(
    canonicalJson({ "￿": 1, "": 2, "😀": 3, "𝄞": 4, "퟿": 5 }),
    '{"퟿":5,"𝄞":4,"😀":3,"":2,"￿":1}',
  );
  const keys = ["￿", "", "😀", "𝄞", "퟿", "a"];
  const value: Record<string, number> = {};
  keys.forEach((key, index) => {
    value[key] = index;
  });
  const sorted = [...keys].sort();
  const expected = `{${sorted.map((key) => `${JSON.stringify(key)}:${keys.indexOf(key)}`).join(",")}}`;
  assert.equal(canonicalJson(value), expected);
});

// Extends "[boundary-7] boundary: the empty key and prefixes sort first":
// a prefix sorts before every extension of it, including one with U+0000.
test("[boundary-7] a key sorts before its extensions, including one ending in U+0000", () => {
  assert.equal(
    canonicalJson({ ab: 1, "a\u0000": 2, a: 3, abc: 4, b: 5 }),
    '{"a":3,"a\\u0000":2,"ab":1,"abc":4,"b":5}',
  );
});

// Extends "[boundary-8] keys are escaped as JSON strings":
// control characters, quotes, backslashes and lone surrogates in keys.
test("[boundary-8] keys with control characters, quotes and lone surrogates are escaped as JSON.stringify escapes them", () => {
  for (const key of ["\u0000", "\u001f", "\t", '"', "\\", 'a"b\\c', "\ud800", " ", "é", "😀"]) {
    const value: Record<string, number> = { [key]: 1 };
    assert.equal(canonicalJson(value), `{${JSON.stringify(key)}:1}`, JSON.stringify(key));
  }
  assert.equal(canonicalJson({ "\t": 1, "\n": 2 }), '{"\\t":1,"\\n":2}');
});

// Extends "[boundary-8] keys are escaped as JSON strings": keys are sorted by
// the raw key, not by their escaped text.
test("[boundary-8] keys are sorted by the raw key, then escaped", () => {
  // Raw order: "\n" (0x0a) < "!" (0x21) < "\\" (0x5c). Escaped text would put "!" first.
  assert.equal(
    canonicalJson({ "\\": 1, "!": 2, "\n": 3 }),
    '{"\\n":3,"!":2,"\\\\":1}',
  );
});

// ---------------------------------------------------------------------------
// No mutation
// ---------------------------------------------------------------------------

// Extends "[happy-13] the input object is not mutated": a deeply frozen input
// is serialized, so any write to it would throw.
test("[happy-13] a deeply frozen input with unsorted keys and arrays is serialized", () => {
  const input = deepFreeze({ b: [3, 1, { d: 1, c: 2 }], a: { z: "z", y: [null] } });
  assert.equal(
    canonicalJson(input),
    '{"a":{"y":[null],"z":"z"},"b":[3,1,{"c":2,"d":1}]}',
  );
});

// Extends "[happy-13] the input object is not mutated": values, array order,
// holes and nested key order are all left as they were.
test("[happy-13] values, holes and nested key order are left as they were", () => {
  // eslint-disable-next-line no-sparse-arrays
  const sparse = [2, , 1];
  const input = { y: { b: [2, 1], a: Number.NaN }, x: sparse, w: [{ q: 1, p: 2 }] };
  canonicalJson(input);
  assert.deepEqual(Object.keys(input), ["y", "x", "w"]);
  assert.deepEqual(Object.keys(input.y), ["b", "a"]);
  assert.deepEqual(input.y.b, [2, 1]);
  assert.equal(Number.isNaN(input.y.a), true);
  assert.equal(sparse.length, 3);
  assert.equal(1 in sparse, false);
  assert.deepEqual(Object.keys(sparse), ["0", "2"]);
  assert.deepEqual(Object.keys(input.w[0] ?? {}), ["q", "p"]);
});

// ---------------------------------------------------------------------------
// Arrays
// ---------------------------------------------------------------------------

// Extends "[happy-14] arrays are not sorted": longer arrays of every element
// type, in descending and shuffled orders.
test("[happy-14] long arrays of numbers, strings and objects keep their order", () => {
  const numbers = Array.from({ length: 50 }, (_, index) => 50 - index);
  assert.equal(canonicalJson(numbers), `[${numbers.join(",")}]`);
  assert.equal(canonicalJson(["c", "a", "b", "a"]), '["c","a","b","a"]');
  assert.equal(
    canonicalJson([{ k: 2 }, { k: 1 }, { k: 3 }]),
    '[{"k":2},{"k":1},{"k":3}]',
  );
  assert.equal(canonicalJson([true, false, null]), "[true,false,null]");
  assert.equal(canonicalJson([[2], [1]]), "[[2],[1]]");
  assert.notEqual(canonicalJson([[2], [1]]), canonicalJson([[1], [2]]));
});

// Extends "[happy-14] arrays are not sorted": the array is written in index
// order, ignoring non-index properties and insertion order.
test("[happy-14] elements are written in index order, and non-index array properties are ignored", () => {
  const filled: number[] = [];
  filled[2] = 30;
  filled[0] = 10;
  filled[1] = 20;
  assert.equal(canonicalJson(filled), "[10,20,30]");
  const tagged = Object.assign([1, 2], { extra: 3 });
  assert.equal(canonicalJson(tagged), "[1,2]");
});

// Extends "[happy-15] mixed arrays canonicalize each element in place":
// every kind of element side by side, nested.
test("[happy-15] mixed arrays of every JSON kind canonicalize each element in place", () => {
  assert.equal(
    canonicalJson([
      0,
      -0,
      "s",
      'q"',
      true,
      null,
      Number.NaN,
      [],
      {},
      { z: [{ b: 2, a: 1 }], a: [] },
      [[{ y: 1, x: 2 }], "t"],
    ]),
    '[0,0,"s","q\\"",true,null,null,[],{},{"a":[],"z":[{"a":1,"b":2}]},[[{"x":2,"y":1}],"t"]]',
  );
});

// ---------------------------------------------------------------------------
// Sparse arrays
// ---------------------------------------------------------------------------

// Extends "[boundary-9] sparse array holes are skipped, not read as undefined":
// leading, repeated and trailing holes, and holes next to objects.
test("[boundary-9] leading, repeated and trailing holes each write nothing between commas", () => {
  /* eslint-disable no-sparse-arrays */
  assert.equal(canonicalJson([, , 1]), "[,,1]");
  assert.equal(canonicalJson([1, , , , 2]), "[1,,,,2]");
  assert.equal(canonicalJson([1, , , ]), "[1,,]");
  assert.equal(canonicalJson([, { b: 1, a: 2 }, , [, "x"]]), '[,{"a":2,"b":1},,[,"x"]]');
  assert.equal(canonicalJson({ b: [, null], a: [null, ,] }), '{"a":[null,],"b":[,null]}');
  /* eslint-enable no-sparse-arrays */
});

// Extends "[boundary-9] boundary: arrays made only of holes write only commas":
// a long empty array, and an array whose length was extended.
test("[boundary-9] an array of length n made of holes writes n - 1 commas", () => {
  assert.equal(canonicalJson(new Array(10)), "[,,,,,,,,,]");
  const grown = [1];
  grown.length = 4;
  assert.equal(canonicalJson(grown), "[1,,,]");
  const deleted = [1, 2, 3];
  delete deleted[1];
  assert.equal(canonicalJson(deleted), "[1,,3]");
});

// Extends "[boundary-9] sparse array holes are skipped": a hole and an
// explicit undefined are told apart.
test("[boundary-9] a hole is accepted where an explicit undefined element is rejected", () => {
  // eslint-disable-next-line no-sparse-arrays
  assert.equal(canonicalJson([, 2]), "[,2]");
  assert.throws(() => canonicalJson([undefined, 2]), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Cache parameters must be JSON values.");
    return true;
  });
});

// ---------------------------------------------------------------------------
// Non-plain objects
// ---------------------------------------------------------------------------

// Extends "[boundary-10] non-plain objects are read as records of their own enumerable string keys":
// array-likes, boxed primitives, typed arrays, regexps and errors.
test("[boundary-10] array-likes, boxed primitives, typed arrays, regexps and errors are read by their own keys", () => {
  assert.equal(canonicalJson({ length: 2, 0: "a", 1: "b" }), '{"0":"a","1":"b","length":2}');
  assert.equal(canonicalJson(new String("ab")), '{"0":"a","1":"b"}');
  assert.equal(canonicalJson(new Number(5)), "{}");
  assert.equal(canonicalJson(new Boolean(true)), "{}");
  assert.equal(canonicalJson(new Uint8Array([5, 6])), '{"0":5,"1":6}');
  assert.equal(canonicalJson(/a+/g), "{}");
  assert.equal(canonicalJson(new Error("boom")), "{}");
});

// Extends "[boundary-10] non-plain objects": prototype toJSON on instances
// and nested Dates and Maps are ignored at every depth.
test("[boundary-10] nested Dates, Maps and class instances with a prototype toJSON are read by their own keys", () => {
  class Point {
    y = 2;
    x = 1;
    toJSON(): string {
      return "point";
    }
    norm(): number {
      return this.x + this.y;
    }
  }
  assert.equal(
    canonicalJson({ when: new Date(86_400_000), map: new Map([["k", 1]]), at: new Point() }),
    '{"at":{"x":1,"y":2},"map":{},"when":{}}',
  );
  assert.equal(canonicalJson([new Point(), new Set(["a"])]), '[{"x":1,"y":2},{}]');
});

// Extends "[boundary-10] non-plain objects": an own enumerable accessor is
// read like any other own property.
test("[boundary-10] an own enumerable getter is written with the value it returns", () => {
  const value = {
    get b(): number {
      return 2;
    },
    a: 1,
  };
  assert.equal(canonicalJson(value), '{"a":1,"b":2}');
});

// Extends "[boundary-11] symbol keys and non-enumerable keys are left out":
// inherited enumerable properties, non-enumerable toJSON and a mix of all of them.
test("[boundary-11] inherited, non-enumerable and symbol-keyed properties are all left out, even toJSON", () => {
  const proto = { inherited: 1, f(): number {
    return 1;
  }, toJSON: () => "proto" };
  const input = Object.create(proto) as Record<PropertyKey, unknown>;
  input["b"] = 2;
  input["a"] = 1;
  input[Symbol("sym")] = undefined;
  Object.defineProperty(input, "toJSON", { value: () => "own", enumerable: false });
  Object.defineProperty(input, "c", { value: 3, enumerable: false });
  assert.equal(canonicalJson(input), '{"a":1,"b":2}');
  assert.equal(canonicalJson({ nested: input }), '{"nested":{"a":1,"b":2}}');
});

// Extends "[boundary-11] symbol keys and non-enumerable keys are left out":
// an own enumerable toJSON that is not a function is an ordinary property.
test("[boundary-11] an own enumerable non-function toJSON is written as an ordinary key", () => {
  assert.equal(canonicalJson({ toJSON: 1, a: 0 }), '{"a":0,"toJSON":1}');
  assert.equal(canonicalJson({ toJSON: null }), '{"toJSON":null}');
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

// Extends "[happy-16] repeated calls with equal inputs give equal results":
// the result reflects the value at the time of the call, not an earlier call on the same object.
test("[happy-16] a changed object gives the changed result on the next call", () => {
  const params: { deadlineMinutes: number; extra?: string } = { deadlineMinutes: 30 };
  assert.equal(canonicalJson(params), '{"deadlineMinutes":30}');
  params.deadlineMinutes = 45;
  assert.equal(canonicalJson(params), '{"deadlineMinutes":45}');
  params.extra = "x";
  assert.equal(canonicalJson(params), '{"deadlineMinutes":45,"extra":"x"}');
  params.deadlineMinutes = 30;
  delete params.extra;
  assert.equal(canonicalJson(params), '{"deadlineMinutes":30}');
});

// Extends "[happy-16] repeated calls with equal inputs give equal results":
// equal values built differently give one key, interleaved with other calls.
test("[happy-16] equal values built in different ways give the same string across interleaved calls", () => {
  const built: Record<string, unknown> = {};
  built["b"] = [1, { d: 2, c: 1 }];
  built["a"] = "x";
  const literal = { a: "x", b: [1, { c: 1, d: 2 }] };
  const first = canonicalJson(built);
  canonicalJson({ other: [3, 2, 1] });
  const second = canonicalJson(literal);
  canonicalJson([{ z: 0 }]);
  const third = canonicalJson(built);
  assert.equal(first, '{"a":"x","b":[1,{"c":1,"d":2}]}');
  assert.equal(second, first);
  assert.equal(third, first);
});
