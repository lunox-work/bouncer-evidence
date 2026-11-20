import { expect, expectTypeOf, test } from "vitest";
import { parseQuery, type ParsedQuery } from "../../src/query";

const proto = (x: unknown) => Object.getPrototypeOf(x);

const memberNames = [
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "toString",
  "valueOf",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "__proto__",
];

// --- happy-1: prototype chain is result -> empty prototype -> null ---

// Extends "[happy-1] parseQuery('a=1') has chain result -> empty prototype -> null":
// other inputs, including ones with skipped and member-named keys.
const chainInputs = [
  "toString=1",
  "__proto__=x",
  "constructor=1",
  "valueOf=1&valueOf=2",
  "%5F%5Fproto%5F%5F=x&b=2",
  "a",
];

for (const input of chainInputs) {
  test(`[happy-1] parseQuery(${JSON.stringify(input)}) has chain result -> empty prototype -> null`, () => {
    const result = parseQuery(input);
    expect(proto(result)).not.toBeNull();
    expect(proto(result)).not.toBe(Object.prototype);
    expect(Reflect.ownKeys(proto(result))).toEqual([]);
    expect(proto(proto(result))).toBeNull();
  });
}

// Extends "[happy-1] parseQuery('a=1') ...": the prototype has no symbol keys either.
test("[happy-1] the prototype of a result has no own symbol properties", () => {
  const result = parseQuery("a=1");
  expect(Object.getOwnPropertySymbols(proto(result))).toEqual([]);
  expect(Object.getOwnPropertyNames(proto(result))).toEqual([]);
  expect(proto(proto(result))).toBeNull();
});

// Extends "[happy-1] a result with a leading '?' and merged keys ...": a long query.
test("[happy-1] a result with 500 keys still has chain result -> empty prototype -> null", () => {
  const input = Array.from({ length: 500 }, (_, i) => `k${i}=${i}`).join("&");
  const result = parseQuery(input);
  expect(Object.keys(result)).toHaveLength(500);
  expect(proto(result)).not.toBeNull();
  expect(Reflect.ownKeys(proto(result))).toEqual([]);
  expect(proto(proto(result))).toBeNull();
});

// --- boundary-1: separate calls return distinct objects sharing one prototype ---

// Extends "[boundary-1] two calls return distinct objects sharing one prototype": many calls.
test("[boundary-1] fifty calls return fifty distinct objects that all share one prototype", () => {
  const results = Array.from({ length: 50 }, () => parseQuery("a=1"));
  expect(new Set(results).size).toBe(50);
  const shared = proto(results[0]);
  expect(shared).not.toBeNull();
  expect(shared).not.toBe(Object.prototype);
  for (const r of results) {
    expect(proto(r)).toBe(shared);
  }
});

// Extends "[boundary-1] two calls ...": setting a member-named key on one result.
test("[boundary-1] setting toString on one result does not show up on another", () => {
  const r1 = parseQuery("a=1") as any;
  const r2 = parseQuery("a=1") as any;
  expect(r1).not.toBe(r2);
  expect(proto(r1)).toBe(proto(r2));
  r1.toString = "x";
  r1.b = "2";
  expect(r2.toString).toBeUndefined();
  expect(r2.b).toBeUndefined();
  expect(Reflect.ownKeys(proto(r2))).toEqual([]);
  expect(parseQuery("a=1")).toEqual({ a: "1" });
});

// Extends "[boundary-1] results of different inputs, including empty, share the same prototype":
// key-less inputs other than "" and omitted, and inputs with skipped keys.
test("[boundary-1] results of key-less, skipped-key and member-key inputs share the same prototype", () => {
  const reference = proto(parseQuery("a=1"));
  const inputs = [
    "?",
    "&&",
    "?&",
    "=",
    "__proto__=x",
    "constructor=1",
    "toString=a&toString=b",
  ];
  const results = inputs.map((i) => parseQuery(i));
  expect(new Set(results).size).toBe(inputs.length);
  for (const r of results) {
    expect(proto(r)).toBe(reference);
  }
  expect(reference).not.toBe(Object.prototype);
});

// --- boundary-2: empty or key-less query returns an empty null-prototype object ---

