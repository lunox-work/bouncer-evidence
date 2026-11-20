import { expect, test } from "vitest";
import { parseURL, stringifyParsedURL } from "../../src/parse";

// Compare on string-keyed properties only, as in test/parse.test.ts
// (the JSON round-trip drops the protocolRelative symbol).
function parse(input: string, defaultProto?: string) {
  return JSON.parse(JSON.stringify(parseURL(input, defaultProto)));
}

// ---------------------------------------------------------------------------
// [happy-1] Existing file URL with an uppercase drive letter
// ---------------------------------------------------------------------------

test("[happy-1] file:///C:/home/user equals the full table row", () => {
  expect(parse("file:///C:/home/user")).toEqual({
    protocol: "file:",
    auth: "",
    host: "",
    pathname: "C:/home/user",
    search: "",
    hash: "",
  });
});

// Extends public "[happy-1] file:///Z:/ ..." with the first letter and a deeper path.
test("[happy-1] file:///A:/deep/nested/dir/file.txt drops only the leading slash", () => {
  expect(parse("file:///A:/deep/nested/dir/file.txt")).toEqual({
    protocol: "file:",
    auth: "",
    host: "",
    pathname: "A:/deep/nested/dir/file.txt",
    search: "",
    hash: "",
  });
});

// ---------------------------------------------------------------------------
// [happy-2] Drive letters of either case, with search and hash
// ---------------------------------------------------------------------------

test("[happy-2] file:///C:/foo?x=1#h splits search and hash after normalizing", () => {
  expect(parse("file:///C:/foo?x=1#h")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "C:/foo",
    search: "?x=1",
    hash: "#h",
  });
});

// Extends public "[happy-2] example ..." rows: last lowercase letter, search only.
test("[happy-2] file:///z:/a/b?k=v&m=n gives pathname z:/a/b and search", () => {
  expect(parse("file:///z:/a/b?k=v&m=n")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "z:/a/b",
    search: "?k=v&m=n",
    hash: "",
  });
});

// Extends public "[happy-2] example file://host/C:/x": a non-empty host is
// still normalized, also with a different host, auth and a port
// (shortcut: normalize only when the host is empty, as WHATWG does).
test("[happy-2] file://server/D:/share/x keeps host server and gives D:/share/x", () => {
  expect(parse("file://server/D:/share/x")).toMatchObject({
    protocol: "file:",
    host: "server",
    pathname: "D:/share/x",
    search: "",
    hash: "",
  });
});

test("[happy-2] file://localhost/c:/x?y#z with host localhost is normalized", () => {
  expect(parse("file://localhost/c:/x?y#z")).toMatchObject({
    protocol: "file:",
    host: "localhost",
    pathname: "c:/x",
    search: "?y",
    hash: "#z",
  });
});

test("[happy-2] file://user:pw@host:8080/C:/x with auth and port is normalized", () => {
  expect(parse("file://user:pw@host:8080/C:/x")).toMatchObject({
    protocol: "file:",
    auth: "user:pw",
    host: "host:8080",
    pathname: "C:/x",
    search: "",
    hash: "",
  });
});

// Extends public "[happy-2] example file:///C:": lowercase bare drive with search.
test("[happy-2] file:///q:?a=b gives pathname q: and search ?a=b", () => {
  expect(parse("file:///q:?a=b")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "q:",
    search: "?a=b",
    hash: "",
  });
});

// ---------------------------------------------------------------------------
// [boundary-1] Leading whitespace before the file protocol
// ---------------------------------------------------------------------------

test("[boundary-1] two leading spaces before file:///C:/x still normalize", () => {
  expect(parse("  file:///C:/x")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "C:/x",
  });
});

// Extends public "[boundary-1] ... tab ...": newline and mixed whitespace.
test("[boundary-1] mixed leading whitespace before file:///D:/y still normalizes", () => {
  expect(parse(" \t\n\r file:///D:/y?q#h")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "D:/y",
    search: "?q",
    hash: "#h",
  });
});

