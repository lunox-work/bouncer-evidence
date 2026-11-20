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

// @boundary 1: Input without "?"

// Extends "[boundary-1] input without "?" is returned as given": inputs that parseURL + stringifyParsedURL would change
const noQueryInputs = [
  "foo.com/foo",
  "//Foo.com/a",
  "HTTPS://user:pass@Foo.com:8080/A/B#Frag",
  "http:\\\\foo.com\\a",
  "  http://foo.com/a",
  "/foo#",
  "#",
  "/a%20b/c d",
  "/foo&bar=1",
  "http://foo.com/foo=1&b=2#x=1",
];

for (const input of noQueryInputs) {
  test(`[boundary-1] input without "?" is returned exactly and the predicate is not called: ${JSON.stringify(input)}`, () => {
    const { calls, predicate } = recorder(false);
    expect(filterQuery(input, predicate)).toBe(input);
    expect(calls).toHaveLength(0);
  });
}

test("[boundary-1] a throwing predicate is never reached when there is no ?", () => {
  const predicate = (): boolean => {
    throw new Error("must not be called");
  };
  expect(filterQuery("HTTP://Foo.com/a#b", predicate)).toBe(
    "HTTP://Foo.com/a#b",
  );
});

// @boundary 2: The URL is normalized once it contains "?"

// Extends "[boundary-2] URL with a query is rebuilt and normalized": dropping a parameter too
test("[boundary-2] protocol is lowercased while filtering a parameter", () => {
  expect(filterQuery("HTTP://Foo.com/a?x=1&y=2", (key) => key === "y")).toBe(
    "http://Foo.com/a?y=2",
  );
});

// Extends "[boundary-2] URL with a query is rebuilt and normalized": other protocol, no path
test("[boundary-2] uppercase https protocol without a path is lowercased", () => {
  expect(filterQuery("HTTPS://Foo.com?x=1", () => true)).toBe(
    "https://Foo.com?x=1",
  );
});

// Extends "[boundary-2] URL with an empty query is normalized and loses the ?": everything dropped
test("[boundary-2] URL is normalized when every parameter is dropped", () => {
  expect(filterQuery("HTTP://Foo.com/a?x=1#H", () => false)).toBe(
    "http://Foo.com/a#H",
  );
});

test("[boundary-2] backslashes of a full URL are normalized once it contains ?", () => {
  expect(filterQuery("http:\\\\foo.com\\a?x=1", () => true)).toBe(
    "http://foo.com/a?x=1",
  );
});

test("[boundary-2] leading whitespace of a full URL is dropped once it contains ?", () => {
  expect(filterQuery("  http://foo.com/a?x=1", () => true)).toBe(
    "http://foo.com/a?x=1",
  );
});

test("[boundary-2] a ? only in the hash still makes the URL normalized", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("HTTP://Foo.com/a#?x=1", predicate)).toBe(
    "http://Foo.com/a#?x=1",
  );
  expect(calls).toHaveLength(0);
});

// @boundary 3: A "?" that is not a query

// Extends "[boundary-3] ? inside the hash is not a query": full URL, several would-be params
test("[boundary-3] ? inside the hash of a full URL is not a query", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("http://foo.com/a#x?y=1&z=2", predicate)).toBe(
    "http://foo.com/a#x?y=1&z=2",
  );
  expect(calls).toHaveLength(0);
});

// Extends "[boundary-3] ? in the hash after a real query is passed through": filtering the real query
test("[boundary-3] filtering the real query leaves a ? query-like hash untouched", () => {
  const { calls, predicate } = recorder((key) => key !== "b");
  expect(filterQuery("/foo?a=1&b=2#x?b=3&c", predicate)).toBe(
    "/foo?a=1#x?b=3&c",
  );
  expect(calls).toEqual([
    ["a", "1"],
    ["b", "2"],
  ]);
});

test("[boundary-3] dropping the whole real query keeps a hash that contains ?", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("/foo?a=1#?a=1", predicate)).toBe("/foo#?a=1");
  expect(calls).toEqual([["a", "1"]]);
});

