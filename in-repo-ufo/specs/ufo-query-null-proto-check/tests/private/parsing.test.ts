import { expect, test } from "vitest";
import { encodeQueryItem, parseQuery, stringifyQuery } from "../../src/query";

const proto = (x: unknown) => Object.getPrototypeOf(x);

// --- unhappy-2: a __proto__ key is skipped and pollutes nothing ---

// Extends the public "[unhappy-2] parseQuery(...) skips __proto__ and pollutes nothing" cases:
// other encodings, empty values, repeats, combinations with member-named keys, and keys that
// only resemble __proto__. Each case also checks that the prototype chain is
// result -> shared empty prototype -> null.
const protoCases: Array<{ input: string; output: Record<string, string | string[]> }> = [
  { input: "%5f%5fproto%5f%5f=x", output: {} },
  { input: "__proto%5F_=x", output: {} },
  { input: "__proto__=", output: {} },
  { input: "?__proto__", output: {} },
  { input: "__proto__=polluted&__proto__=again&__proto__", output: {} },
  { input: "__proto__=%7B%22polluted%22%3A1%7D", output: {} },
  { input: "__proto__=x&toString=y", output: { toString: "y" } },
  { input: "toString=1&__proto__=x&toString=2", output: { toString: ["1", "2"] } },
  { input: "a=1&__proto__=x&a=2", output: { a: ["1", "2"] } },
  {
    input: "__proto__[polluted]=1&__proto__=2",
    output: { "__proto__[polluted]": "1" },
  },
  {
    input: "%5F%5Fproto%5F%5F%5Bpolluted%5D=yes",
    output: { "__proto__[polluted]": "yes" },
  },
  { input: "__proto__.polluted=1", output: { "__proto__.polluted": "1" } },
  { input: "__PROTO__=x", output: { __PROTO__: "x" } },
  { input: "__proto__+=x", output: { "__proto__ ": "x" } },
  { input: "+__proto__=x", output: { " __proto__": "x" } },
];

for (const { input, output } of protoCases) {
  test(`[unhappy-2] parseQuery(${JSON.stringify(input)}) skips only an exact __proto__ key and keeps the chain`, () => {
    const shared = proto(parseQuery("a=1"));
    const result = parseQuery(input);
    expect(Object.keys(result)).toEqual(Object.keys(output));
    expect(result).toEqual(output);
    expect(Object.hasOwn(result, "__proto__")).toBe(false);
    expect(proto(result)).toBe(shared);
    expect(Reflect.ownKeys(proto(result))).toEqual([]);
    expect(proto(proto(result))).toBeNull();
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });
}

// Extends "[unhappy-2] __proto__ pairs leave the shared prototype unchanged; ...":
// a later result is unaffected by earlier __proto__ pairs.
test("[unhappy-2] __proto__ pairs in one call do not change the prototype seen by later calls", () => {
  parseQuery("__proto__=x&__proto__[polluted]=1&%5F%5Fproto%5F%5F=y");
  const later = parseQuery("b=1") as any;
  expect(Reflect.ownKeys(proto(later))).toEqual([]);
  expect(proto(proto(later))).toBeNull();
  expect(later.x).toBeUndefined();
  expect(later.y).toBeUndefined();
  expect(later.polluted).toBeUndefined();
  expect(Object.keys(later)).toEqual(["b"]);
  expect(({} as any).polluted).toBeUndefined();
});

// --- happy-4: a key that only contains __proto__ is an own value ---

// Extends '[happy-4] parseQuery("__proto__[polluted]=1") has own key "__proto__[polluted]"':
// combined with member-named keys.
test('[happy-4] "__proto__[polluted]" stays an own key next to a member-named key', () => {
  const result = parseQuery("__proto__[polluted]=1&valueOf=3");
  expect(result).toEqual({ "__proto__[polluted]": "1", valueOf: "3" });
  expect(Object.hasOwn(result, "__proto__[polluted]")).toBe(true);
  expect(Object.keys(result)).toEqual(["__proto__[polluted]", "valueOf"]);
});

// Extends '[happy-4] a repeated "__proto__[polluted]" key merges into an own array': three
// repeats, interleaved with toString.
test('[happy-4] "__proto__[toString]" and toString are separate own keys that each merge', () => {
  const result = parseQuery(
    "__proto__[toString]=1&toString=2&__proto__[toString]=3&toString=4&__proto__[toString]=5",
  );
  expect(result).toEqual({
    "__proto__[toString]": ["1", "3", "5"],
    toString: ["2", "4"],
  });
  expect(Object.keys(result)).toEqual(["__proto__[toString]", "toString"]);
});

