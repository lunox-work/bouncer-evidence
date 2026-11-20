import { expect, test } from "vitest";
import { withoutHost } from "../src/utils";
import { withoutHost as withoutHostFromIndex } from "../src";

// @happy 1: The ticket's example URL loses its origin
test("[happy-1] the ticket's example URL loses its origin", () => {
  expect(withoutHost("http://example.com/foo?q=123#bar")).toBe(
    "/foo?q=123#bar",
  );
});

test("[happy-1] boundary: a root path with query and fragment keeps the single slash", () => {
  expect(withoutHost("http://example.com/?q=123#bar")).toBe("/?q=123#bar");
});

// @happy 2: Auth, port and protocol all go along with the host
test("[happy-2] auth, port and protocol all go along with the host", () => {
  const cases = [
    { input: "https://user:pass@example.com:8080/a/b/?x=1#y", output: "/a/b/?x=1#y" },
    { input: "ftp://h/x/", output: "/x/" },
    { input: "file:///home/u", output: "/home/u" },
    { input: "HTTP://A.COM/Foo", output: "/Foo" },
  ];
  for (const t of cases) {
    expect(withoutHost(t.input)).toBe(t.output);
  }
});

test("[happy-2] boundary: auth and port with an IPv6 host are dropped", () => {
  expect(withoutHost("https://u:p@[::1]:443/p?a#b")).toBe("/p?a#b");
});

// @happy 3: withoutHost is re-exported from the package entry
test("[happy-3] withoutHost is re-exported from the package entry", () => {
  expect(withoutHostFromIndex("https://example.com/foo")).toBe("/foo");
});

test("[happy-3] boundary: the package entry export is the same function as the utils export", () => {
  expect(withoutHostFromIndex).toBe(withoutHost);
  expect(withoutHostFromIndex("https://example.com")).toBe("/");
});

// @happy 4: Paths without a protocol pass through
test("[happy-4] paths without a protocol pass through", () => {
  const cases = [
    { input: "/foo?x=1", output: "/foo?x=1" },
    { input: "/", output: "/" },
    { input: "foo/bar", output: "foo/bar" },
    { input: "example.com/foo", output: "example.com/foo" },
  ];
  for (const t of cases) {
    expect(withoutHost(t.input)).toBe(t.output);
  }
});

test("[happy-4] boundary: a relative path with query and fragment passes through", () => {
  expect(withoutHost("foo?x#y")).toBe("foo?x#y");
});

// @happy 5: Percent-encoding is kept as it is
test("[happy-5] percent-encoding is kept as it is", () => {
  expect(withoutHost("http://a.com/foo%20bar?q=a%20b#x%20y")).toBe(
    "/foo%20bar?q=a%20b#x%20y",
  );
});

test("[happy-5] boundary: encoded reserved characters are not decoded", () => {
  expect(withoutHost("http://a.com/%E2%9C%93?q=%2F#%23")).toBe(
    "/%E2%9C%93?q=%2F#%23",
  );
});

// @boundary 1: A URL with only a host gives "/"
test("[boundary-1] a URL with only a host gives a slash", () => {
  expect(withoutHost("http://example.com")).toBe("/");
  expect(withoutHost("http://example.com/")).toBe("/");
});

test("[boundary-1] boundary: a host with auth and port but no path gives a slash", () => {
  expect(withoutHost("http://user@h:1")).toBe("/");
  expect(withoutHost("http://a.com:8080")).toBe("/");
});

// @boundary 2: The query and fragment are kept after the "/" fallback
test("[boundary-2] the query and fragment are kept after the slash fallback", () => {
  const cases = [
    { input: "http://a.com?x=1#h", output: "/?x=1#h" },
    { input: "http://a.com?x=1", output: "/?x=1" },
    { input: "http://a.com#h", output: "/#h" },
  ];
  for (const t of cases) {
    expect(withoutHost(t.input)).toBe(t.output);
  }
});

test("[boundary-2] boundary: a fragment containing a question mark follows the slash fallback", () => {
  expect(withoutHost("http://a.com#h?x")).toBe("/#h?x");
});

// @boundary 3: An empty string gives "/"
test("[boundary-3] an empty string gives a slash", () => {
  expect(withoutHost("")).toBe("/");
});

test("[boundary-3] boundary: an empty string does not throw and gives a string", () => {
  expect(() => withoutHost("")).not.toThrow();
  expect(typeof withoutHost("")).toBe("string");
});

// @boundary 4: A relative path is not given a leading slash
test("[boundary-4] a relative path is not given a leading slash", () => {
  expect(withoutHost("foo/bar")).toBe("foo/bar");
});

test("[boundary-4] boundary: dot-relative and single-segment paths are not given a leading slash", () => {
  expect(withoutHost("a")).toBe("a");
  expect(withoutHost("./foo/bar")).toBe("./foo/bar");
  expect(withoutHost("../x")).toBe("../x");
});