test("[boundary-3] ? inside the hash of a protocol-relative URL is not a query", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("//foo.com/p#?a=1", predicate)).toBe("//foo.com/p#?a=1");
  expect(calls).toHaveLength(0);
});

// @boundary 4: Every parameter dropped, or no parameters to begin with

// Extends "[boundary-4] no parameter left ... leaves no ?": other URL shapes
const moreEmptyCases: [string, () => boolean, string][] = [
  ["//foo.com/p?a=1#h", () => false, "//foo.com/p#h"],
  ["?a=1", () => false, ""],
  ["?a=1&b=2#h", () => false, "#h"],
  ["foo.com/foo?a=1&a=2", () => false, "foo.com/foo"],
  ["/foo/?a=1", () => false, "/foo/"],
  ["/foo?&&", () => true, "/foo"],
  ["/foo?&", () => true, "/foo"],
  ["http://foo.com?", () => true, "http://foo.com"],
  ["http://foo.com/?a=1&b=2&c=3", () => false, "http://foo.com/"],
  ["?#", () => true, "#"],
];

for (const [input, predicate, output] of moreEmptyCases) {
  test(`[boundary-4] no parameter left in ${JSON.stringify(input)} leaves no ? (more cases)`, () => {
    expect(filterQuery(input, predicate)).toBe(output);
  });
}

test("[boundary-4] predicate is not called when the query is empty", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?#h", predicate)).toBe("/foo#h");
  expect(calls).toHaveLength(0);
});

// @boundary 5: Parameters without a value

// Extends "[boundary-5] valueless parameters are passed as \"\"": more items and mixed forms
const moreValuelessCases: [string, unknown[][], string][] = [
  [
    "/foo?a&b&c",
    [
      ["a", ""],
      ["b", ""],
      ["c", ""],
    ],
    "/foo?a&b&c",
  ],
  ["/foo?a=&a", [["a", ["", ""]]], "/foo?a=&a="],
  ["/foo?a&a=1", [["a", ["", "1"]]], "/foo?a=&a=1"],
  [
    "/foo?x=1&flag&y=",
    [
      ["x", "1"],
      ["flag", ""],
      ["y", ""],
    ],
    "/foo?x=1&flag&y",
  ],
  ["http://foo.com/p?only#h", [["only", ""]], "http://foo.com/p?only#h"],
];

for (const [input, expectedCalls, output] of moreValuelessCases) {
  test(`[boundary-5] valueless parameters are passed as "" for ${input} (more cases)`, () => {
    const { calls, predicate } = recorder(true);
    const result = filterQuery(input, predicate);
    expect(calls).toEqual(expectedCalls);
    expect(result).toBe(output);
  });
}

// @boundary 6: The predicate can select the valueless parameters

// Extends "[boundary-6] keeps only the valueless parameters": more items, mixed order
test("[boundary-6] keeps only the valueless parameters among many", () => {
  expect(
    filterQuery("/foo?a=1&b&c=&d=2&e", (_key, value) => value === ""),
  ).toBe("/foo?b&c&e");
});

// Extends "[boundary-6] keeps only the valueless parameters": a repeated key with an empty item is an array, not ""
test("[boundary-6] a repeated key with an empty item is not selected as valueless", () => {
  expect(filterQuery("/foo?a=&a=1&b", (_key, value) => value === "")).toBe(
    "/foo?b",
  );
});

// Extends "[boundary-6] drops only the valueless parameters": with a repeated key
test("[boundary-6] dropping valueless parameters keeps a repeated key with an empty item", () => {
  expect(filterQuery("/foo?a=&a=1&b&c=2", (_key, value) => value !== "")).toBe(
    "/foo?a=&a=1&c=2",
  );
});

// @boundary 7: Encoding is normalized

