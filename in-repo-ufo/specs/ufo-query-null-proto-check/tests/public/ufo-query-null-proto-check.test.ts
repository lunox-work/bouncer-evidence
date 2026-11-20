import { expect, expectTypeOf, test } from "vitest";
import {
  encodeQueryItem,
  parseQuery,
  stringifyQuery,
  type ParsedQuery,
} from "../src/query";

const proto = (x: unknown) => Object.getPrototypeOf(x);

// --- happy-1: prototype chain is result -> empty prototype -> null ---

test("[happy-1] parseQuery('a=1') has chain result -> empty prototype -> null", () => {
  const result = parseQuery("a=1");
  expect(proto(result)).not.toBeNull();
  expect(Object.getOwnPropertyNames(proto(result))).toEqual([]);
  expect(proto(proto(result))).toBeNull();
});

test("[happy-1] a result with a leading '?' and merged keys has the same chain shape", () => {
  const result = parseQuery("?a=1&a=2&b");
  expect(proto(result)).not.toBeNull();
  expect(proto(result)).not.toBe(Object.prototype);
  expect(Object.getOwnPropertyNames(proto(result))).toEqual([]);
  expect(proto(proto(result))).toBeNull();
});

// --- boundary-1: separate calls return distinct objects sharing one prototype ---

test("[boundary-1] two calls return distinct objects sharing one prototype", () => {
  const r1 = parseQuery("a=1");
  const r2 = parseQuery("a=1");
  expect(r1).not.toBe(r2);
  expect(proto(r1)).toBe(proto(r2));
  r1.b = "2";
  expect(r2.b).toBeUndefined();
});

test("[boundary-1] results of different inputs, including empty, share the same prototype", () => {
  const r1 = parseQuery("");
  const r2 = parseQuery("x=1&x=2");
  const r3 = parseQuery();
  expect(r1).not.toBe(r3);
  expect(proto(r1)).toBe(proto(r2));
  expect(proto(r2)).toBe(proto(r3));
});

// --- boundary-2: empty or key-less query returns an empty null-prototype object ---

const emptyInputs: Array<{ label: string; input: string | undefined }> = [
  { label: "(omitted)", input: undefined },
  { label: '""', input: "" },
  { label: '"?"', input: "?" },
  { label: '"&&"', input: "&&" },
];

for (const { label, input } of emptyInputs) {
  test(`[boundary-2] parseQuery(${label}) is an empty null-prototype object`, () => {
    const result = input === undefined ? parseQuery() : parseQuery(input);
    expect(Object.keys(result)).toEqual([]);
    expect(proto(proto(result))).toBeNull();
  });
}

test('[boundary-2] parseQuery("?&&") with leading "?" and only separators is empty', () => {
  const result = parseQuery("?&&");
  expect(Object.keys(result)).toEqual([]);
  expect(proto(result)).not.toBeNull();
  expect(proto(proto(result))).toBeNull();
});

// --- happy-2: inherited members are absent ---

test("[happy-2] parseQuery('a=1') has no inherited Object.prototype members", () => {
  const result = parseQuery("a=1") as any;
  expect(result instanceof Object).toBe(false);
  expect(result.hasOwnProperty).toBeUndefined();
  expect(result.toString).toBeUndefined();
  expect(result.valueOf).toBeUndefined();
  expect(result.constructor).toBeUndefined();
});

test("[happy-2] an empty result also has no inherited Object.prototype members", () => {
  const result = parseQuery("") as any;
  expect(result instanceof Object).toBe(false);
  expect(result.hasOwnProperty).toBeUndefined();
  expect(result.toString).toBeUndefined();
  expect(result.valueOf).toBeUndefined();
  expect(result.constructor).toBeUndefined();
});

// --- unhappy-1: calling inherited members or string conversion throws TypeError ---

test("[unhappy-1] hasOwnProperty call, String() and template literal throw TypeError", () => {
  const result = parseQuery("a=1") as any;
  expect(() => result.hasOwnProperty("a")).toThrow(TypeError);
  expect(() => String(result)).toThrow(TypeError);
  expect(() => `${result}`).toThrow(TypeError);
});

