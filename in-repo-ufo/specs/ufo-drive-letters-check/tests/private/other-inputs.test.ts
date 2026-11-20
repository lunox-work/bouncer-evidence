import { expect, test } from "vitest";
import { parseURL, parseFilename, stringifyParsedURL } from "../../src/parse";

// Compare on string-keyed properties only, as in test/parse.test.ts
// (the JSON round-trip drops the protocolRelative symbol).
function parse(input: string, defaultProto?: string) {
  return JSON.parse(JSON.stringify(parseURL(input, defaultProto)));
}

// ---------------------------------------------------------------------------
// [boundary-4] A protocol-relative input with an empty host keeps the slash
// ---------------------------------------------------------------------------

test("[boundary-4] ///C:/foo equals the table row", () => {
  expect(parse("///C:/foo")).toEqual({
    protocol: "",
    auth: "",
    host: "",
    pathname: "/C:/foo",
    search: "",
    hash: "",
  });
});

// Extends public "[boundary-4] ///c:/foo?x#y": deeper path and a second candidate.
test("[boundary-4] ///Z:/a/B:/b keeps every slash", () => {
  expect(parse("///Z:/a/B:/b")).toEqual({
    protocol: "",
    auth: "",
    host: "",
    pathname: "/Z:/a/B:/b",
    search: "",
    hash: "",
  });
});

test("[boundary-4] backslashed \\\\\\C:\\foo keeps the slash", () => {
  // Literal: three backslashes, "C:", backslash, "foo"
  expect(parse("\\\\\\C:\\foo")).toEqual({
    protocol: "",
    auth: "",
    host: "",
    pathname: "/C:/foo",
    search: "",
    hash: "",
  });
});

// A protocol-relative input is not prefixed with defaultProto, so its empty
// protocol decides (shortcut: using defaultProto as the effective protocol).
test("[boundary-4] ///C:/foo with defaultProto file:// still keeps the slash", () => {
  expect(parse("///C:/foo", "file://")).toEqual({
    protocol: "",
    auth: "",
    host: "",
    pathname: "/C:/foo",
    search: "",
    hash: "",
  });
});

// Empty protocol of a protocol-relative input with a non-empty host.
test("[boundary-4] //host/C:/x (protocol-relative with a host) keeps the slash", () => {
  expect(parse("//host/C:/x?y#z")).toEqual({
    protocol: "",
    auth: "",
    host: "host",
    pathname: "/C:/x",
    search: "?y",
    hash: "#z",
  });
});

// ---------------------------------------------------------------------------
// [boundary-5] A protocol-relative input whose host is the drive letter
// ---------------------------------------------------------------------------

test("[boundary-5] //C:/foo equals host C: and pathname /foo", () => {
  expect(parse("//C:/foo")).toEqual({
    protocol: "",
    auth: "",
    host: "C:",
    pathname: "/foo",
    search: "",
    hash: "",
  });
});

// Extends public "[boundary-5] ...": lowercase, search and hash.
test("[boundary-5] //d:/bar?x=1#h is host d: with pathname /bar", () => {
  expect(parse("//d:/bar?x=1#h")).toEqual({
    protocol: "",
    auth: "",
    host: "d:",
    pathname: "/bar",
    search: "?x=1",
    hash: "#h",
  });
});

test("[boundary-5] //C: alone is host C: with an empty pathname", () => {
  expect(parse("//C:")).toEqual({
    protocol: "",
    auth: "",
    host: "C:",
    pathname: "",
    search: "",
    hash: "",
  });
});

// ---------------------------------------------------------------------------
// [boundary-6] Inputs without "//" are parsed as plain paths
// ---------------------------------------------------------------------------

for (const t of [
  { input: "/C:/foo", pathname: "/C:/foo" },
  { input: "C:/foo", pathname: "C:/foo" },
]) {
  test(`[boundary-6] spec example ${t.input} is a plain path`, () => {
    expect(parse(t.input)).toEqual({ pathname: t.pathname, search: "", hash: "" });
  });
}

// Extends public "[boundary-6] ...": other paths, deeper, lowercase.
test("[boundary-6] /a/b/c:/d keeps its text as a plain path", () => {
  expect(parse("/a/b/c:/d")).toEqual({
    pathname: "/a/b/c:/d",
    search: "",
    hash: "",
  });
});