// Extends the public "[boundary-2] parseQuery(...) is an empty null-prototype object" cases:
// the result must be the same kind of object as a non-empty result, not a plain {}.
const emptyInputs: Array<{ label: string; input: string | undefined }> = [
  { label: "(omitted)", input: undefined },
  { label: '""', input: "" },
  { label: '"?"', input: "?" },
  { label: '"&&"', input: "&&" },
  { label: '"&"', input: "&" },
  { label: '"?&"', input: "?&" },
  { label: '"&&&&&&&&"', input: "&&&&&&&&" },
  { label: '"="', input: "=" },
  { label: '"==&="', input: "==&=" },
];

for (const { label, input } of emptyInputs) {
  test(`[boundary-2] parseQuery(${label}) is empty, not instanceof Object, and shares the result prototype`, () => {
    const result = input === undefined ? parseQuery() : parseQuery(input);
    expect(Object.keys(result)).toEqual([]);
    expect(result instanceof Object).toBe(false);
    expect(proto(result)).toBe(proto(parseQuery("a=1")));
    expect(Reflect.ownKeys(proto(result))).toEqual([]);
    expect(proto(proto(result))).toBeNull();
  });
}

// --- happy-2: inherited members are absent ---

// Extends "[happy-2] parseQuery('a=1') has no inherited Object.prototype members":
// every Object.prototype member, including the __proto__ accessor.
test("[happy-2] no Object.prototype member is reachable on a result", () => {
  const result = parseQuery("a=1") as any;
  expect(result instanceof Object).toBe(false);
  for (const name of memberNames) {
    expect(result[name]).toBeUndefined();
    expect(name in result).toBe(false);
  }
});

// Extends "[happy-2] ...": a result whose keys are other member names still lacks the rest.
test("[happy-2] a result that sets toString still has no inherited valueOf, hasOwnProperty or constructor", () => {
  const result = parseQuery("toString=a&b=1&b=2") as any;
  expect(result instanceof Object).toBe(false);
  expect(result.toString).toBe("a");
  expect(result.valueOf).toBeUndefined();
  expect(result.hasOwnProperty).toBeUndefined();
  expect(result.constructor).toBeUndefined();
  expect(result.isPrototypeOf).toBeUndefined();
  expect(result.propertyIsEnumerable).toBeUndefined();
  expect(result.toLocaleString).toBeUndefined();
});

// Extends "[happy-2] ...": "constructor" stays absent even when the query names it.
test("[happy-2] a query that names constructor and __proto__ leaves both absent", () => {
  const result = parseQuery("constructor=1&__proto__=2&a=3") as any;
  expect(result instanceof Object).toBe(false);
  expect(result.constructor).toBeUndefined();
  expect(result.__proto__).toBeUndefined();
  expect(result.hasOwnProperty).toBeUndefined();
  expect(result.a).toBe("3");
});

// --- unhappy-1: calling inherited members or string conversion throws TypeError ---

// Extends "[unhappy-1] hasOwnProperty call, String() and template literal throw TypeError":
// the other Object.prototype methods and other conversions.
test("[unhappy-1] calling other inherited methods throws TypeError", () => {
  const result = parseQuery("a=1") as any;
  expect(() => result.toString()).toThrow(TypeError);
  expect(() => result.valueOf()).toThrow(TypeError);
  expect(() => result.isPrototypeOf({})).toThrow(TypeError);
  expect(() => result.propertyIsEnumerable("a")).toThrow(TypeError);
  expect(() => result.toLocaleString()).toThrow(TypeError);
});

test("[unhappy-1] concatenation, Number() and loose comparison with a string throw TypeError", () => {
  const result = parseQuery("a=1") as any;
  expect(() => result + "").toThrow(TypeError);
  expect(() => "" + result).toThrow(TypeError);
  expect(() => Number(result)).toThrow(TypeError);
  // eslint-disable-next-line eqeqeq
  expect(() => result == "x").toThrow(TypeError);
});

test("[unhappy-1] String() and template literal on an empty result throw TypeError", () => {
  for (const result of [parseQuery(), parseQuery(""), parseQuery("?")] as any[]) {
    expect(() => String(result)).toThrow(TypeError);
    expect(() => `${result}`).toThrow(TypeError);
  }
});

// Extends "[unhappy-1] a query-set non-callable toString still makes conversion throw TypeError":
// both toString and valueOf set by the query, and a query-set hasOwnProperty.
test("[unhappy-1] query-set toString and valueOf strings still make conversion throw TypeError", () => {
  const result = parseQuery("toString=a&valueOf=b") as any;
  expect(() => result.hasOwnProperty("toString")).toThrow(TypeError);
  expect(() => String(result)).toThrow(TypeError);
  expect(() => `${result}`).toThrow(TypeError);
  expect(() => result + "").toThrow(TypeError);
  expect(() => result.valueOf()).toThrow(TypeError);
});