// Extends "[boundary-7] kept parameters are re-encoded": other characters
const moreEncodingCases: [string, string][] = [
  ["/foo?a b=c d", "/foo?a+b=c+d"],
  ["/foo?a=%2F", "/foo?a=%2F"],
  ["/foo?a=/x/", "/foo?a=%2Fx%2F"],
  ["/foo?a=%23", "/foo?a=%23"],
  ["/foo?a=%7e", "/foo?a=~"],
  ["/foo?a=%41%42", "/foo?a=AB"],
  ["/foo?a=é", "/foo?a=%C3%A9"],
  ["/foo?a=b%3Dc", "/foo?a=b=c"],
  ["/foo?a%3Db=c", "/foo?a%3Db=c"],
  ["/foo?a=1&&&b=2&", "/foo?a=1&b=2"],
  ["/foo?a=%5E%60", "/foo?a=^`"],
  ["http://foo.com/p?q=a%20b&r=c%2Bd#h", "http://foo.com/p?q=a+b&r=c%2Bd#h"],
];

for (const [input, output] of moreEncodingCases) {
  test(`[boundary-7] kept parameters are re-encoded: ${input} (more cases)`, () => {
    expect(filterQuery(input, () => true)).toBe(output);
  });
}

test("[boundary-7] surviving parameters are re-encoded when others are dropped", () => {
  expect(
    filterQuery(
      "/foo?drop=1&email=some%20email.com&x=",
      (key) => key !== "drop",
    ),
  ).toBe("/foo?email=some+email.com&x");
});

// @boundary 8: Output order

// Extends "[boundary-8] output follows parsed key order": more keys, repeated keys and integer keys together
const moreOrderCases: [string, string][] = [
  ["/foo?z=1&10=x&b=2&3=y&z=3", "/foo?3=y&10=x&z=1&z=3&b=2"],
  ["/foo?3=c&2=b&1=a&0=z", "/foo?0=z&1=a&2=b&3=c"],
  ["/foo?b=1&a=2&b=3&a=4", "/foo?b=1&b=3&a=2&a=4"],
  ["/foo?1.5=b&-1=c&1=d", "/foo?1=d&1.5=b&-1=c"],
  ["/foo?100=a&20=b&3=c", "/foo?3=c&20=b&100=a"],
];

for (const [input, output] of moreOrderCases) {
  test(`[boundary-8] output follows parsed key order: ${input} (more cases)`, () => {
    expect(filterQuery(input, () => true)).toBe(output);
  });
}

test("[boundary-8] parsed key order is kept while dropping parameters", () => {
  expect(
    filterQuery("/foo?b=1&2=x&a=3&1=y&b=4", (key) => key !== "a"),
  ).toBe("/foo?1=y&2=x&b=1&b=4");
});

// @boundary 9: Predicate call order matches output order

// Extends "[boundary-9] predicate sees integer-like keys first": repeated key placed at first appearance
test("[boundary-9] predicate calls follow parsed order with a repeated key", () => {
  const { calls, predicate } = recorder(true);
  const result = filterQuery("/foo?b=1&a=2&b=3&5=x", predicate);
  expect(calls).toEqual([
    ["5", "x"],
    ["b", ["1", "3"]],
    ["a", "2"],
  ]);
  expect(result).toBe("/foo?5=x&b=1&b=3&a=2");
});

// Extends "[boundary-9] integer-like keys are ordered numerically": more integer keys
test("[boundary-9] predicate sees many integer-like keys in ascending numeric order", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?k=0&100=a&2=b&33=c&z=1&1=d", predicate);
  expect(calls.map((c) => c[0])).toEqual(["1", "2", "33", "100", "k", "z"]);
});

test("[boundary-9] predicate call order is the output order when filtering", () => {
  const { calls, predicate } = recorder((key) => key !== "2");
  const result = filterQuery("/foo?y=1&2=a&x=2&1=b", predicate);
  expect(calls.map((c) => c[0])).toEqual(["1", "2", "y", "x"]);
  expect(result).toBe("/foo?1=b&y=1&x=2");
});
