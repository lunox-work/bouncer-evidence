import { expect, test } from "vitest";
import { filterQuery, getQuery } from "../../src/utils";

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

// Extends "[happy-1] drops the parameter the predicate rejects": more parameters after the dropped one
test("[happy-1] drops the first of three parameters and keeps the rest in order", () => {
  expect(filterQuery("/foo?bar=1&baz=2&qux=3", (key) => key !== "bar")).toBe(
    "/foo?baz=2&qux=3",
  );
});

// Extends "[happy-1] drops the parameter the predicate rejects": the key is not a fixed literal
test("[happy-1] drops a parameter chosen by a different key", () => {
  expect(
    filterQuery("/search?q=cats&page=2&lang=en", (key) => key !== "page"),
  ).toBe("/search?q=cats&lang=en");
});

// Extends "[happy-1] dropping the last parameter keeps the first": a key that is a prefix of another
test("[happy-1] dropping a key does not drop keys that merely start with it", () => {
  expect(
    filterQuery("/foo?bar=1&barbaz=2&xbar=3", (key) => key !== "bar"),
  ).toBe("/foo?barbaz=2&xbar=3");
});

test("[happy-1] predicate is called with exactly two arguments", () => {
  const { calls, predicate } = recorder((key) => key !== "bar");
  expect(filterQuery("/foo?bar=1&baz=2", predicate)).toBe("/foo?baz=2");
  expect(calls).toHaveLength(2);
  for (const call of calls) {
    expect(call).toHaveLength(2);
  }
});

// @happy 2: Keeping or dropping parameters

// Extends "[happy-2] keeps everything when the predicate returns true": other keys and values
test("[happy-2] keeps every parameter of a longer query", () => {
  expect(filterQuery("/foo?z=26&y=25&x=24&w=23", () => true)).toBe(
    "/foo?z=26&y=25&x=24&w=23",
  );
});

// Extends "[happy-2] drops a middle parameter": drops first and last of five
test("[happy-2] drops the first and the last of five parameters", () => {
  expect(
    filterQuery("/foo?a=1&b=2&c=3&d=4&e=5", (key) => key !== "a" && key !== "e"),
  ).toBe("/foo?b=2&c=3&d=4");
});

// Extends "[happy-2] keeps the hash of a full URL": auth, port and https
test("[happy-2] keeps protocol, auth, port, path and hash of a full URL", () => {
  expect(
    filterQuery(
      "https://user:pass@foo.com:8080/a/b?a=1&b=2&c=3#sec",
      (key) => key === "b",
    ),
  ).toBe("https://user:pass@foo.com:8080/a/b?b=2#sec");
});

// Extends "[happy-2] keeps the hash of a full URL": no pathname
test("[happy-2] works on a full URL without a pathname", () => {
  expect(filterQuery("http://foo.com?a=1&b=2", (key) => key === "b")).toBe(
    "http://foo.com?b=2",
  );
});

// Extends "[happy-2] works on a protocol-relative URL": with a hash and dropping the first key
test("[happy-2] works on a protocol-relative URL with a hash", () => {
  expect(
    filterQuery("//foo.com/p/q?a=1&b=2&c=3#top", (key) => key !== "a"),
  ).toBe("//foo.com/p/q?b=2&c=3#top");
});

// Extends "[happy-2] works on a host-less path without leading slash": dropping a parameter
test("[happy-2] drops a parameter from a host-less path without leading slash", () => {
  expect(filterQuery("foo.com/foo?a=1&b=2", (key) => key === "b")).toBe(
    "foo.com/foo?b=2",
  );
});

// Extends "[happy-2] keeps a trailing slash in the path": deeper path, other key kept
test("[happy-2] keeps a trailing slash in a deeper path", () => {
  expect(filterQuery("/a/b/c/?x=1&y=2&z=3", (key) => key === "z")).toBe(
    "/a/b/c/?z=3",
  );
});

test("[happy-2] works on a query-only input", () => {
  expect(filterQuery("?a=1&b=2", (key) => key === "b")).toBe("?b=2");
});

// @happy 3: The predicate can decide on the value

// Extends "[happy-3] keeps the parameter whose value matches": other values, match in the middle
test("[happy-3] keeps only the parameter whose value matches among several", () => {
  expect(
    filterQuery("/foo?a=red&b=green&c=blue", (_key, value) => value === "green"),
  ).toBe("/foo?b=green");
});

// Extends "[happy-3] keeps the parameter whose value matches": several matches
test("[happy-3] keeps every parameter whose value matches", () => {
  expect(
    filterQuery("/foo?a=1&b=2&c=1&d=3", (_key, value) => value === "1"),
  ).toBe("/foo?a=1&c=1");
});

test("[happy-3] the predicate decides on the decoded value", () => {
  expect(
    filterQuery(
      "/foo?a=hello%20world&b=x",
      (_key, value) => value === "hello world",
    ),
  ).toBe("/foo?a=hello+world");
});

// Extends "[happy-3] drops every parameter when no value matches": combining key and value
test("[happy-3] the predicate can combine key and value", () => {
  expect(
    filterQuery(
      "/foo?a=1&b=1&a2=2",
      (key, value) => key.startsWith("a") && value === "1",
    ),
  ).toBe("/foo?a=1");
});

// @happy 4: Decoded arguments

