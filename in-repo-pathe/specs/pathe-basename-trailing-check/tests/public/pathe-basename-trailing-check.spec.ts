import { expect, it, vi } from "vitest";

import { basename, parse } from "../src/path";

const WINDOWS_CWD = String.raw`C:\Windows\path\only`;

function withWindowsCwd<T>(function_: () => T): T {
  const cwd = process.cwd;
  process.cwd = vi.fn(() => WINDOWS_CWD);
  try {
    return function_();
  } finally {
    process.cwd = cwd;
  }
}

// @happy 1: Paths that end in a name keep their current result

it("[happy-1] paths that end in a name keep their current result", () => {
  expect(basename("/temp/myfile.html")).to.equal("myfile.html");
  expect(basename("./myfile.html")).to.equal("myfile.html");
  expect(basename("./myfile.html", ".html")).to.equal("myfile");
  expect(basename("./undefined", undefined)).to.equal("undefined");
  expect(basename(String.raw`C:\temp\myfile.html`)).to.equal("myfile.html");
  expect(basename(String.raw`\temp\myfile.html`)).to.equal("myfile.html");
  expect(basename(String.raw`.\myfile.html`, ".html")).to.equal("myfile");
  expect(basename("myfile.html")).to.equal("myfile.html");
  expect(basename("a//b")).to.equal("b");
});

it("[happy-1] an empty interior segment does not affect a path ending in a name, with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(basename("a//b")).to.equal("b");
    expect(basename(String.raw`C:\temp\myfile.html`)).to.equal("myfile.html");
  });
});

// @happy 2: A single trailing slash is ignored

it("[happy-2] a single trailing slash is ignored", () => {
  expect(basename("/temp/dir/")).to.equal("dir");
});

it("[happy-2] a single trailing slash is ignored with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(basename("/temp/dir/")).to.equal("dir");
  });
});

// @boundary 1: Several trailing slashes are all ignored

it("[boundary-1] several trailing slashes are all ignored", () => {
  expect(basename("a/b//")).to.equal("b");
  expect(basename("a/b///")).to.equal("b");
  expect(basename("/temp/dir////")).to.equal("dir");
  expect(basename("dir/")).to.equal("dir");
  expect(basename("dir//")).to.equal("dir");
});

it("[boundary-1] a single-segment relative path with a trailing slash returns that segment", () => {
  expect(basename("dir/")).to.equal("dir");
});

// @boundary 2: The last non-empty segment is returned as it is

it("[boundary-2] the last non-empty segment is returned as it is, not resolved or trimmed", () => {
  expect(basename("a/./")).to.equal(".");
  expect(basename("a/../")).to.equal("..");
  expect(basename("./")).to.equal(".");
  expect(basename("../")).to.equal("..");
  expect(basename("a/ /")).to.equal(" ");
});

it("[boundary-2] a whitespace-only last segment is not trimmed or skipped", () => {
  expect(basename("a/ /")).to.equal(" ");
});

// @happy 3: Trailing backslashes are ignored like trailing slashes

it("[happy-3] trailing backslashes are ignored like trailing slashes", () => {
  expect(basename("C:\\temp\\dir\\")).to.equal("dir");
  expect(basename("C:\\temp\\dir\\\\\\")).to.equal("dir");
  expect(basename("\\temp\\dir\\")).to.equal("dir");
  expect(basename(".\\dir\\")).to.equal("dir");
  expect(basename("a\\b/\\/")).to.equal("b");
  expect(basename("\\\\server\\share\\")).to.equal("share");
});

it("[happy-3] mixed trailing slashes and backslashes are all ignored", () => {
  expect(basename("a\\b/\\/")).to.equal("b");
});

// @boundary 3: A drive root returns the drive, not an empty string

it("[boundary-3] a drive root returns the drive, not an empty string", () => {
  expect(basename("C:\\")).to.equal("C:");
  expect(basename("c:\\")).to.equal("C:");
  expect(basename("C:/")).to.equal("C:");
  expect(basename("C:")).to.equal("C:");
});

it("[boundary-3] a bare lowercase drive with no separator keeps its case", () => {
  expect(basename("c:")).to.equal("c:");
});

// @boundary 4: Empty and root-only paths return ""

it('[boundary-4] empty and root-only paths return ""', () => {
  expect(basename("")).to.equal("");
  expect(basename("/")).to.equal("");
  expect(basename("///")).to.equal("");
  expect(basename("\\")).to.equal("");
  expect(basename("\\\\\\")).to.equal("");
});

it('[boundary-4] the empty string returns ""', () => {
  expect(basename("")).to.equal("");
});

// @boundary 5: An extension has no effect when there is no non-empty segment

it("[boundary-5] an extension has no effect when there is no non-empty segment", () => {
  expect(basename("", ".js")).to.equal("");
  expect(basename("/", ".js")).to.equal("");
  expect(basename("///", ".js")).to.equal("");
  expect(basename("\\\\", ".html")).to.equal("");
});