test("[boundary-6] z:/x?q#/Y:/w keeps its text as a plain path", () => {
  expect(parse("z:/x?q#/Y:/w")).toEqual({
    pathname: "z:/x",
    search: "?q",
    hash: "#/Y:/w",
  });
});

// ---------------------------------------------------------------------------
// [boundary-7] The protocol written into the joined string decides
// ---------------------------------------------------------------------------

const boundary7 = [
  { input: "/C:/foo", defaultProto: "file://", protocol: "file:", host: "", pathname: "C:/foo" },
  { input: "C:/foo", defaultProto: "file://", protocol: "file:", host: "C:", pathname: "/foo" },
  { input: "/C:/foo", defaultProto: "http://", protocol: "http:", host: "", pathname: "/C:/foo" },
  { input: "host/C:/x", defaultProto: "http://", protocol: "http:", host: "host", pathname: "/C:/x" },
];

for (const t of boundary7) {
  test(`[boundary-7] spec example ${t.input} with defaultProto ${t.defaultProto}`, () => {
    expect(parse(t.input, t.defaultProto)).toMatchObject({
      protocol: t.protocol,
      host: t.host,
      pathname: t.pathname,
    });
  });
}

// Extends public "[boundary-7] example host/C:/x with defaultProto http://":
// the same input with file:// is normalized despite a non-empty host.
test("[boundary-7] host/C:/x with defaultProto file:// gives host and C:/x", () => {
  expect(parse("host/C:/x", "file://")).toMatchObject({
    protocol: "file:",
    host: "host",
    pathname: "C:/x",
  });
});

test("[boundary-7] /c:/x?y#/D:/z with defaultProto file:// normalizes only the first", () => {
  expect(parse("/c:/x?y#/D:/z", "file://")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "c:/x",
    search: "?y",
    hash: "#/D:/z",
  });
});

for (const proto of ["https://", "ftp://", "s3://"]) {
  test(`[boundary-7] /C:/foo with defaultProto ${proto} keeps the slash`, () => {
    expect(parse("/C:/foo", proto)).toMatchObject({
      protocol: proto.slice(0, -2),
      host: "",
      pathname: "/C:/foo",
    });
  });
}

test("[boundary-7] /D:/foo with defaultProto File:// is not normalized", () => {
  expect(parse("/D:/foo", "File://")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/D:/foo",
  });
});

test("[boundary-7] /foo/D:/bar with defaultProto file:// removes the inner slash", () => {
  expect(parse("/foo/D:/bar", "file://")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/fooD:/bar",
  });
});

// ---------------------------------------------------------------------------
// [boundary-8] defaultProto is ignored when the input already has a protocol
// ---------------------------------------------------------------------------

test("[boundary-8] http://host/C:/x with defaultProto file:// keeps the slash", () => {
  expect(parse("http://host/C:/x", "file://")).toMatchObject({
    protocol: "http:",
    host: "host",
    pathname: "/C:/x",
  });
});

// Extends public "[boundary-8] ...": other protocols and casings.
test("[boundary-8] s3://bucket/d:/x?q with defaultProto file:// keeps the slash", () => {
  expect(parse("s3://bucket/d:/x?q", "file://")).toMatchObject({
    protocol: "s3:",
    host: "bucket",
    pathname: "/d:/x",
    search: "?q",
  });
});

test("[boundary-8] FILE:///C:/x with defaultProto file:// is not normalized", () => {
  expect(parse("FILE:///C:/x", "file://")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/C:/x",
  });
});

test("[boundary-8] file://h/E:/x with defaultProto https:// is still normalized", () => {
  expect(parse("file://h/E:/x", "https://")).toMatchObject({
    protocol: "file:",
    host: "h",
    pathname: "E:/x",
  });
});

// ---------------------------------------------------------------------------
// [unhappy-1] Other protocols keep the leading slash
// ---------------------------------------------------------------------------

