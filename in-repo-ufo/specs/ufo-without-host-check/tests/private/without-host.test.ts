import { expect, expectTypeOf, test } from "vitest";
import { withoutHost } from "../../src/utils";
import { parseURL } from "../../src/parse";
import { withoutHost as withoutHostFromIndex } from "../../src";

// ---------------------------------------------------------------------------
// @happy 1: The ticket's example URL loses its origin
// ---------------------------------------------------------------------------

test("[happy-1] the ticket's example URL gives its path, query and fragment", () => {
  const result = withoutHost("http://example.com/foo?q=123#bar");
  expectTypeOf(result).toEqualTypeOf<string>();
  expect(result).toBe("/foo?q=123#bar");
});

// Extends public "[happy-1] the ticket's example URL loses its origin": other host, longer path, more params
test("[happy-1] another host with a deeper path and several params loses its origin", () => {
  expect(
    withoutHost("https://www.example.org/docs/guide/intro.html?a=1&b=2&c=#sec-3"),
  ).toBe("/docs/guide/intro.html?a=1&b=2&c=#sec-3");
});

// Extends public "[happy-1] boundary: a root path with query and fragment keeps the single slash"
test("[happy-1] extra question marks and hashes stay in the query and fragment as parsed", () => {
  expect(withoutHost("http://a.com/foo?a=1?b=2#x#y")).toBe("/foo?a=1?b=2#x#y");
  expect(withoutHost("http://a.com/foo#bar?x")).toBe("/foo#bar?x");
});

// Shortcut: greedy "strip everything up to the last //host" breaks when the query holds a URL
test("[happy-1] a URL inside the query does not confuse host removal", () => {
  expect(withoutHost("http://a.com/p?next=https://b.com/x#c")).toBe(
    "/p?next=https://b.com/x#c",
  );
});

// ---------------------------------------------------------------------------
// @happy 2: Auth, port and protocol all go along with the host
// ---------------------------------------------------------------------------

test("[happy-2] auth, port and protocol are dropped for each table row", () => {
  expect(withoutHost("https://user:pass@example.com:8080/a/b/?x=1#y")).toBe(
    "/a/b/?x=1#y",
  );
  expect(withoutHost("ftp://h/x/")).toBe("/x/");
  expect(withoutHost("file:///home/u")).toBe("/home/u");
  expect(withoutHost("HTTP://A.COM/Foo")).toBe("/Foo");
});

// Extends public "[happy-2] auth, port and protocol all go along with the host": other protocols
test("[happy-2] other protocols with auth and port lose their origin", () => {
  expect(withoutHost("ws://a.com:1/s?t")).toBe("/s?t");
  expect(withoutHost("git+ssh://git@github.com/u/r.git")).toBe("/u/r.git");
  expect(withoutHost("http://127.0.0.1:3000/api/v1?x=1")).toBe("/api/v1?x=1");
});

// Extends public "[happy-2] ...": letter case in the path, query and fragment is kept
test("[happy-2] letter case after the host is kept", () => {
  expect(withoutHost("HTTP://A.COM/FOO/Bar?Q=X#Y")).toBe("/FOO/Bar?Q=X#Y");
});

// Shortcut: "remove up to the first @" would eat part of the path
test("[happy-2] an @ in the path or query is not taken as auth", () => {
  expect(withoutHost("http://a.com/x@y")).toBe("/x@y");
  expect(withoutHost("http://u:p@a.com/x@y?e=a@b")).toBe("/x@y?e=a@b");
});

// The pathname is taken exactly as parseURL returns it, including its drive-letter handling
test("[happy-2] a drive letter path is returned as parseURL parses it", () => {
  expect(withoutHost("file:///C:/x/y")).toBe("C:/x/y");
  expect(withoutHost("http://a.com/C:/foo")).toBe("C:/foo");
});

// Extends public "[happy-2] ...": a much longer input
test("[happy-2] a long URL keeps its whole path, query and fragment", () => {
  const path = "/" + "seg/".repeat(500);
  const query = "?" + Array.from({ length: 200 }, (_, i) => `k${i}=v${i}`).join("&");
  const input = "https://user:pw@example.com:8443" + path + query + "#end";
  expect(withoutHost(input)).toBe(path + query + "#end");
});

// ---------------------------------------------------------------------------
// @happy 3: withoutHost is re-exported from the package entry
// ---------------------------------------------------------------------------

test("[happy-3] the package entry export removes the origin", () => {
  expect(withoutHostFromIndex("https://example.com/foo")).toBe("/foo");
});