// Shortcut: checking input.trim().startsWith("file:") misses a leading NUL,
// which the protocol regex skips (String#trim does not remove "\0").
test("[boundary-1] a leading NUL before file:///C:/x still normalizes", () => {
  expect(parse("\0file:///C:/x")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "C:/x",
  });
});

test("[boundary-1] leading spaces before file://host/C:/x keep the host and normalize", () => {
  expect(parse("   file://host/C:/x")).toMatchObject({
    protocol: "file:",
    host: "host",
    pathname: "C:/x",
  });
});

// ---------------------------------------------------------------------------
// [happy-3] Backslashes are turned into slashes before normalizing
// ---------------------------------------------------------------------------

test("[happy-3] file:\\\\\\C:\\foo gives pathname C:/foo", () => {
  // Literal characters: "file:", three backslashes, "C:", one backslash, "foo"
  expect(parse("file:\\\\\\C:\\foo")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "C:/foo",
  });
});

// Extends public "[happy-3] ...": lowercase drive, deeper path, search and hash.
test("[happy-3] file:\\\\\\d:\\a\\b\\c.txt?x#y gives pathname d:/a/b/c.txt", () => {
  // Literal: "file:", three backslashes, "d:\a\b\c.txt?x#y"
  expect(parse("file:\\\\\\d:\\a\\b\\c.txt?x#y")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "d:/a/b/c.txt",
    search: "?x",
    hash: "#y",
  });
});

// Shortcut: looking for a literal "file://" in the input misses mixed separators.
test("[happy-3] mixed separators file:/\\/C:\\x give pathname C:/x", () => {
  // Literal: "file:", "/", "\", "/", "C:", "\", "x"
  expect(parse("file:/\\/C:\\x")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "C:/x",
  });
});

// ---------------------------------------------------------------------------
// [happy-4] A file URL without a drive letter keeps its path
// ---------------------------------------------------------------------------

test("[happy-4] file:///home/user keeps pathname /home/user", () => {
  expect(parse("file:///home/user")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/home/user",
  });
});

// Extends public "[happy-4] ...": search, hash, colon later in a segment.
test("[happy-4] file:///var/log/app:1/x?a=b#c keeps pathname /var/log/app:1/x", () => {
  expect(parse("file:///var/log/app:1/x?a=b#c")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/var/log/app:1/x",
    search: "?a=b",
    hash: "#c",
  });
});

test("[happy-4] file:/// keeps pathname /", () => {
  expect(parse("file:///")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/",
  });
});

test("[happy-4] file://host/share/C keeps host and pathname /share/C", () => {
  expect(parse("file://host/share/C")).toMatchObject({
    protocol: "file:",
    host: "host",
    pathname: "/share/C",
  });
});

// ---------------------------------------------------------------------------
// [boundary-2] Only one ASCII letter followed by ":" counts as a drive letter
// ---------------------------------------------------------------------------

const boundary2 = [
  { input: "file:///1:/foo", pathname: "/1:/foo" },
  { input: "file:///CD:/foo", pathname: "/CD:/foo" },
  { input: "file:///C|/foo", pathname: "/C|/foo" },
];

for (const t of boundary2) {
  test(`[boundary-2] spec example ${t.input}`, () => {
    expect(parse(t.input)).toMatchObject({
      protocol: "file:",
      pathname: t.pathname,
    });
  });
}

// Extends public "[boundary-2] example ...": characters next to the ASCII
// letter ranges. A [A-z] class would wrongly accept "[", "_" and "`";
// \w would accept "_" and digits.
const boundary2Neighbours = [
  { input: "file:///@:/foo", pathname: "/@:/foo" },
  { input: "file:///[:/foo", pathname: "/[:/foo" },
  { input: "file:///_:/foo", pathname: "/_:/foo" },
  { input: "file:///`:/foo", pathname: "/`:/foo" },
  { input: "file:///{:/foo", pathname: "/{:/foo" },
  { input: "file:///9:/foo", pathname: "/9:/foo" },
  { input: "file:///.:/foo", pathname: "/.:/foo" },
];