// Extends "[happy-4] predicate gets decoded key and value": other encodings
const moreDecodedCases: [string, string, string][] = [
  ["/foo?a+b=c+d", "a b", "c d"],
  ["/foo?a%3Db=1", "a=b", "1"],
  ["/foo?h=%23x", "h", "#x"],
  ["/foo?s=%2Fpath%2Fto", "s", "/path/to"],
  ["/foo?n=J%C3%BCrgen", "n", "Jürgen"],
  ["/foo?q=a%3Fb", "q", "a?b"],
  ["http://foo.com/p?e=x%40y.z#frag", "e", "x@y.z"],
];

for (const [input, key, value] of moreDecodedCases) {
  test(`[happy-4] predicate gets decoded key and value for ${input} (more cases)`, () => {
    const { calls, predicate } = recorder(true);
    filterQuery(input, predicate);
    expect(calls).toEqual([[key, value]]);
  });
}

// Extends "[happy-4] predicate gets decoded key and value": several parameters at once
test("[happy-4] every parameter is decoded, one call per key", () => {
  const { calls, predicate } = recorder(true);
  filterQuery("/foo?first=J%C3%BCrgen&last=M%C3%BCller&city=S%C3%A3o+Paulo", predicate);
  expect(calls).toEqual([
    ["first", "Jürgen"],
    ["last", "Müller"],
    ["city", "São Paulo"],
  ]);
});

test("[happy-4] predicate arguments are exactly the entries of getQuery", () => {
  const input =
    "http://foo.com/p?k%20y=%E5%A5%BD&a=1%2B2&a=b=c&e=some+email.com&f&g=x%26y#h";
  const { calls, predicate } = recorder(true);
  filterQuery(input, predicate);
  expect(calls).toEqual(Object.entries(getQuery(input)));
  expect(calls).toEqual([
    ["k y", "好"],
    ["a", ["1+2", "b=c"]],
    ["e", "some email.com"],
    ["f", ""],
    ["g", "x&y"],
  ]);
});

// @happy 5: A repeated key arrives as an array

// Extends "[happy-5] repeated key is passed once as an array": two repeated keys, interleaved
test("[happy-5] two interleaved repeated keys each arrive as one array", () => {
  const { calls, predicate } = recorder(true);
  const result = filterQuery("/foo?b=1&a=x&b=2&a=y&b=3", predicate);
  expect(calls).toEqual([
    ["b", ["1", "2", "3"]],
    ["a", ["x", "y"]],
  ]);
  expect(result).toBe("/foo?b=1&b=2&b=3&a=x&a=y");
});

// Extends "[happy-5] key repeated three times is one call": more occurrences
test("[happy-5] key repeated five times is one call with an array of five", () => {
  const { calls, predicate } = recorder(true);
  const result = filterQuery("/foo?t=5&t=4&t=3&t=2&t=1", predicate);
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe("t");
  expect(Array.isArray(calls[0][1])).toBe(true);
  expect(calls[0][1]).toEqual(["5", "4", "3", "2", "1"]);
  expect(result).toBe("/foo?t=5&t=4&t=3&t=2&t=1");
});

test("[happy-5] items of a repeated key are decoded", () => {
  const { calls, predicate } = recorder(true);
  const result = filterQuery("/foo?t=a%20b&t=c+d&t=%E5%A5%BD", predicate);
  expect(calls).toEqual([["t", ["a b", "c d", "好"]]]);
  expect(result).toBe("/foo?t=a+b&t=c+d&t=%E5%A5%BD");
});

test("[happy-5] a key repeated with the same value still arrives as an array", () => {
  const { calls, predicate } = recorder(true);
  const result = filterQuery("/foo?a=1&a=1", predicate);
  expect(calls).toEqual([["a", ["1", "1"]]]);
  expect(result).toBe("/foo?a=1&a=1");
});

// @happy 6: Keeping or dropping a repeated key as a whole

// Extends "[happy-6] keeps all occurrences of a repeated key": occurrences interleaved with other keys
test("[happy-6] keeps all interleaved occurrences of a repeated key", () => {
  expect(
    filterQuery("/foo?a=1&b=2&a=3&c=4&a=5", (key) => key === "a"),
  ).toBe("/foo?a=1&a=3&a=5");
});

// Extends "[happy-6] drops all occurrences of a repeated key": interleaved occurrences
test("[happy-6] drops all interleaved occurrences of a repeated key", () => {
  expect(
    filterQuery("/foo?a=1&b=2&a=3&c=4&a=5", (key) => key !== "a"),
  ).toBe("/foo?b=2&c=4");
});

// Extends "[happy-6] selects the repeated key by its array value": per-occurrence filtering would keep a=1
test("[happy-6] a value test on one item drops the whole repeated key", () => {
  expect(filterQuery("/foo?a=1&a=2&b=1", (_key, value) => value === "1")).toBe(
    "/foo?b=1",
  );
});

test("[happy-6] a value test that one item fails still keeps the whole repeated key", () => {
  expect(filterQuery("/foo?a=1&a=2&b=2", (_key, value) => value !== "2")).toBe(
    "/foo?a=1&a=2",
  );
});

test("[happy-6] selects the repeated key by the content of its array", () => {
  expect(
    filterQuery(
      "/foo?a=1&a=3&b=3&c=1&c=2",
      (_key, value) => Array.isArray(value) && value.includes("3"),
    ),
  ).toBe("/foo?a=1&a=3");
});

test("[happy-6] selects every repeated key by array length", () => {
  expect(
    filterQuery(
      "/foo?x=1&a=1&a=2&b=1&b=2&b=3",
      (_key, value) => Array.isArray(value) && value.length >= 2,
    ),
  ).toBe("/foo?a=1&a=2&b=1&b=2&b=3");
});