// Extends public "[happy-3] withoutHost is re-exported from the package entry": other inputs
test("[happy-3] the package entry export handles query, fragment, empty and relative input", () => {
  expect(withoutHostFromIndex("http://a.com?x=1#h")).toBe("/?x=1#h");
  expect(withoutHostFromIndex("")).toBe("/");
  expect(withoutHostFromIndex("foo/bar")).toBe("foo/bar");
  expect(withoutHostFromIndex("https://u:p@a.com:1/p/q?r#s")).toBe("/p/q?r#s");
});

// ---------------------------------------------------------------------------
// @happy 4: Paths without a protocol pass through
// ---------------------------------------------------------------------------

test("[happy-4] each path without a protocol passes through", () => {
  expect(withoutHost("/foo?x=1")).toBe("/foo?x=1");
  expect(withoutHost("/")).toBe("/");
  expect(withoutHost("foo/bar")).toBe("foo/bar");
  expect(withoutHost("example.com/foo")).toBe("example.com/foo");
});

// Extends public "[happy-4] paths without a protocol pass through": more paths
test("[happy-4] deeper absolute paths with query and fragment pass through", () => {
  expect(withoutHost("/a/b/c/?x=1&y=2#frag")).toBe("/a/b/c/?x=1&y=2#frag");
  expect(withoutHost("www.example.com/a?b#c")).toBe("www.example.com/a?b#c");
});

// Shortcut: treating any input as a URL (normalising backslashes or trimming) changes paths
test("[happy-4] backslashes and surrounding spaces in a path without a protocol are kept", () => {
  expect(withoutHost("foo\\bar")).toBe("foo\\bar");
  expect(withoutHost("c:\\foo")).toBe("c:\\foo");
  expect(withoutHost("  /foo")).toBe("  /foo");
  expect(withoutHost("/foo  ")).toBe("/foo  ");
});

// A single letter before ":" is not a protocol for parseURL, so the input is a path
test("[happy-4] a single-letter prefix with a colon is treated as a path", () => {
  expect(withoutHost("C:/foo")).toBe("C:/foo");
  expect(withoutHost("x:/y")).toBe("x:/y");
});

// ---------------------------------------------------------------------------
// @happy 5: Percent-encoding is kept as it is
// ---------------------------------------------------------------------------

test("[happy-5] percent-encoded path, query and fragment are kept as they are", () => {
  expect(withoutHost("http://a.com/foo%20bar?q=a%20b#x%20y")).toBe(
    "/foo%20bar?q=a%20b#x%20y",
  );
});

// Extends public "[happy-5] boundary: encoded reserved characters are not decoded"
test("[happy-5] encoded slash, question mark, hash and percent are not decoded", () => {
  expect(withoutHost("https://a.com/%2F%3F%23?%26=%3D#%25")).toBe(
    "/%2F%3F%23?%26=%3D#%25",
  );
});

// Shortcut: decoding (or re-encoding) would throw or change malformed escapes
test("[happy-5] malformed percent sequences are kept and do not throw", () => {
  expect(withoutHost("http://a.com/%?q=%zz#%E2")).toBe("/%?q=%zz#%E2");
  expect(withoutHost("/%zz%")).toBe("/%zz%");
});

// ---------------------------------------------------------------------------
// @boundary 1: A URL with only a host gives "/"
// ---------------------------------------------------------------------------

test("[boundary-1] a host with or without a trailing slash gives a slash", () => {
  expect(withoutHost("http://example.com")).toBe("/");
  expect(withoutHost("http://example.com/")).toBe("/");
});

// Extends public "[boundary-1] boundary: a host with auth and port but no path gives a slash"
test("[boundary-1] other host-only URLs give a slash", () => {
  expect(withoutHost("http://user@a.com")).toBe("/");
  expect(withoutHost("ws://a.com:1")).toBe("/");
  expect(withoutHost("HTTPS://A.COM")).toBe("/");
  expect(withoutHost("https://u:p@[::1]:443")).toBe("/");
});

test("[boundary-1] a protocol with an empty host gives a slash", () => {
  expect(withoutHost("http://")).toBe("/");
  expect(withoutHost("file://")).toBe("/");
});

// ---------------------------------------------------------------------------
// @boundary 2: The query and fragment are kept after the "/" fallback
// ---------------------------------------------------------------------------