test("[unhappy-1] a query-set non-callable toString still makes conversion throw TypeError", () => {
  const result = parseQuery("toString=a") as any;
  expect(() => result.toString()).toThrow(TypeError);
  expect(() => String(result)).toThrow(TypeError);
  expect(() => `${result}`).toThrow(TypeError);
});

// --- happy-3: static Object helpers and JSON work on the result ---

test("[happy-3] Object.keys, hasOwnProperty.call, Object.hasOwn, JSON and toEqual work", () => {
  const result = parseQuery("a=1&b=2&b=3");
  expect(Object.keys(result)).toEqual(["a", "b"]);
  expect(Object.prototype.hasOwnProperty.call(result, "a")).toBe(true);
  expect(Object.hasOwn(result, "b")).toBe(true);
  expect(JSON.stringify(result)).toBe('{"a":"1","b":["2","3"]}');
  expect(result).toEqual({ a: "1", b: ["2", "3"] });
});

test("[happy-3] static helpers on an empty result report no keys", () => {
  const result = parseQuery("");
  expect(Object.keys(result)).toEqual([]);
  expect(Object.prototype.hasOwnProperty.call(result, "a")).toBe(false);
  expect(Object.hasOwn(result, "toString")).toBe(false);
  expect(JSON.stringify(result)).toBe("{}");
  expect(result).toEqual({});
});

// --- unhappy-2: a __proto__ key is skipped and pollutes nothing ---

const protoCases: Array<{ input: string; keys: string[] }> = [
  { input: "__proto__=x", keys: [] },
  { input: "?__proto__=x&__proto__=y", keys: [] },
  { input: "%5F%5Fproto%5F%5F=x", keys: [] },
  { input: "__proto__", keys: [] },
  { input: "__proto__[polluted]=1", keys: ["__proto__[polluted]"] },
  { input: "a=1&__proto__=polluted&b=2", keys: ["a", "b"] },
];

for (const { input, keys } of protoCases) {
  test(`[unhappy-2] parseQuery(${JSON.stringify(input)}) skips __proto__ and pollutes nothing`, () => {
    const result = parseQuery(input);
    expect(Object.keys(result)).toEqual(keys);
    expect(Object.hasOwn(result, "__proto__")).toBe(false);
    expect(proto(proto(result))).toBeNull();
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });
}

test("[unhappy-2] __proto__ pairs leave the shared prototype unchanged; keys merely containing it are kept", () => {
  const reference = parseQuery("a=1");
  const result = parseQuery("__proto__=x&x__proto__=1&__proto__=y");
  expect(proto(result)).toBe(proto(reference));
  expect(Object.getOwnPropertyNames(proto(result))).toEqual([]);
  expect(proto(proto(result))).toBeNull();
  expect(Object.keys(result)).toEqual(["x__proto__"]);
  expect(Object.hasOwn(result, "__proto__")).toBe(false);
  expect(({} as any).x).toBeUndefined();
  expect(({} as any).y).toBeUndefined();
});

// --- happy-4: a key that only contains __proto__ is an own value ---

test('[happy-4] parseQuery("__proto__[polluted]=1") has own key "__proto__[polluted]"', () => {
  const result = parseQuery("__proto__[polluted]=1");
  expect(result).toEqual({ "__proto__[polluted]": "1" });
});

test('[happy-4] a repeated "__proto__[polluted]" key merges into an own array', () => {
  const result = parseQuery("__proto__[polluted]=1&__proto__[polluted]=2");
  expect(result).toEqual({ "__proto__[polluted]": ["1", "2"] });
  expect(Object.hasOwn(result, "__proto__[polluted]")).toBe(true);
});

// --- happy-5: built-in member names parse like any other key ---