// @boundary 5: Query-only or fragment-only input gets the "/" fallback
test("[boundary-5] query-only or fragment-only input gets the slash fallback", () => {
  expect(withoutHost("?x=1")).toBe("/?x=1");
  expect(withoutHost("#h")).toBe("/#h");
});

test("[boundary-5] boundary: a bare question mark or hash gets the slash fallback", () => {
  expect(withoutHost("?")).toBe("/?");
  expect(withoutHost("#")).toBe("/#");
  expect(withoutHost("?x=1#h")).toBe("/?x=1#h");
});

// @boundary 6: The host is removed from a protocol-relative URL
test("[boundary-6] the host is removed from a protocol-relative URL", () => {
  expect(withoutHost("//example.com/foo")).toBe("/foo");
  expect(withoutHost("//example.com")).toBe("/");
});

test("[boundary-6] boundary: a protocol-relative URL with auth, port and query loses its origin", () => {
  expect(withoutHost("//u@example.com:80/a")).toBe("/a");
  expect(withoutHost("//example.com?x=1")).toBe("/?x=1");
});

// @boundary 7: Unencoded characters are not encoded
test("[boundary-7] unencoded characters are not encoded", () => {
  expect(withoutHost("http://a.com/foo bar?q=a b#c d")).toBe(
    "/foo bar?q=a b#c d",
  );
});

test("[boundary-7] boundary: non-ASCII and plus characters are not encoded", () => {
  expect(withoutHost("http://a.com/a+b?q=é#ü")).toBe("/a+b?q=é#ü");
});

// @boundary 8: An empty "?" or "#" is kept
test("[boundary-8] an empty question mark or hash is kept", () => {
  expect(withoutHost("http://a.com/foo?")).toBe("/foo?");
  expect(withoutHost("http://a.com/foo#")).toBe("/foo#");
});

test("[boundary-8] boundary: an empty question mark and hash together are both kept", () => {
  expect(withoutHost("http://a.com/foo?#")).toBe("/foo?#");
  expect(withoutHost("http://example.com?")).toBe("/?");
  expect(withoutHost("http://example.com#")).toBe("/#");
});

// @boundary 9: Repeated slashes in the path are not cleaned up
test("[boundary-9] repeated slashes in the path are not cleaned up", () => {
  expect(withoutHost("http://a.com//foo")).toBe("//foo");
});

test("[boundary-9] boundary: repeated slashes at the start and middle of the path are kept", () => {
  expect(withoutHost("http://a.com///foo//bar")).toBe("///foo//bar");
});

// @boundary 10: Leading whitespace and backslashes are handled as parseURL handles them
test("[boundary-10] leading whitespace and backslashes are handled as parseURL handles them", () => {
  expect(withoutHost("  http://a.com/foo")).toBe("/foo");
  expect(withoutHost("http:\\\\a.com\\foo")).toBe("/foo");
});

test("[boundary-10] boundary: leading tab, newline and uppercase protocol with backslashes", () => {
  expect(withoutHost("\thttp://a.com/foo")).toBe("/foo");
  expect(withoutHost("\n  https://a.com")).toBe("/");
  expect(withoutHost("HTTPS:\\\\a.com\\x\\y")).toBe("/x/y");
});

// @unhappy 1: Input that is not an absolute URL is not rejected
test("[unhappy-1] input that is not an absolute URL is not rejected", () => {
  expect(() => withoutHost("foo/bar")).not.toThrow();
  expect(withoutHost("foo/bar")).toBe("foo/bar");
});

test("[unhappy-1] boundary: whitespace-only input is not rejected", () => {
  expect(() => withoutHost("   ")).not.toThrow();
  expect(withoutHost("   ")).toBe("   ");
});

// @unhappy 2: A script-protocol URL gives what follows the protocol
test("[unhappy-2] a script-protocol URL gives what follows the protocol", () => {
  expect(() => withoutHost("javascript:alert(1)")).not.toThrow();
  expect(withoutHost("javascript:alert(1)")).toBe("alert(1)");
});

test("[unhappy-2] boundary: mixed-case script and data protocols give what follows the protocol", () => {
  expect(withoutHost("JavaScript:alert(1)")).toBe("alert(1)");
  expect(withoutHost("javascript:void(0)")).toBe("void(0)");
  expect(withoutHost("data:text/html,hi")).toBe("text/html,hi");
});

// @unhappy 3: A protocol with no "//" and no path gives "/"
test("[unhappy-3] a protocol with no double slash and no path gives a slash", () => {
  expect(() => withoutHost("mailto:a@b.com")).not.toThrow();
  expect(withoutHost("mailto:a@b.com")).toBe("/");
});

test("[unhappy-3] boundary: a bare protocol with nothing after it gives a slash", () => {
  expect(() => withoutHost("mailto:")).not.toThrow();
  expect(withoutHost("mailto:")).toBe("/");
});