test("[boundary-2] the query and fragment follow the slash fallback for each table row", () => {
  expect(withoutHost("http://a.com?x=1#h")).toBe("/?x=1#h");
  expect(withoutHost("http://a.com?x=1")).toBe("/?x=1");
  expect(withoutHost("http://a.com#h")).toBe("/#h");
});

// Extends public "[boundary-2] the query and fragment are kept after the slash fallback": port, auth, empty host
test("[boundary-2] the slash fallback comes first with a port, auth or empty host", () => {
  expect(withoutHost("http://a.com:8080?x")).toBe("/?x");
  expect(withoutHost("https://u:p@a.com?a=1&b=2#c")).toBe("/?a=1&b=2#c");
  expect(withoutHost("https://#x")).toBe("/#x");
});

// Shortcut: greedy host stripping breaks on a URL in the query of a host-only URL
test("[boundary-2] a URL inside the query after the slash fallback is kept", () => {
  expect(withoutHost("http://a.com?q=http://b.com/x")).toBe("/?q=http://b.com/x");
});

// ---------------------------------------------------------------------------
// @boundary 3: An empty string gives "/"
// ---------------------------------------------------------------------------

test("[boundary-3] the empty string gives a slash", () => {
  expect(withoutHost("")).toBe("/");
});

// Extends public "[boundary-3] an empty string gives a slash": repeated calls stay the same
test("[boundary-3] repeated calls with the empty string keep giving a slash", () => {
  const results = [withoutHost(""), withoutHost("http://a.com/x"), withoutHost("")];
  expect(results).toEqual(["/", "/x", "/"]);
});

// ---------------------------------------------------------------------------
// @boundary 4: A relative path is not given a leading slash
// ---------------------------------------------------------------------------

test("[boundary-4] foo/bar is not given a leading slash", () => {
  expect(withoutHost("foo/bar")).toBe("foo/bar");
});

// Extends public "[boundary-4] boundary: dot-relative and single-segment paths ...": with query, fragment, longer
test("[boundary-4] relative paths with query, fragment and many segments are not given a leading slash", () => {
  expect(withoutHost("a/b/c?x=1#y")).toBe("a/b/c?x=1#y");
  expect(withoutHost("../../x?y")).toBe("../../x?y");
  const long = "seg/".repeat(300) + "end";
  expect(withoutHost(long)).toBe(long);
});

// Leading whitespace makes the pathname non-empty, so there is no "/" fallback
test("[boundary-4] whitespace before a query or fragment is a non-empty path and gets no slash", () => {
  expect(withoutHost("  ?x")).toBe("  ?x");
  expect(withoutHost("  #y")).toBe("  #y");
});

// ---------------------------------------------------------------------------
// @boundary 5: Query-only or fragment-only input gets the "/" fallback
// ---------------------------------------------------------------------------

test("[boundary-5] query-only and fragment-only input get the slash fallback", () => {
  expect(withoutHost("?x=1")).toBe("/?x=1");
  expect(withoutHost("#h")).toBe("/#h");
});

// Extends public "[boundary-5] boundary: a bare question mark or hash gets the slash fallback"
test("[boundary-5] longer queries and a fragment holding a question mark get the slash fallback", () => {
  expect(withoutHost("?a=1&b=2&c=3")).toBe("/?a=1&b=2&c=3");
  expect(withoutHost("?x=1#h?y")).toBe("/?x=1#h?y");
  expect(withoutHost("#h?x")).toBe("/#h?x");
  expect(withoutHost("?#")).toBe("/?#");
});

// ---------------------------------------------------------------------------
// @boundary 6: The host is removed from a protocol-relative URL
// ---------------------------------------------------------------------------

test("[boundary-6] a protocol-relative URL loses its host for each table row", () => {
  expect(withoutHost("//example.com/foo")).toBe("/foo");
  expect(withoutHost("//example.com")).toBe("/");
});

// Extends public "[boundary-6] boundary: a protocol-relative URL with auth, port and query loses its origin"
test("[boundary-6] a protocol-relative URL with a fragment or deep path loses its host", () => {
  expect(withoutHost("//a.com#h")).toBe("/#h");
  expect(withoutHost("//u:p@a.com:8080/x/y?z#w")).toBe("/x/y?z#w");
});

test("[boundary-6] a protocol-relative URL written with backslashes loses its host", () => {
  expect(withoutHost("\\\\a.com\\foo")).toBe("/foo");
});

test("[boundary-6] a URL starting with three slashes is parsed as protocol-relative", () => {
  expect(withoutHost("///foo")).toBe("/foo");
});

