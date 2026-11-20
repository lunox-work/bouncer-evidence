import { expect, it, vi } from "vitest";

import { basename, parse } from "../../src/path";

const WINDOWS_CWD = "C:\\Windows\\path\\only";

function withWindowsCwd<T>(function_: () => T): T {
  const cwd = process.cwd;
  process.cwd = vi.fn(() => WINDOWS_CWD);
  try {
    return function_();
  } finally {
    process.cwd = cwd;
  }
}

// ---------------------------------------------------------------------------
// @happy 5: parse on a path with a trailing slash
// ---------------------------------------------------------------------------

// Extends "[happy-5] parse on a path with a trailing slash": a relative path,
// a multi-dot name and a dotfile (root and dir computed as before).
it("[happy-5] parse on a relative path with a trailing slash", () => {
  expect(parse("./dir/sub/")).to.deep.equal({
    root: ".",
    dir: "./dir",
    base: "sub",
    ext: "",
    name: "sub",
  });
});

it("[happy-5] parse on a multi-dot name with a trailing slash takes ext from the fixed base", () => {
  expect(parse("/home/user/archive.tar.gz/")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: "archive.tar.gz",
    ext: ".gz",
    name: "archive.tar",
  });
});

it("[happy-5] parse on a dotfile directory with a trailing slash has an empty ext", () => {
  expect(parse("/home/.config/")).to.deep.equal({
    root: "/",
    dir: "/home",
    base: ".config",
    ext: "",
    name: ".config",
  });
});

it("[happy-5] parse on a relative file path with a trailing slash", () => {
  expect(parse("relative/file.md/")).to.deep.equal({
    root: "relative",
    dir: "relative",
    base: "file.md",
    ext: ".md",
    name: "file",
  });
});

// Extends "[happy-5] parse takes base, ext and name from basename when the
// path ends in several slashes": many slashes and an extension.
it("[happy-5] parse takes base, ext and name from basename when a path with an extension ends in many slashes", () => {
  const p = `/a/b/report.pdf${"/".repeat(20)}`;
  const parsed = parse(p);
  expect(parsed.base).to.equal("report.pdf");
  expect(parsed.base).to.equal(basename(p));
  expect(parsed.ext).to.equal(".pdf");
  expect(parsed.name).to.equal("report");
});

it("[happy-5] parse on a path with a trailing slash gives the same result with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(parse("/a/b/c.d/e/")).to.deep.equal({
      root: "/",
      dir: "/a/b/c.d",
      base: "e",
      ext: "",
      name: "e",
    });
  });
});

// ---------------------------------------------------------------------------
// @happy 6: parse on a Windows path with a trailing backslash and an extension
// ---------------------------------------------------------------------------

// Extends "[happy-6] parse on a Windows path with a trailing backslash and an
// extension": lowercase drive, multi-dot name, relative and UNC paths.
it("[happy-6] parse on a lowercase-drive Windows path with a trailing backslash", () => {
  expect(parse("c:\\path\\file.txt\\")).to.deep.equal({
    root: "C:",
    dir: "C:/path",
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
});

it("[happy-6] parse on a Windows multi-dot name with a trailing backslash", () => {
  expect(parse("C:\\Users\\me\\notes.v2.md\\")).to.deep.equal({
    root: "C:",
    dir: "C:/Users/me",
    base: "notes.v2.md",
    ext: ".md",
    name: "notes.v2",
  });
});

it("[happy-6] parse on a relative Windows path with a trailing backslash and an extension", () => {
  expect(parse(".\\dir\\file.js\\")).to.deep.equal({
    root: ".",
    dir: "./dir",
    base: "file.js",
    ext: ".js",
    name: "file",
  });
});

it("[happy-6] parse on a UNC path with a trailing backslash and an extension", () => {
  expect(parse("\\\\server\\share\\doc.pdf\\")).to.deep.equal({
    root: "/",
    dir: "//server/share",
    base: "doc.pdf",
    ext: ".pdf",
    name: "doc",
  });
});

// Extends "[happy-6] parse takes base, ext and name from basename when a
// Windows path ends in several backslashes": mixed separators, more of them.
it("[happy-6] parse takes base, ext and name from basename when a Windows path ends in mixed separators", () => {
  const p = "D:\\data\\export.csv\\/\\/\\\\";
  const parsed = parse(p);
  expect(parsed.base).to.equal("export.csv");
  expect(parsed.base).to.equal(basename(p));
  expect(parsed.ext).to.equal(".csv");
  expect(parsed.name).to.equal("export");
});

it("[happy-6] parse on a Windows path with a trailing backslash gives the same result with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(parse("C:\\path\\file.txt\\")).to.deep.equal({
      root: "C:",
      dir: "C:/path",
      base: "file.txt",
      ext: ".txt",
      name: "file",
    });
  });
});

// ---------------------------------------------------------------------------
// @happy 7: parse on paths without a trailing separator is unchanged
// ---------------------------------------------------------------------------

// Extends "[happy-7] parse on paths without a trailing separator is
// unchanged": other POSIX, Windows and UNC paths.
it("[happy-7] parse on other POSIX paths without a trailing separator is unchanged", () => {
  expect(parse("/var/log/sys.log")).to.deep.equal({
    root: "/",
    dir: "/var/log",
    base: "sys.log",
    ext: ".log",
    name: "sys",
  });
  expect(parse("src/index.ts")).to.deep.equal({
    root: "src",
    dir: "src",
    base: "index.ts",
    ext: ".ts",
    name: "index",
  });
});

// Extends "[happy-7] parse on a relative path with no extension and no
// trailing separator is unchanged": Windows and UNC forms.
it("[happy-7] parse on Windows and UNC paths without a trailing separator is unchanged", () => {
  expect(parse("C:\\a\\b.c")).to.deep.equal({
    root: "C:",
    dir: "C:/a",
    base: "b.c",
    ext: ".c",
    name: "b",
  });
  expect(parse("\\\\server\\share\\x.y")).to.deep.equal({
    root: "/",
    dir: "//server/share",
    base: "x.y",
    ext: ".y",
    name: "x",
  });
});
