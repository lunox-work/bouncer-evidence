import { expect, test } from "vitest";
import { filterQuery } from "../src/utils";

type Value = string | string[];

function recorder(returns: boolean | ((key: string, value: Value) => boolean)) {
  const calls: unknown[][] = [];
  const predicate = (...args: [string, Value]) => {
    calls.push(args);
    return typeof returns === "function" ? returns(...args) : returns;
  };
  return { calls, predicate };
}

// @happy 1: Dropping one parameter by key

test("[happy-1] drops the parameter the predicate rejects", () => {
  expect(filterQuery("/foo?bar=1&baz=2", (key) => key !== "bar")).toBe(
    "/foo?baz=2",
  );
});

test("[happy-1] dropping the last parameter keeps the first", () => {
  expect(filterQuery("/foo?bar=1&baz=2", (key) => key !== "baz")).toBe(
    "/foo?bar=1",
  );
});

// @happy 2: Keeping or dropping parameters

test("[happy-2] keeps everything when the predicate returns true", () => {
  expect(filterQuery("/foo?bar=1&baz=2", () => true)).toBe("/foo?bar=1&baz=2");
});

test("[happy-2] drops a middle parameter", () => {
  expect(filterQuery("/foo?a=1&b=2&c=3", (key) => key !== "b")).toBe(
    "/foo?a=1&c=3",
  );
});

test("[happy-2] keeps the hash of a full URL", () => {
  expect(
    filterQuery("http://foo.com/foo?a=1&b=2#hash", (key) => key === "a"),
  ).toBe("http://foo.com/foo?a=1#hash");
});

test("[happy-2] works on a protocol-relative URL", () => {
  expect(filterQuery("//foo.com/p?a=1&b=2", (key) => key === "b")).toBe(
    "//foo.com/p?b=2",
  );
});

test("[happy-2] works on a host-less path without leading slash", () => {
  expect(filterQuery("foo.com/foo?a=1", () => true)).toBe("foo.com/foo?a=1");
});

test("[happy-2] keeps a trailing slash in the path", () => {
  expect(filterQuery("/foo/?a=1&b=2", (key) => key === "a")).toBe("/foo/?a=1");
});

// @happy 3: The predicate can decide on the value

test("[happy-3] keeps the parameter whose value matches", () => {
  expect(filterQuery("/foo?x=1&y=2", (_key, value) => value === "2")).toBe(
    "/foo?y=2",
  );
});

test("[happy-3] drops every parameter when no value matches", () => {
  expect(filterQuery("/foo?x=1&y=2", (_key, value) => value === "3")).toBe(
    "/foo",
  );
});

// @happy 4: Decoded arguments

const decodedCases: [string, string, string][] = [
  ["/foo?email=some%20email.com", "email", "some email.com"],
  ["/foo?email=some+email.com", "email", "some email.com"],
  ["/foo?k%20y=%E5%A5%BD", "k y", "好"],
  ["/foo?a=1%2B2", "a", "1+2"],
  ["/foo?a=x%26y", "a", "x&y"],
  ["/foo?a=b=c", "a", "b=c"],
];

for (const [input, key, value] of decodedCases) {
  test(`[happy-4] predicate gets decoded key and value for ${input}`, () => {
    const { calls, predicate } = recorder(true);
    filterQuery(input, predicate);
    expect(calls).toEqual([[key, value]]);
  });
}

// @happy 5: A repeated key arrives as an array

test("[happy-5] repeated key is passed once as an array", () => {
  const { calls, predicate } = recorder(true);
  const result = filterQuery("/foo?a=1&a=2&b=3", predicate);
  expect(calls).toEqual([
    ["a", ["1", "2"]],
    ["b", "3"],
  ]);
  expect(result).toBe("/foo?a=1&a=2&b=3");
});