test("[happy-4] keys with __proto__ inside them are own values on a result without Object.prototype", () => {
  const result = parseQuery("a[__proto__]=1&x__proto__x=2&__proto__%5Bb%5D=3") as any;
  expect(result).toEqual({
    "a[__proto__]": "1",
    x__proto__x: "2",
    "__proto__[b]": "3",
  });
  expect(result instanceof Object).toBe(false);
  expect(Object.hasOwn(result, "__proto__")).toBe(false);
});

// --- happy-5: built-in member names parse like any other key ---

// Extends the public "[happy-5] parseQuery(...) treats built-in names as plain keys" cases:
// every other Object.prototype member name, once and repeated.
const otherMembers = [
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "hasOwnProperty",
  "toString",
  "valueOf",
];

for (const name of otherMembers) {
  test(`[happy-5] "${name}" set once is a plain string value`, () => {
    const result = parseQuery(`${name}=v`);
    expect(result).toEqual({ [name]: "v" });
    expect(Object.keys(result)).toEqual([name]);
  });

  test(`[happy-5] "${name}" repeated three times merges into an array in input order`, () => {
    const result = parseQuery(`${name}=1&${name}=2&${name}=3`);
    expect(result).toEqual({ [name]: ["1", "2", "3"] });
    expect(Object.keys(result)).toEqual([name]);
  });
}

test("[happy-5] interleaved member-named keys merge separately and keep first-seen order", () => {
  const result = parseQuery(
    "toString=1&valueOf=2&toString=3&hasOwnProperty=4&valueOf=5&isPrototypeOf=6",
  );
  expect(result).toEqual({
    toString: ["1", "3"],
    valueOf: ["2", "5"],
    hasOwnProperty: "4",
    isPrototypeOf: "6",
  });
  expect(Object.keys(result)).toEqual([
    "toString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
  ]);
});

test("[happy-5] a member name repeated twenty times merges into a twenty-item array", () => {
  const input = Array.from({ length: 20 }, (_, i) => `toString=${i}`).join("&");
  const result = parseQuery(input);
  expect(result).toEqual({
    toString: Array.from({ length: 20 }, (_, i) => String(i)),
  });
});

test("[happy-5] percent-encoded member names decode to plain keys; encoded constructor is skipped", () => {
  const result = parseQuery("to%53tring=a&%76alueOf=b&%63onstructor=c&to%53tring=d");
  expect(result).toEqual({ toString: ["a", "d"], valueOf: "b" });
  expect(Object.keys(result)).toEqual(["toString", "valueOf"]);
});

test("[happy-5] keys that only resemble constructor are kept alongside member names", () => {
  const result = parseQuery(
    "constructor[prototype][polluted]=1&Constructor=2&constructor+=3&constructor=4&valueOf=5",
  );
  expect(result).toEqual({
    "constructor[prototype][polluted]": "1",
    Constructor: "2",
    "constructor ": "3",
    valueOf: "5",
  });
  expect(Object.keys(result)).toEqual([
    "constructor[prototype][polluted]",
    "Constructor",
    "constructor ",
    "valueOf",
  ]);
});

// Extends '[happy-5] parseQuery("constructor=a&x=1&constructor=b") ...': constructor between
// repeats of a member-named key.
test("[happy-5] constructor pairs between toString repeats do not break the merge", () => {
  const result = parseQuery("toString=a&constructor=1&toString=b&constructor&toString=c");
  expect(result).toEqual({ toString: ["a", "b", "c"] });
  expect(Object.keys(result)).toEqual(["toString"]);
});

// --- happy-6: existing parsing results are unchanged ---

// Extends the public "[happy-6] parseQuery(...) parses as before" cases: the same parsing
// rules, applied to keys named like Object.prototype members and other inputs.
const parsingCases: Array<{
  input: string;
  output: Record<string, string | string[]>;
}> = [
  { input: "?toString=123&unicode=%E5%A5%BD", output: { toString: "123", unicode: "好" } },
  { input: "valueOf=3&valueOf=", output: { valueOf: ["3", ""] } },
  { input: "valueOf=&valueOf=2&valueOf=3", output: { valueOf: ["", "2", "3"] } },
  {
    input: "toString=1&b=2&toString=3&toString=4",
    output: { toString: ["1", "3", "4"], b: "2" },
  },
  { input: "hasOwnProperty", output: { hasOwnProperty: "" } },
  { input: "to+String=a+b&toString=c", output: { "to String": "a b", toString: "c" } },
  { input: "?a=1&&toString=2&", output: { a: "1", toString: "2" } },
  { input: "toString=b=c", output: { toString: "b=c" } },
  { input: "valueOf=%2B&a=%26", output: { valueOf: "+", a: "&" } },
  { input: "isPrototypeOf=%E5%A5%BD+%E5%A5%BD", output: { isPrototypeOf: "好 好" } },
  { input: "=x&toString=1", output: { x: "", toString: "1" } },
];