const unhappy1 = [
  { input: "http://host/C:/x", protocol: "http:", host: "host", pathname: "/C:/x", search: "", hash: "" },
  { input: "https://host/C:/x", protocol: "https:", host: "host", pathname: "/C:/x", search: "", hash: "" },
  { input: "ftp://host/C:/x", protocol: "ftp:", host: "host", pathname: "/C:/x", search: "", hash: "" },
  { input: "s3://bucket/C:/x", protocol: "s3:", host: "bucket", pathname: "/C:/x", search: "", hash: "" },
  { input: "http://host/foo/D:/bar", protocol: "http:", host: "host", pathname: "/foo/D:/bar", search: "", hash: "" },
  { input: "http://localhost/C:/x?y#z", protocol: "http:", host: "localhost", pathname: "/C:/x", search: "?y", hash: "#z" },
  { input: "http://host/?q=/C:/x", protocol: "http:", host: "host", pathname: "/", search: "?q=/C:/x", hash: "" },
];

for (const t of unhappy1) {
  test(`[unhappy-1] spec example ${t.input} keeps the slash`, () => {
    expect(parse(t.input)).toMatchObject({
      protocol: t.protocol,
      host: t.host,
      pathname: t.pathname,
      search: t.search,
      hash: t.hash,
    });
  });
}

// Extends public "[unhappy-1] example ..." rows: more protocols, including
// ones that contain or end with "file" (shortcut: includes/endsWith "file").
const unhappy1More = [
  { input: "ws://host/c:/x", protocol: "ws:", host: "host", pathname: "/c:/x" },
  { input: "git+ssh://host/C:/repo", protocol: "git+ssh:", host: "host", pathname: "/C:/repo" },
  { input: "chrome-extension://abc/C:/x", protocol: "chrome-extension:", host: "abc", pathname: "/C:/x" },
  { input: "myfile://host/C:/x", protocol: "myfile:", host: "host", pathname: "/C:/x" },
  { input: "afile:///C:/x", protocol: "afile:", host: "", pathname: "/C:/x" },
  { input: "file2:///C:/x", protocol: "file2:", host: "", pathname: "/C:/x" },
  { input: "fil:///C:/x", protocol: "fil:", host: "", pathname: "/C:/x" },
  { input: "file.x:///C:/x", protocol: "file.x:", host: "", pathname: "/C:/x" },
  { input: "smb://server/Z:/share", protocol: "smb:", host: "server", pathname: "/Z:/share" },
];

for (const t of unhappy1More) {
  test(`[unhappy-1] ${t.input} keeps the slash`, () => {
    expect(parse(t.input)).toMatchObject({
      protocol: t.protocol,
      host: t.host,
      pathname: t.pathname,
      search: "",
      hash: "",
    });
  });
}

test("[unhappy-1] uppercase HTTP://HOST/C:/x keeps the slash", () => {
  expect(parse("HTTP://HOST/C:/x")).toMatchObject({
    protocol: "http:",
    host: "HOST",
    pathname: "/C:/x",
  });
});

test("[unhappy-1] http:///C:/x with an empty host keeps the slash", () => {
  expect(parse("http:///C:/x")).toMatchObject({
    protocol: "http:",
    host: "",
    pathname: "/C:/x",
  });
});

test("[unhappy-1] http://user:pw@host:8080/C:/x with auth and port keeps the slash", () => {
  expect(parse("http://user:pw@host:8080/C:/x")).toMatchObject({
    protocol: "http:",
    auth: "user:pw",
    host: "host:8080",
    pathname: "/C:/x",
  });
});

test("[unhappy-1] backslashed http:\\\\host\\C:\\x keeps the slash", () => {
  // Literal: "http:", two backslashes, "host", backslash, "C:", backslash, "x"
  expect(parse("http:\\\\host\\C:\\x")).toMatchObject({
    protocol: "http:",
    host: "host",
    pathname: "/C:/x",
  });
});

test("[unhappy-1] leading whitespace before https://host/C:/x keeps the slash", () => {
  expect(parse("  https://host/C:/x")).toMatchObject({
    protocol: "https:",
    host: "host",
    pathname: "/C:/x",
  });
});

// Shortcut: checking whether the input mentions "file:" anywhere.
test("[unhappy-1] http://host/file:/C:/x?file:/D:/y keeps every slash", () => {
  expect(parse("http://host/file:/C:/x?file:/D:/y")).toMatchObject({
    protocol: "http:",
    host: "host",
    pathname: "/file:/C:/x",
    search: "?file:/D:/y",
    hash: "",
  });
});