for (const t of boundary2Neighbours) {
  test(`[boundary-2] non-letter ASCII ${t.input} is not a drive letter`, () => {
    expect(parse(t.input)).toMatchObject({
      protocol: "file:",
      pathname: t.pathname,
    });
  });
}

// Extends public "[boundary-2] a non-ASCII letter ...": the Kelvin sign
// (U+212A) and long s (U+017F) case-fold to "k" and "s" under a
// case-insensitive Unicode regex, but are not ASCII letters.
test("[boundary-2] Kelvin sign U+212A before ':' is not a drive letter", () => {
  expect(parse("file:///\u212A:/foo")).toMatchObject({
    protocol: "file:",
    pathname: "/\u212A:/foo",
  });
});

test("[boundary-2] long s U+017F before ':' is not a drive letter", () => {
  expect(parse("file:///\u017F:/foo")).toMatchObject({
    protocol: "file:",
    pathname: "/\u017F:/foo",
  });
});

test("[boundary-2] three letters ABC: are not a drive letter", () => {
  expect(parse("file:///ABC:/foo")).toMatchObject({
    protocol: "file:",
    pathname: "/ABC:/foo",
  });
});

test("[boundary-2] lowercase legacy c| form is not normalized", () => {
  expect(parse("file:///c|/x?y")).toMatchObject({
    protocol: "file:",
    pathname: "/c|/x",
    search: "?y",
  });
});

// ---------------------------------------------------------------------------
// [boundary-3] Case-sensitive protocol check; output protocol lowercased
// ---------------------------------------------------------------------------

const boundary3 = ["FILE:///C:/foo", "File:///C:/foo"];

for (const input of boundary3) {
  test(`[boundary-3] spec example ${input} equals the unnormalized row`, () => {
    expect(parse(input)).toEqual({
      protocol: "file:",
      auth: "",
      host: "",
      pathname: "/C:/foo",
      search: "",
      hash: "",
    });
  });
}

// Extends public "[boundary-3] ...": other mixed casings.
for (const input of ["fiLe:///C:/foo", "FILe:///C:/foo", "filE:///C:/foo"]) {
  test(`[boundary-3] mixed case ${input} is not normalized`, () => {
    expect(parse(input)).toEqual({
      protocol: "file:",
      auth: "",
      host: "",
      pathname: "/C:/foo",
      search: "",
      hash: "",
    });
  });
}

// Shortcut: comparing the lowercased protocol after trimming whitespace.
test("[boundary-3] leading whitespace before FILE:///c:/x does not enable normalization", () => {
  expect(parse("  FILE:///c:/x")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/c:/x",
  });
});

test("[boundary-3] FILE://host/D:/x?q#h with a host is not normalized", () => {
  expect(parse("FILE://host/D:/x?q#h")).toMatchObject({
    protocol: "file:",
    host: "host",
    pathname: "/D:/x",
    search: "?q",
    hash: "#h",
  });
});

test("[boundary-3] backslashed FILE:\\\\\\C:\\foo is not normalized", () => {
  // Literal: "FILE:", three backslashes, "C:", backslash, "foo"
  expect(parse("FILE:\\\\\\C:\\foo")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/C:/foo",
  });
});

test("[boundary-3] File:///foo/D:/bar keeps every slash", () => {
  expect(parse("File:///foo/D:/bar")).toMatchObject({
    protocol: "file:",
    pathname: "/foo/D:/bar",
  });
});

// ---------------------------------------------------------------------------
// [boundary-9] Unanchored, single-match pattern for file:
// ---------------------------------------------------------------------------