for (const { input, output } of parsingCases) {
  test(`[happy-6] parseQuery(${JSON.stringify(input)}) parses as before with member-named keys`, () => {
    expect(parseQuery(input)).toEqual(output);
  });
}

// Extends "[happy-6] keys keep the order they first appear in, even when repeated later".
test("[happy-6] first-seen key order holds when a member-named key repeats later", () => {
  const result = parseQuery("valueOf=1&a=2&toString=3&valueOf=4&a=5");
  expect(Object.keys(result)).toEqual(["valueOf", "a", "toString"]);
  expect(result).toEqual({ valueOf: ["1", "4"], a: ["2", "5"], toString: "3" });
});

test("[happy-6] two hundred repeats of one key merge into one array in input order", () => {
  const input = "?" + Array.from({ length: 200 }, (_, i) => `valueOf=${i}`).join("&");
  const result = parseQuery(input);
  expect(Object.keys(result)).toEqual(["valueOf"]);
  expect(result.valueOf).toEqual(Array.from({ length: 200 }, (_, i) => String(i)));
});

// --- happy-7: stringifyQuery round-trips a parseQuery result ---

// Extends the public "[happy-7] stringifyQuery(parseQuery(...)) is ..." cases and
// "[happy-7] stringifyQuery round-trips keys named like Object.prototype members".
const roundTripCases: Array<{ input: string; output: string }> = [
  {
    input: "toString=a&__proto__=x&constructor=y&b=1&b=2",
    output: "toString=a&b=1&b=2",
  },
  { input: "__proto__=x&constructor=y&valueOf=z", output: "valueOf=z" },
  { input: "hasOwnProperty&x=1", output: "hasOwnProperty&x=1" },
  {
    input: "key+with+space=spaced+value&valueOf=1",
    output: "key+with+space=spaced+value&valueOf=1",
  },
  { input: "?isPrototypeOf=1&isPrototypeOf=2&isPrototypeOf=3", output: "isPrototypeOf=1&isPrototypeOf=2&isPrototypeOf=3" },
  { input: "a=1&a=2&toString=", output: "a=1&a=2&toString" },
];

for (const { input, output } of roundTripCases) {
  test(`[happy-7] stringifyQuery(parseQuery(${JSON.stringify(input)})) is ${JSON.stringify(output)}`, () => {
    expect(stringifyQuery(parseQuery(input))).toBe(output);
  });
}

// --- happy-8: encodeQueryItem is unchanged ---

// Extends '[happy-8] encodeQueryItem("param", ["3", ""]) is "param=3&param="': other values,
// including values read from a parseQuery result under member-named keys.
test("[happy-8] encodeQueryItem encodes values parsed under member-named keys as before", () => {
  const parsed = parseQuery("toString=3&toString=&valueOf=x&hasOwnProperty") as any;
  expect(encodeQueryItem("toString", parsed.toString)).toBe("toString=3&toString=");
  expect(encodeQueryItem("valueOf", parsed.valueOf)).toBe("valueOf=x");
  expect(encodeQueryItem("hasOwnProperty", parsed.hasOwnProperty)).toBe("hasOwnProperty");
  expect(encodeQueryItem("param", ["3", ""])).toBe("param=3&param=");
  expect(encodeQueryItem("param", ["a b", "&", "1"])).toBe("param=a+b&param=%26&param=1");
});

test("[happy-8] encodeQueryItem re-encodes a parsed three-item array in order", () => {
  const parsed = parseQuery("valueOf=&valueOf=2&valueOf=a+b") as any;
  expect(encodeQueryItem("valueOf", parsed.valueOf)).toBe("valueOf=&valueOf=2&valueOf=a+b");
  expect(encodeQueryItem("param", "")).toBe("param");
  expect(encodeQueryItem("param", 0)).toBe("param=0");
});