test("[unhappy-1] https://host/#/C:/x keeps the slash in the hash", () => {
  expect(parse("https://host/#/C:/x")).toMatchObject({
    protocol: "https:",
    host: "host",
    pathname: "/",
    search: "",
    hash: "#/C:/x",
  });
});

test("[unhappy-1] http://host/a/b/c/z: keeps the slash deep in the path", () => {
  expect(parse("http://host/a/b/c/z:")).toMatchObject({
    protocol: "http:",
    host: "host",
    pathname: "/a/b/c/z:",
  });
});

// ---------------------------------------------------------------------------
// [unhappy-2] A non-file URL with a drive-letter path round-trips
// ---------------------------------------------------------------------------

test("[unhappy-2] http://host/C:/x round-trips unchanged", () => {
  expect(stringifyParsedURL(parseURL("http://host/C:/x"))).toBe(
    "http://host/C:/x",
  );
});

// Extends public "[unhappy-2] ...": auth, lowercase drive, other protocols.
for (const input of [
  "ftp://user@host/c:/x?a#b",
  "s3://bucket/C:/a/D:/b",
  "http://localhost:3000/Z:",
  "https://host/?q=/C:/x#/D:/y",
  "ws://host/a/B:/c",
]) {
  test(`[unhappy-2] ${input} round-trips unchanged`, () => {
    expect(stringifyParsedURL(parseURL(input))).toBe(input);
  });
}

test("[unhappy-2] protocol-relative //host/C:/x round-trips unchanged", () => {
  expect(stringifyParsedURL(parseURL("//host/C:/x"))).toBe("//host/C:/x");
});

// ---------------------------------------------------------------------------
// [unhappy-3] parseFilename on a non-file URL with a drive-letter path
// ---------------------------------------------------------------------------

test("[unhappy-3] parseFilename http://host/C:/x.txt non-strict returns x.txt", () => {
  expect(parseFilename("http://host/C:/x.txt", { strict: false })).toBe(
    "x.txt",
  );
});

// Extends public "[unhappy-3] parseFilename http://host/C: ...": strict mode
// and a drive segment with an extension, which only has a "/" before it once
// the slash is kept.
test("[unhappy-3] parseFilename http://host/C:.bin strict returns C:.bin", () => {
  expect(parseFilename("http://host/C:.bin", { strict: true })).toBe("C:.bin");
});

test("[unhappy-3] parseFilename https://host/d: non-strict returns d:", () => {
  expect(parseFilename("https://host/d:", { strict: false })).toBe("d:");
});

test("[unhappy-3] parseFilename s3://bucket/D:/dir/file.tar.gz strict returns file.tar.gz", () => {
  expect(
    parseFilename("s3://bucket/D:/dir/file.tar.gz", { strict: true }),
  ).toBe("file.tar.gz");
});

test("[unhappy-3] parseFilename http://host/C:?q=1 non-strict returns C:", () => {
  expect(parseFilename("http://host/C:?q=1", { strict: false })).toBe("C:");
});

// ---------------------------------------------------------------------------
// [boundary-11] Special script protocols are unaffected
// ---------------------------------------------------------------------------

test("[boundary-11] blob:file:///C:/x equals the table row", () => {
  expect(parse("blob:file:///C:/x")).toEqual({
    protocol: "blob:",
    auth: "",
    host: "",
    href: "blob:file:///C:/x",
    pathname: "file:///C:/x",
    search: "",
    hash: "",
  });
});

// Extends public "[boundary-11] data:file:///C:/x ...": other script protocols.
for (const proto of ["javascript:", "vbscript:"]) {
  test(`[boundary-11] ${proto}file:///D:/y keeps its text as the pathname`, () => {
    expect(parse(`${proto}file:///D:/y`)).toEqual({
      protocol: proto,
      auth: "",
      host: "",
      href: `${proto}file:///D:/y`,
      pathname: "file:///D:/y",
      search: "",
      hash: "",
    });
  });
}

test("[boundary-11] blob:file:///c:/a?b#c keeps search and hash in the pathname", () => {
  expect(parse("blob:file:///c:/a?b#c")).toEqual({
    protocol: "blob:",
    auth: "",
    host: "",
    href: "blob:file:///c:/a?b#c",
    pathname: "file:///c:/a?b#c",
    search: "",
    hash: "",
  });
});