// parseURL only treats input as protocol-relative when it starts with the slashes
test("[boundary-6] leading spaces before // make the input a plain path", () => {
  expect(withoutHost("  //a.com/x")).toBe("  //a.com/x");
});

// ---------------------------------------------------------------------------
// @boundary 7: Unencoded characters are not encoded
// ---------------------------------------------------------------------------

test("[boundary-7] spaces in path, query and fragment are not encoded", () => {
  expect(withoutHost("http://a.com/foo bar?q=a b#c d")).toBe("/foo bar?q=a b#c d");
});

// Extends public "[boundary-7] boundary: non-ASCII and plus characters are not encoded"
test("[boundary-7] angle brackets, quotes, emoji and trailing spaces are not encoded", () => {
  expect(withoutHost('http://a.com/<a>"b"?q=😀&r=|#{x}')).toBe('/<a>"b"?q=😀&r=|#{x}');
  expect(withoutHost("http://a.com/foo  ")).toBe("/foo  ");
});

// ---------------------------------------------------------------------------
// @boundary 8: An empty "?" or "#" is kept
// ---------------------------------------------------------------------------

test("[boundary-8] an empty question mark or hash after the path is kept", () => {
  expect(withoutHost("http://a.com/foo?")).toBe("/foo?");
  expect(withoutHost("http://a.com/foo#")).toBe("/foo#");
});

// Extends public "[boundary-8] boundary: an empty question mark and hash together are both kept"
test("[boundary-8] an empty question mark or hash is kept on root paths, ports and plain paths", () => {
  expect(withoutHost("http://a.com/?")).toBe("/?");
  expect(withoutHost("http://a.com:80/#")).toBe("/#");
  expect(withoutHost("/foo?")).toBe("/foo?");
  expect(withoutHost("/foo#")).toBe("/foo#");
  expect(withoutHost("//a.com?#")).toBe("/?#");
});

// ---------------------------------------------------------------------------
// @boundary 9: Repeated slashes in the path are not cleaned up
// ---------------------------------------------------------------------------

test("[boundary-9] a doubled leading slash in the path is kept", () => {
  expect(withoutHost("http://a.com//foo")).toBe("//foo");
});

// Extends public "[boundary-9] boundary: repeated slashes at the start and middle of the path are kept"
test("[boundary-9] trailing repeated slashes and dot segments are kept", () => {
  expect(withoutHost("http://a.com/a//b//")).toBe("/a//b//");
  expect(withoutHost("http://a.com/../x/./y")).toBe("/../x/./y");
  expect(withoutHost("http://a.com//")).toBe("//");
});

test("[boundary-9] double slashes in the query are kept", () => {
  expect(withoutHost("http://a.com/p?q=//b.com")).toBe("/p?q=//b.com");
});

// ---------------------------------------------------------------------------
// @boundary 10: Leading whitespace and backslashes are handled as parseURL handles them
// ---------------------------------------------------------------------------

test("[boundary-10] leading spaces are skipped and backslashes read as slashes", () => {
  expect(withoutHost("  http://a.com/foo")).toBe("/foo");
  expect(withoutHost("http:\\\\a.com\\foo")).toBe("/foo");
});

// Extends public "[boundary-10] boundary: leading tab, newline and uppercase protocol with backslashes"
test("[boundary-10] a leading NUL and mixed whitespace before the protocol are skipped", () => {
  expect(withoutHost("\0http://a.com/z")).toBe("/z");
  expect(withoutHost("\t\n http://a.com")).toBe("/");
  expect(withoutHost("  https://a.com?x#y")).toBe("/?x#y");
});

// Backslash handling applies to the whole URL, the query and fragment included
test("[boundary-10] backslashes in the query and fragment of a URL with a protocol become slashes", () => {
  expect(withoutHost("http://a.com/foo?x=\\y#\\z")).toBe("/foo?x=/y#/z");
  expect(withoutHost("https:\\\\u@a.com:1\\a\\b")).toBe("/a/b");
});

test("[boundary-10] the result equals parseURL's pathname (or slash), search and hash for many inputs", () => {
  const inputs = [
    "  http://a.com/foo",
    "http:\\\\a.com\\foo",
    "\t\thttps://a.com/x?y#z",
    "\0\0http://a.com",
    "ftp://u@h:21/d/f.txt",
    "//h/p?q#r",
    "/plain?x",
    "rel/path#f",
    "http://a.com/C:/x",
    "mailto:x@y.z?s",
    "data:text/plain,hi?x#y",
    "",
  ];
  for (const input of inputs) {
    const { pathname, search, hash } = parseURL(input);
    expect(withoutHost(input)).toBe((pathname || "/") + search + hash);
  }
});