const builtinCases: Array<{
  input: string;
  output: Record<string, string | string[]>;
  keys: string[];
}> = [
  { input: "constructor=1", output: {}, keys: [] },
  { input: "toString=a", output: { toString: "a" }, keys: ["toString"] },
  {
    input: "toString=a&toString=b",
    output: { toString: ["a", "b"] },
    keys: ["toString"],
  },
  {
    input: "hasOwnProperty=1",
    output: { hasOwnProperty: "1" },
    keys: ["hasOwnProperty"],
  },
  {
    input: "valueOf=1&valueOf=2&valueOf=3",
    output: { valueOf: ["1", "2", "3"] },
    keys: ["valueOf"],
  },
  {
    input: "constructor=a&x=1&constructor=b",
    output: { x: "1" },
    keys: ["x"],
  },
];

for (const { input, output, keys } of builtinCases) {
  test(`[happy-5] parseQuery(${JSON.stringify(input)}) treats built-in names as plain keys`, () => {
    const result = parseQuery(input);
    expect(result).toEqual(output);
    expect(Object.keys(result)).toEqual(keys);
  });
}

test("[happy-5] built-in names without '=' get '' and merge only after the query sets them", () => {
  const result = parseQuery("valueOf&toString=x&valueOf&constructor");
  expect(result).toEqual({ valueOf: ["", ""], toString: "x" });
  expect(Object.keys(result)).toEqual(["valueOf", "toString"]);
});

// --- happy-6: existing parsing results are unchanged ---

const parsingCases: Array<{
  input: string;
  output: Record<string, string | string[]>;
}> = [
  { input: "?test=123&unicode=%E5%A5%BD", output: { test: "123", unicode: "好" } },
  { input: "param=3&param=", output: { param: ["3", ""] } },
  { input: "param=&param=2&param=3", output: { param: ["", "2", "3"] } },
  { input: "a=1&b=2&a=3&a=4", output: { a: ["1", "3", "4"], b: "2" } },
  { input: "a", output: { a: "" } },
  {
    input: "key+with+space=spaced+value",
    output: { "key with space": "spaced value" },
  },
];

for (const { input, output } of parsingCases) {
  test(`[happy-6] parseQuery(${JSON.stringify(input)}) parses as before`, () => {
    expect(parseQuery(input)).toEqual(output);
  });
}

test("[happy-6] keys keep the order they first appear in, even when repeated later", () => {
  const result = parseQuery("b=1&a=2&b=3");
  expect(Object.keys(result)).toEqual(["b", "a"]);
  expect(result).toEqual({ b: ["1", "3"], a: "2" });
});

// --- happy-7: stringifyQuery round-trips a parseQuery result ---

const roundTripCases: Array<{ input: string; output: string }> = [
  { input: "a=1&b=2&b=3", output: "a=1&b=2&b=3" },
  { input: "__proto__=x", output: "" },
  { input: "constructor=1&a=2", output: "a=2" },
  { input: "", output: "" },
];

for (const { input, output } of roundTripCases) {
  test(`[happy-7] stringifyQuery(parseQuery(${JSON.stringify(input)})) is ${JSON.stringify(output)}`, () => {
    expect(stringifyQuery(parseQuery(input))).toBe(output);
  });
}

test("[happy-7] stringifyQuery round-trips keys named like Object.prototype members", () => {
  expect(stringifyQuery(parseQuery("toString=a&toString=b&valueOf=1"))).toBe(
    "toString=a&toString=b&valueOf=1",
  );
});

// --- happy-8: encodeQueryItem is unchanged ---

test('[happy-8] encodeQueryItem("param", ["3", ""]) is "param=3&param="', () => {
  expect(encodeQueryItem("param", ["3", ""])).toBe("param=3&param=");
});

test('[happy-8] encodeQueryItem("param", ["", "3"]) is "param=&param=3"', () => {
  expect(encodeQueryItem("param", ["", "3"])).toBe("param=&param=3");
});

// --- happy-9: return types are unchanged ---

test("[happy-9] parseQuery return types are ParsedQuery or the caller's T", () => {
  expectTypeOf(parseQuery("a=1")).toEqualTypeOf<ParsedQuery>();
  expectTypeOf(parseQuery<{ foo: string }>("foo=bar")).toEqualTypeOf<{
    foo: string;
  }>();
});

test("[happy-9] parseQuery with the argument omitted is typed ParsedQuery", () => {
  expectTypeOf(parseQuery()).toEqualTypeOf<ParsedQuery>();
});