it("[boundary-5] a backslash-only path with an extension returns an empty string", () => {
  expect(basename("\\\\", ".html")).to.equal("");
});

// @happy 4: The extension is removed even when the path ends in a separator

it("[happy-4] the extension is removed even when the path ends in a separator", () => {
  expect(basename("a/b.js/", ".js")).to.equal("b");
  expect(basename("a/b.js///", ".js")).to.equal("b");
  expect(basename("C:\\temp\\myfile.html\\", ".html")).to.equal("myfile");
  expect(basename(".\\myfile.html\\\\", ".html")).to.equal("myfile");
});

it("[happy-4] the extension is removed after several trailing backslashes", () => {
  expect(basename(".\\myfile.html\\\\", ".html")).to.equal("myfile");
});

// @boundary 6: An extension equal to the whole segment is stripped to ""

it('[boundary-6] an extension equal to the whole segment is stripped to ""', () => {
  expect(basename("a/.js/", ".js")).to.equal("");
  expect(basename("a/.js", ".js")).to.equal("");
  expect(basename(".js", ".js")).to.equal("");
  expect(basename("a/b.js/", "b.js")).to.equal("");
});

it('[boundary-6] an extension equal to a whole named segment before a trailing slash gives ""', () => {
  expect(basename("a/b.js/", "b.js")).to.equal("");
});

// @unhappy 1: An extension that does not end the segment leaves it unchanged

it("[unhappy-1] an extension that does not end the segment leaves it unchanged", () => {
  expect(basename("a/b.js/", ".ts")).to.equal("b.js");
  expect(basename("a/b.JS/", ".js")).to.equal("b.JS");
  expect(basename("a/b/", "xb")).to.equal("b");
  expect(basename("a/myfile.html", ".htm")).to.equal("myfile.html");
});

it("[unhappy-1] the extension match is case-sensitive", () => {
  expect(basename("a/b.JS/", ".js")).to.equal("b.JS");
});

// @boundary 7: An empty or undefined extension strips nothing

it("[boundary-7] an empty or undefined extension strips nothing", () => {
  expect(basename("a/b.js/", "")).to.equal("b.js");
  expect(basename("a/b.js/", undefined)).to.equal("b.js");
});

it("[boundary-7] an omitted extension strips nothing", () => {
  expect(basename("a/b.js/")).to.equal("b.js");
});

// @boundary 8: An extension without a leading dot is matched as a plain suffix

it("[boundary-8] an extension without a leading dot is matched as a plain suffix", () => {
  expect(basename("a/myfile.html/", "html")).to.equal("myfile.");
});

it("[boundary-8] a dotless extension is matched as a plain suffix with process.cwd mocked to Windows", () => {
  withWindowsCwd(() => {
    expect(basename("a/myfile.html/", "html")).to.equal("myfile.");
  });
});

// @happy 5: parse on a path with a trailing slash

it("[happy-5] parse on a path with a trailing slash", () => {
  expect(parse("/home/user/dir/")).to.deep.equal({
    root: "/",
    dir: "/home/user",
    base: "dir",
    ext: "",
    name: "dir",
  });
});

it("[happy-5] parse takes base, ext and name from basename when the path ends in several slashes", () => {
  const parsed = parse("/home/user/dir///");
  expect(parsed.base).to.equal("dir");
  expect(parsed.base).to.equal(basename("/home/user/dir///"));
  expect(parsed.ext).to.equal("");
  expect(parsed.name).to.equal("dir");
});

// @happy 6: parse on a Windows path with a trailing backslash and an extension

it("[happy-6] parse on a Windows path with a trailing backslash and an extension", () => {
  expect(parse("C:\\path\\file.txt\\")).to.deep.equal({
    root: "C:",
    dir: "C:/path",
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
});

it("[happy-6] parse takes base, ext and name from basename when a Windows path ends in several backslashes", () => {
  const parsed = parse("C:\\path\\file.txt\\\\\\");
  expect(parsed.base).to.equal("file.txt");
  expect(parsed.ext).to.equal(".txt");
  expect(parsed.name).to.equal("file");
});

// @happy 7: parse on paths without a trailing separator is unchanged

it("[happy-7] parse on paths without a trailing separator is unchanged", () => {
  expect(parse("/home/user/dir/file.txt")).to.deep.equal({
    root: "/",
    dir: "/home/user/dir",
    base: "file.txt",
    ext: ".txt",
    name: "file",
  });
});

it("[happy-7] parse on a relative path with no extension and no trailing separator is unchanged", () => {
  expect(parse("./dir/file")).to.deep.equal({
    root: ".",
    dir: "./dir",
    base: "file",
    ext: "",
    name: "file",
  });
});