test("[unhappy-1] a query-set hasOwnProperty string throws TypeError when called", () => {
  const result = parseQuery("hasOwnProperty=1&a=2") as any;
  expect(() => result.hasOwnProperty("a")).toThrow(TypeError);
  expect(() => String(result)).toThrow(TypeError);
});

test("[unhappy-1] a query-set toString array still makes conversion throw TypeError", () => {
  const result = parseQuery("toString=a&toString=b") as any;
  expect(() => result.hasOwnProperty("toString")).toThrow(TypeError);
  expect(() => result.toString()).toThrow(TypeError);
  expect(() => String(result)).toThrow(TypeError);
  expect(() => `${result}`).toThrow(TypeError);
});

// --- happy-3: static Object helpers and JSON work on the result ---

// Extends "[happy-3] Object.keys, hasOwnProperty.call, Object.hasOwn, JSON and toEqual work":
// keys named like Object.prototype members.
test("[happy-3] static helpers and JSON work on a result with member-named keys", () => {
  const result = parseQuery("toString=a&valueOf=1&valueOf=2&hasOwnProperty=");
  expect(Object.keys(result)).toEqual(["toString", "valueOf", "hasOwnProperty"]);
  expect(Object.prototype.hasOwnProperty.call(result, "toString")).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(result, "isPrototypeOf")).toBe(false);
  expect(Object.hasOwn(result, "valueOf")).toBe(true);
  expect(Object.hasOwn(result, "constructor")).toBe(false);
  expect(JSON.stringify(result)).toBe(
    '{"toString":"a","valueOf":["1","2"],"hasOwnProperty":""}',
  );
  expect(result).toEqual({ toString: "a", valueOf: ["1", "2"], hasOwnProperty: "" });
});

test("[happy-3] Object.entries, Object.values, Object.assign and spread work on the result", () => {
  const result = parseQuery("a=1&b=2&b=3&toString=x");
  expect(Object.entries(result)).toEqual([
    ["a", "1"],
    ["b", ["2", "3"]],
    ["toString", "x"],
  ]);
  expect(Object.values(result)).toEqual(["1", ["2", "3"], "x"]);
  expect(Object.assign({}, result)).toEqual({ a: "1", b: ["2", "3"], toString: "x" });
  expect({ ...result }).toEqual({ a: "1", b: ["2", "3"], toString: "x" });
});

test("[happy-3] static helpers report member names as absent unless the query set them", () => {
  const result = parseQuery("a=1&b=2&b=3");
  for (const name of memberNames) {
    expect(Object.hasOwn(result, name)).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, name)).toBe(false);
  }
  expect(Object.keys(result)).toEqual(["a", "b"]);
  expect(JSON.stringify(result)).toBe('{"a":"1","b":["2","3"]}');
  expect((result as any).toString).toBeUndefined();
});

// --- happy-9: return types are unchanged ---

// Extends "[happy-9] parseQuery return types are ParsedQuery or the caller's T":
// a T whose keys are member names, checked at runtime too.
test("[happy-9] a caller's T naming toString is the exact type and matches the runtime value", () => {
  const typed = parseQuery<{ toString: string }>("toString=bar");
  expectTypeOf(typed).toEqualTypeOf<{ toString: string }>();
  expect(typed.toString).toBe("bar");
});

test("[happy-9] a caller's T with an array member is the exact type and matches the runtime value", () => {
  const typed = parseQuery<{ valueOf: string[]; a: string }>("valueOf=1&a=x&valueOf=2");
  expectTypeOf(typed).toEqualTypeOf<{ valueOf: string[]; a: string }>();
  expect(typed.valueOf).toEqual(["1", "2"]);
  expect(typed.a).toBe("x");
});

test("[happy-9] the default return type is ParsedQuery for a result with member-named keys", () => {
  const result = parseQuery("hasOwnProperty=1");
  expectTypeOf(result).toEqualTypeOf<ParsedQuery>();
  expectTypeOf(parseQuery("")).toEqualTypeOf<ParsedQuery>();
  expect(result).toEqual({ hasOwnProperty: "1" });
});
