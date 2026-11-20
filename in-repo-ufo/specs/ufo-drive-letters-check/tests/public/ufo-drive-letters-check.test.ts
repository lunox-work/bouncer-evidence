import { expect, test } from "vitest";
import { parseURL, parseFilename, stringifyParsedURL } from "../src/parse";

// Compare on string-keyed properties only, as in test/parse.test.ts
// (the JSON round-trip drops the protocolRelative symbol).
function parse(input: string, defaultProto?: string) {
  return JSON.parse(JSON.stringify(parseURL(input, defaultProto)));
}

// --- [happy-1] Existing file URL with an uppercase drive letter ---

test("[happy-1] file:///C:/home/user gives pathname C:/home/user", () => {
  expect(parse("file:///C:/home/user")).toEqual({
    protocol: "file:",
    auth: "",
    host: "",
    pathname: "C:/home/user",
    search: "",
    hash: "",
  });
});

test("[happy-1] file:///Z:/ (last ASCII uppercase letter) gives pathname Z:/", () => {
  expect(parse("file:///Z:/")).toEqual({
    protocol: "file:",
    auth: "",
    host: "",
    pathname: "Z:/",
    search: "",
    hash: "",
  });
});

// --- [happy-2] Drive letters of either case, with search and hash ---

const happy2 = [
  {
    input: "file:///C:/home/user",
    host: "",
    pathname: "C:/home/user",
    search: "",
    hash: "",
  },
  { input: "file:///c:/x", host: "", pathname: "c:/x", search: "", hash: "" },
  {
    input: "file:///C:/foo?x=1#h",
    host: "",
    pathname: "C:/foo",
    search: "?x=1",
    hash: "#h",
  },
  { input: "file:///C:", host: "", pathname: "C:", search: "", hash: "" },
  { input: "file:///C:/", host: "", pathname: "C:/", search: "", hash: "" },
  {
    input: "file://host/C:/x",
    host: "host",
    pathname: "C:/x",
    search: "",
    hash: "",
  },
];

for (const t of happy2) {
  test(`[happy-2] example ${t.input}`, () => {
    expect(parse(t.input)).toMatchObject({
      protocol: "file:",
      host: t.host,
      pathname: t.pathname,
      search: t.search,
      hash: t.hash,
    });
  });
}

test("[happy-2] boundary: lowercase a: with only a hash is normalized", () => {
  expect(parse("file:///a:#frag")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "a:",
    search: "",
    hash: "#frag",
  });
});

// --- [boundary-1] Leading whitespace before the file protocol ---

test("[boundary-1] two leading spaces before file:///C:/x still normalize", () => {
  expect(parse("  file:///C:/x")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "C:/x",
  });
});

test("[boundary-1] a leading tab before file:///C:/x still normalizes", () => {
  expect(parse("\tfile:///C:/x")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "C:/x",
  });
});

// --- [happy-3] Backslashes are turned into slashes first ---

test("[happy-3] file:\\\\\\C:\\foo gives pathname C:/foo", () => {
  // Literal characters: "file:", three backslashes, "C:", one backslash, "foo"
  expect(parse("file:\\\\\\C:\\foo")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "C:/foo",
  });
});

test("[happy-3] backslashes with a host: file:\\\\host\\C:\\x gives host and C:/x", () => {
  // Literal characters: "file:", two backslashes, "host", backslash, "C:", backslash, "x"
  expect(parse("file:\\\\host\\C:\\x")).toMatchObject({
    protocol: "file:",
    host: "host",
    pathname: "C:/x",
  });
});

// --- [happy-4] A file URL without a drive letter keeps its path ---

test("[happy-4] file:///home/user keeps pathname /home/user", () => {
  expect(parse("file:///home/user")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/home/user",
  });
});

test("[happy-4] file:///C/foo (letter without colon) keeps pathname /C/foo", () => {
  expect(parse("file:///C/foo")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/C/foo",
  });
});

// --- [boundary-2] Only one ASCII letter followed by ":" counts ---

const boundary2 = [
  { input: "file:///1:/foo", pathname: "/1:/foo" },
  { input: "file:///CD:/foo", pathname: "/CD:/foo" },
  { input: "file:///C|/foo", pathname: "/C|/foo" },
];

for (const t of boundary2) {
  test(`[boundary-2] example ${t.input}`, () => {
    expect(parse(t.input)).toMatchObject({
      protocol: "file:",
      pathname: t.pathname,
    });
  });
}

test("[boundary-2] a non-ASCII letter before ':' is not a drive letter", () => {
  expect(parse("file:///é:/foo")).toMatchObject({
    protocol: "file:",
    pathname: "/é:/foo",
  });
});