// ---------------------------------------------------------------------------
// @unhappy 1: Input that is not an absolute URL is not rejected
// ---------------------------------------------------------------------------

test("[unhappy-1] foo/bar is returned without an error", () => {
  let result: unknown;
  expect(() => {
    result = withoutHost("foo/bar");
  }).not.toThrow();
  expect(result).toBe("foo/bar");
});

// Extends public "[unhappy-1] boundary: whitespace-only input is not rejected": other malformed inputs
test("[unhappy-1] malformed and odd inputs are not rejected", () => {
  const cases = [
    { input: "::::", output: "::::" },
    { input: "%", output: "%" },
    { input: "%zz", output: "%zz" },
    { input: "\uD800", output: "\uD800" },
    { input: "http://[", output: "/" },
    { input: "not a url at all", output: "not a url at all" },
    { input: "\0", output: "\0" },
  ];
  for (const t of cases) {
    let result: unknown;
    expect(() => {
      result = withoutHost(t.input);
    }).not.toThrow();
    expect(result).toBe(t.output);
  }
});

// ---------------------------------------------------------------------------
// @unhappy 2: A script-protocol URL gives what follows the protocol
// ---------------------------------------------------------------------------

test("[unhappy-2] javascript:alert(1) gives alert(1) without an error", () => {
  let result: unknown;
  expect(() => {
    result = withoutHost("javascript:alert(1)");
  }).not.toThrow();
  expect(result).toBe("alert(1)");
});

// Extends public "[unhappy-2] boundary: mixed-case script and data protocols ...": other special protocols
test("[unhappy-2] vbscript, blob and data protocols give what follows the protocol", () => {
  expect(withoutHost("vbscript:msgbox(1)")).toBe("msgbox(1)");
  expect(withoutHost("VBScript:x")).toBe("x");
  expect(withoutHost("blob:https://a.com/uuid")).toBe("https://a.com/uuid");
  expect(withoutHost("BLOB:https://a.com/uuid")).toBe("https://a.com/uuid");
});

// Shortcut: splitting off "?" / "#" or stripping a host after the protocol
test("[unhappy-2] a special protocol keeps its question marks, hashes and slashes in what follows", () => {
  expect(withoutHost("data:text/html?x#y")).toBe("text/html?x#y");
  expect(withoutHost("javascript://a.com/%0Aalert(1)")).toBe("//a.com/%0Aalert(1)");
});

test("[unhappy-2] leading whitespace before a script protocol is skipped", () => {
  expect(withoutHost("  javascript:x")).toBe("x");
  expect(withoutHost("\0javascript:y")).toBe("y");
});

test("[unhappy-2] a bare script protocol gives the slash fallback", () => {
  expect(withoutHost("javascript:")).toBe("/");
  expect(withoutHost("blob:")).toBe("/");
});

// ---------------------------------------------------------------------------
// @unhappy 3: A protocol with no "//" and no path gives "/"
// ---------------------------------------------------------------------------

test("[unhappy-3] mailto:a@b.com gives a slash without an error", () => {
  let result: unknown;
  expect(() => {
    result = withoutHost("mailto:a@b.com");
  }).not.toThrow();
  expect(result).toBe("/");
});

// Extends public "[unhappy-3] boundary: a bare protocol with nothing after it gives a slash"
test("[unhappy-3] other protocols without a double slash give a slash", () => {
  expect(withoutHost("tel:+123")).toBe("/");
  expect(withoutHost("foo:bar")).toBe("/");
  expect(withoutHost("urn:isbn:0451450523")).toBe("/");
});

// Shortcut: keeping the query or fragment after a protocol with no "//"
test("[unhappy-3] a query and fragment after a protocol with no double slash are dropped too", () => {
  expect(withoutHost("mailto:a@b.com?subject=x#h")).toBe("/");
});

// Shortcut: "a single slash after the protocol starts the path"
test("[unhappy-3] a protocol followed by a single slash gives a slash", () => {
  expect(withoutHost("ab:/y")).toBe("/");
});

// host:port without "//" reads as a protocol to parseURL
test("[unhappy-3] a host and port without a protocol give a slash", () => {
  expect(withoutHost("localhost:3000/api?x=1")).toBe("/");
  expect(withoutHost("a.com:8080/x")).toBe("/");
});