test("[happy-5] key repeated three times is one call with all values in order", () => {
  const { calls, predicate } = recorder(true);
  const result = filterQuery("/foo?a=3&a=1&a=2", predicate);
  expect(calls).toEqual([["a", ["3", "1", "2"]]]);
  expect(result).toBe("/foo?a=3&a=1&a=2");
});

// @happy 6: Keeping or dropping a repeated key as a whole

test("[happy-6] keeps all occurrences of a repeated key", () => {
  expect(filterQuery("/foo?a=1&a=2&b=3", (key) => key === "a")).toBe(
    "/foo?a=1&a=2",
  );
});

test("[happy-6] drops all occurrences of a repeated key", () => {
  expect(filterQuery("/foo?a=1&a=2&b=3", (key) => key !== "a")).toBe(
    "/foo?b=3",
  );
});

test("[happy-6] selects the repeated key by its array value", () => {
  expect(
    filterQuery("/foo?a=1&a=2&b=3", (_key, value) => Array.isArray(value)),
  ).toBe("/foo?a=1&a=2");
});

// @boundary 1: Input without "?"

for (const input of ["", "/foo", "http://foo.com/foo#hash", "HTTP://Foo.com/a"]) {
  test(`[boundary-1] input without "?" is returned as given: ${JSON.stringify(input)}`, () => {
    const { calls, predicate } = recorder(false);
    expect(filterQuery(input, predicate)).toBe(input);
    expect(calls).toHaveLength(0);
  });
}

// @boundary 2: The URL is normalized once it contains "?"

test("[boundary-2] URL with a query is rebuilt and normalized", () => {
  expect(filterQuery("HTTP://Foo.com/a?x=1", () => true)).toBe(
    "http://Foo.com/a?x=1",
  );
});

test("[boundary-2] URL with an empty query is normalized and loses the ?", () => {
  expect(filterQuery("HTTP://Foo.com/a?", () => true)).toBe("http://Foo.com/a");
});

// @boundary 3: A "?" that is not a query

test("[boundary-3] ? inside the hash is not a query (predicate true)", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo#a?b=1", predicate)).toBe("/foo#a?b=1");
  expect(calls).toHaveLength(0);
});

test("[boundary-3] ? inside the hash is not a query (predicate false)", () => {
  const { calls, predicate } = recorder(false);
  expect(filterQuery("/foo#a?b", predicate)).toBe("/foo#a?b");
  expect(calls).toHaveLength(0);
});

test("[boundary-3] ? in the hash after a real query is passed through", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?a=1#?b=2", predicate)).toBe("/foo?a=1#?b=2");
  expect(calls).toEqual([["a", "1"]]);
});

// @boundary 4: Every parameter dropped, or no parameters to begin with

const emptyCases: [string, () => boolean, string][] = [
  ["/foo?bar=1&baz=2", () => false, "/foo"],
  ["http://foo.com/foo?a=1#hash", () => false, "http://foo.com/foo#hash"],
  ["/foo?", () => true, "/foo"],
  ["?", () => true, ""],
  ["/foo?#h", () => true, "/foo#h"],
];

for (const [input, predicate, output] of emptyCases) {
  test(`[boundary-4] no parameter left in ${JSON.stringify(input)} leaves no ?`, () => {
    expect(filterQuery(input, predicate)).toBe(output);
  });
}

// @boundary 5: Parameters without a value

const valuelessCases: [string, unknown[][], string][] = [
  ["/foo?test", [["test", ""]], "/foo?test"],
  [
    "/foo?test&x=",
    [
      ["test", ""],
      ["x", ""],
    ],
    "/foo?test&x",
  ],
  ["/foo?a=1&a=", [["a", ["1", ""]]], "/foo?a=1&a="],
];

for (const [input, expectedCalls, output] of valuelessCases) {
  test(`[boundary-5] valueless parameters are passed as "" for ${input}`, () => {
    const { calls, predicate } = recorder(true);
    const result = filterQuery(input, predicate);
    expect(calls).toEqual(expectedCalls);
    expect(result).toBe(output);
  });
}