// --- [boundary-3] Case-sensitive protocol check ---

const boundary3 = ["FILE:///C:/foo", "File:///C:/foo"];

for (const input of boundary3) {
  test(`[boundary-3] example ${input} is not normalized`, () => {
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

test("[boundary-3] fILE:///C:/foo (one letter off) is not normalized", () => {
  expect(parse("fILE:///C:/foo")).toEqual({
    protocol: "file:",
    auth: "",
    host: "",
    pathname: "/C:/foo",
    search: "",
    hash: "",
  });
});

// --- [boundary-4] Protocol-relative input with an empty host ---

test("[boundary-4] ///C:/foo keeps the slash", () => {
  expect(parse("///C:/foo")).toEqual({
    protocol: "",
    auth: "",
    host: "",
    pathname: "/C:/foo",
    search: "",
    hash: "",
  });
});

test("[boundary-4] ///c:/foo?x#y keeps the slash with search and hash", () => {
  expect(parse("///c:/foo?x#y")).toEqual({
    protocol: "",
    auth: "",
    host: "",
    pathname: "/c:/foo",
    search: "?x",
    hash: "#y",
  });
});

// --- [boundary-5] Protocol-relative input whose host is the drive letter ---

test("[boundary-5] //C:/foo is split as host C: and pathname /foo", () => {
  expect(parse("//C:/foo")).toEqual({
    protocol: "",
    auth: "",
    host: "C:",
    pathname: "/foo",
    search: "",
    hash: "",
  });
});

test("[boundary-5] //C:/D:/x keeps the slash before the second drive letter", () => {
  expect(parse("//C:/D:/x")).toEqual({
    protocol: "",
    auth: "",
    host: "C:",
    pathname: "/D:/x",
    search: "",
    hash: "",
  });
});

// --- [boundary-6] Inputs without "//" are parsed as plain paths ---

const boundary6 = [
  { input: "/C:/foo", pathname: "/C:/foo" },
  { input: "C:/foo", pathname: "C:/foo" },
];

for (const t of boundary6) {
  test(`[boundary-6] example ${t.input} is a plain path`, () => {
    expect(parse(t.input)).toEqual({
      pathname: t.pathname,
      search: "",
      hash: "",
    });
  });
}

test("[boundary-6] /C:/foo?x=1#h is a plain path with search and hash", () => {
  expect(parse("/C:/foo?x=1#h")).toEqual({
    pathname: "/C:/foo",
    search: "?x=1",
    hash: "#h",
  });
});

// --- [boundary-7] The protocol written into the joined string decides ---

const boundary7 = [
  {
    input: "/C:/foo",
    defaultProto: "file://",
    protocol: "file:",
    host: "",
    pathname: "C:/foo",
  },
  {
    input: "C:/foo",
    defaultProto: "file://",
    protocol: "file:",
    host: "C:",
    pathname: "/foo",
  },
  {
    input: "/C:/foo",
    defaultProto: "http://",
    protocol: "http:",
    host: "",
    pathname: "/C:/foo",
  },
  {
    input: "host/C:/x",
    defaultProto: "http://",
    protocol: "http:",
    host: "host",
    pathname: "/C:/x",
  },
];

for (const t of boundary7) {
  test(`[boundary-7] example ${t.input} with defaultProto ${t.defaultProto}`, () => {
    expect(parse(t.input, t.defaultProto)).toMatchObject({
      protocol: t.protocol,
      host: t.host,
      pathname: t.pathname,
    });
  });
}

test("[boundary-7] defaultProto FILE:// is not normalized but protocol is lowercased", () => {
  expect(parse("/C:/foo", "FILE://")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "/C:/foo",
  });
});

// --- [boundary-8] defaultProto is ignored when the input has a protocol ---

test("[boundary-8] http://host/C:/x with defaultProto file:// keeps the slash", () => {
  expect(parse("http://host/C:/x", "file://")).toMatchObject({
    protocol: "http:",
    host: "host",
    pathname: "/C:/x",
  });
});

test("[boundary-8] file:///C:/x with defaultProto http:// is still normalized", () => {
  expect(parse("file:///C:/x", "http://")).toMatchObject({
    protocol: "file:",
    host: "",
    pathname: "C:/x",
  });
});

// --- [unhappy-1] Other protocols keep the leading slash ---

const unhappy1 = [
  {
    input: "http://host/C:/x",
    protocol: "http:",
    host: "host",
    pathname: "/C:/x",
    search: "",
    hash: "",
  },
  {
    input: "https://host/C:/x",
    protocol: "https:",
    host: "host",
    pathname: "/C:/x",
    search: "",
    hash: "",
  },
  {
    input: "ftp://host/C:/x",
    protocol: "ftp:",
    host: "host",
    pathname: "/C:/x",
    search: "",
    hash: "",
  },
  {
    input: "s3://bucket/C:/x",
    protocol: "s3:",
    host: "bucket",
    pathname: "/C:/x",
    search: "",
    hash: "",
  },
  {
    input: "http://host/foo/D:/bar",
    protocol: "http:",
    host: "host",
    pathname: "/foo/D:/bar",
    search: "",
    hash: "",
  },
  {
    input: "http://localhost/C:/x?y#z",
    protocol: "http:",
    host: "localhost",
    pathname: "/C:/x",
    search: "?y",
    hash: "#z",
  },
  {
    input: "http://host/?q=/C:/x",
    protocol: "http:",
    host: "host",
    pathname: "/",
    search: "?q=/C:/x",
    hash: "",
  },
];

for (const t of unhappy1) {
  test(`[unhappy-1] example ${t.input} keeps the slash`, () => {
    expect(parse(t.input)).toMatchObject({
      protocol: t.protocol,
      host: t.host,
      pathname: t.pathname,
      search: t.search,
      hash: t.hash,
    });
  });
}

test("[unhappy-1] files://host/C:/x (not exactly file:) keeps the slash", () => {
  expect(parse("files://host/C:/x")).toMatchObject({
    protocol: "files:",
    host: "host",
    pathname: "/C:/x",
    search: "",
    hash: "",
  });
});

// --- [unhappy-2] Non-file URL round-trips through stringifyParsedURL ---

test("[unhappy-2] http://host/C:/x round-trips unchanged", () => {
  expect(stringifyParsedURL(parseURL("http://host/C:/x"))).toBe(
    "http://host/C:/x",
  );
});

test("[unhappy-2] https://host/foo/D:/bar?q#h round-trips unchanged", () => {
  expect(stringifyParsedURL(parseURL("https://host/foo/D:/bar?q#h"))).toBe(
    "https://host/foo/D:/bar?q#h",
  );
});

// --- [unhappy-3] parseFilename on a non-file URL with a drive-letter path ---

test("[unhappy-3] parseFilename http://host/C:/x.txt non-strict returns x.txt", () => {
  expect(parseFilename("http://host/C:/x.txt", { strict: false })).toBe(
    "x.txt",
  );
});

test("[unhappy-3] parseFilename http://host/C: non-strict returns C:", () => {
  expect(parseFilename("http://host/C:", { strict: false })).toBe("C:");
});

// --- [boundary-9] Unanchored, single-match pattern for file: ---

const boundary9 = [
  {
    input: "file:///foo/D:/bar",
    pathname: "/fooD:/bar",
    search: "",
    hash: "",
  },
  { input: "file:///home/C:", pathname: "/homeC:", search: "", hash: "" },
  {
    input: "file:///C:/a/D:/b",
    pathname: "C:/a/D:/b",
    search: "",
    hash: "",
  },
  { input: "file:///?q=/C:/x", pathname: "/", search: "?q=C:/x", hash: "" },
  { input: "file:///#/C:/x", pathname: "/", search: "", hash: "#C:/x" },
];

for (const t of boundary9) {
  test(`[boundary-9] example ${t.input}`, () => {
    expect(parse(t.input)).toMatchObject({
      protocol: "file:",
      pathname: t.pathname,
      search: t.search,
      hash: t.hash,
    });
  });
}

test("[boundary-9] file:///a/b:/c/D:/e removes only the first match", () => {
  expect(parse("file:///a/b:/c/D:/e")).toMatchObject({
    protocol: "file:",
    pathname: "/ab:/c/D:/e",
    search: "",
    hash: "",
  });
});

// --- [boundary-10] A normalized file URL stringifies with two slashes ---

test("[boundary-10] file:///C:/foo stringifies as file://C:/foo", () => {
  expect(stringifyParsedURL(parseURL("file:///C:/foo"))).toBe("file://C:/foo");
});

test("[boundary-10] FILE:///C:/foo (not normalized) stringifies with three slashes", () => {
  expect(stringifyParsedURL(parseURL("FILE:///C:/foo"))).toBe(
    "file:///C:/foo",
  );
});

// --- [boundary-11] Special script protocols are unaffected ---

test("[boundary-11] blob:file:///C:/x keeps its text as the pathname", () => {
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

test("[boundary-11] data:file:///C:/x keeps its text as the pathname", () => {
  expect(parse("data:file:///C:/x")).toEqual({
    protocol: "data:",
    auth: "",
    host: "",
    href: "data:file:///C:/x",
    pathname: "file:///C:/x",
    search: "",
    hash: "",
  });
});