const boundary9 = [
  { input: "file:///foo/D:/bar", pathname: "/fooD:/bar", search: "", hash: "" },
  { input: "file:///home/C:", pathname: "/homeC:", search: "", hash: "" },
  { input: "file:///C:/a/D:/b", pathname: "C:/a/D:/b", search: "", hash: "" },
  { input: "file:///?q=/C:/x", pathname: "/", search: "?q=C:/x", hash: "" },
  { input: "file:///#/C:/x", pathname: "/", search: "", hash: "#C:/x" },
];

for (const t of boundary9) {
  test(`[boundary-9] spec example ${t.input}`, () => {
    expect(parse(t.input)).toMatchObject({
      protocol: "file:",
      pathname: t.pathname,
      search: t.search,
      hash: t.hash,
    });
  });
}

// Extends public "[boundary-9] ... only the first match": three candidates
// (shortcut: global replace).
test("[boundary-9] file:///c:/d:/e:/f removes only the first of three", () => {
  expect(parse("file:///c:/d:/e:/f")).toMatchObject({
    protocol: "file:",
    pathname: "c:/d:/e:/f",
    search: "",
    hash: "",
  });
});

// Shortcut: anchored regex at the start of the path.
test("[boundary-9] file:///a/b/c/z: removes the slash deep in the path", () => {
  expect(parse("file:///a/b/c/z:")).toMatchObject({
    protocol: "file:",
    pathname: "/a/b/cz:",
  });
});

// Unanchored pattern on the rest: with an empty host and an extra slash,
// the slash directly before the drive letter is the one removed.
test("[boundary-9] file:////C:/x removes the second slash, leaving /C:/x", () => {
  expect(parse("file:////C:/x")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/C:/x",
  });
});

// Shortcut: applying the removal to the pathname only.
test("[boundary-9] file:///x/y?q=/C:/z removes the slash in the search", () => {
  expect(parse("file:///x/y?q=/C:/z")).toMatchObject({
    protocol: "file:",
    pathname: "/x/y",
    search: "?q=C:/z",
    hash: "",
  });
});

test("[boundary-9] search match wins over a later hash match, hash kept", () => {
  expect(parse("file:///?a=/b:/c#/d:/e")).toMatchObject({
    protocol: "file:",
    pathname: "/",
    search: "?a=b:/c",
    hash: "#/d:/e",
  });
});

test("[boundary-9] pathname match wins, search and hash keep their slashes", () => {
  expect(parse("file:///C:/p?s=/D:/q#/E:/r")).toMatchObject({
    protocol: "file:",
    pathname: "C:/p",
    search: "?s=/D:/q",
    hash: "#/E:/r",
  });
});

test("[boundary-9] file://host/x#/Q:/y removes the slash in the hash", () => {
  expect(parse("file://host/x#/Q:/y")).toMatchObject({
    protocol: "file:",
    host: "host",
    pathname: "/x",
    search: "",
    hash: "#Q:/y",
  });
});

// ---------------------------------------------------------------------------
// [boundary-10] A normalized file URL stringifies with two slashes
// ---------------------------------------------------------------------------

test("[boundary-10] file:///C:/foo stringifies as file://C:/foo", () => {
  expect(stringifyParsedURL(parseURL("file:///C:/foo"))).toBe("file://C:/foo");
});

// Extends public "[boundary-10] ...": lowercase drive with search and hash.
test("[boundary-10] file:///d:/a/b?x=1#h stringifies as file://d:/a/b?x=1#h", () => {
  expect(stringifyParsedURL(parseURL("file:///d:/a/b?x=1#h"))).toBe(
    "file://d:/a/b?x=1#h",
  );
});

test("[boundary-10] file://host/C:/x stringifies as file://hostC:/x", () => {
  expect(stringifyParsedURL(parseURL("file://host/C:/x"))).toBe(
    "file://hostC:/x",
  );
});

test("[boundary-10] File:///E:/x (not normalized) stringifies with three slashes", () => {
  expect(stringifyParsedURL(parseURL("File:///E:/x"))).toBe("file:///E:/x");
});