// @boundary 6: The predicate can select the valueless parameters

test("[boundary-6] keeps only the valueless parameters", () => {
  expect(filterQuery("/foo?x=&y&z=1", (_key, value) => value === "")).toBe(
    "/foo?x&y",
  );
});

test("[boundary-6] drops only the valueless parameters", () => {
  expect(filterQuery("/foo?x=&y&z=1", (_key, value) => value !== "")).toBe(
    "/foo?z=1",
  );
});

// @boundary 7: Encoding is normalized

const encodingCases: [string, string][] = [
  ["/foo?email=some%20email.com", "/foo?email=some+email.com"],
  ["/foo?k%20y=%E5%A5%BD", "/foo?k+y=%E5%A5%BD"],
  ["/foo?a=%7B%22x%22%3A1%7D", "/foo?a=%7B%22x%22:1%7D"],
  ["/foo?a=1%2B2", "/foo?a=1%2B2"],
  ["/foo?a=x%26y&b", "/foo?a=x%26y&b"],
  ["/foo?a=1&&b=2", "/foo?a=1&b=2"],
  ["/foo?x=", "/foo?x"],
];

for (const [input, output] of encodingCases) {
  test(`[boundary-7] kept parameters are re-encoded: ${input}`, () => {
    expect(filterQuery(input, () => true)).toBe(output);
  });
}

// @boundary 8: Output order

const orderCases: [string, string][] = [
  ["/foo?c=3&a=1&b=2", "/foo?c=3&a=1&b=2"],
  ["/foo?a=1&b=2&a=3", "/foo?a=1&a=3&b=2"],
  ["/foo?2=b&1=a", "/foo?1=a&2=b"],
];

for (const [input, output] of orderCases) {
  test(`[boundary-8] output follows parsed key order: ${input}`, () => {
    expect(filterQuery(input, () => true)).toBe(output);
  });
}

// @boundary 9: Predicate call order matches output order

test("[boundary-9] predicate sees integer-like keys first", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?b=x&2=y&1=z", predicate);
  expect(calls.map((c) => c[0])).toEqual(["1", "2", "b"]);
});

test("[boundary-9] integer-like keys are ordered numerically, not lexically", () => {
  const { calls, predicate } = recorder(true);
  const result = filterQuery("/foo?x=c&10=a&9=b", predicate);
  expect(calls.map((c) => c[0])).toEqual(["9", "10", "x"]);
  expect(result).toBe("/foo?9=b&10=a&x=c");
});

// @unhappy 1: Prototype-polluting keys

test("[unhappy-1] __proto__ is removed and never passed to the predicate", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?__proto__=1&x=2", predicate)).toBe("/foo?x=2");
  expect(calls).toEqual([["x", "2"]]);
});

test("[unhappy-1] a lone constructor key leaves no query", () => {
  const { calls, predicate } = recorder(true);
  expect(filterQuery("/foo?constructor=1", predicate)).toBe("/foo");
  expect(calls).toHaveLength(0);
});

// @unhappy 2: A throwing predicate

test("[unhappy-2] rethrows the predicate's error and stops calling it", () => {
  const error = new Error("boom");
  const { calls, predicate } = recorder((key) => {
    if (key === "a") {
      throw error;
    }
    return true;
  });
  let caught: unknown;
  try {
    filterQuery("/foo?a=1&b=2", predicate);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBe(error);
  expect((caught as Error).message).toBe("boom");
  expect(calls).toHaveLength(1);
});

test("[unhappy-2] an error on the last key is rethrown after the earlier calls", () => {
  const error = new Error("boom");
  const { calls, predicate } = recorder((key) => {
    if (key === "b") {
      throw error;
    }
    return true;
  });
  expect(() => filterQuery("/foo?a=1&b=2", predicate)).toThrow(error);
  expect(calls).toEqual([
    ["a", "1"],
    ["b", "2"],
  ]);
});
