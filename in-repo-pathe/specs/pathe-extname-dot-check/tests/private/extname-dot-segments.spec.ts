import { expect, it } from "vitest";

import { extname } from "../../src/_path";

// Rule: The exact input "." returns an empty string

// Extends "[boundary-4] extname of a lone dot returns """ and its repeated-call twin:
// alternation with many different inputs that take each branch.
it('[boundary-4] extname of a lone dot stays "" when interleaved with inputs of every kind', () => {
  const sequence: Array<[string, string]> = [
    ["file.", "."],
    [".", ""],
    ["..", ""],
    [".", ""],
    ["foo/.", "."],
    [".", ""],
    ["a.html", ".html"],
    [".", ""],
    ["...", "."],
    [".", ""],
  ];
  for (const [input, output] of sequence) {
    expect(extname(input)).toBe(output);
  }
});

// A shortcut that returns "" for any input made only of dots must still give "." for runs of 3+.
it('[boundary-4] extname of a lone dot is "" while one more character before it gives "."', () => {
  expect(extname("a.")).toBe(".");
  expect(extname(".")).toBe("");
  expect(extname("/.")).toBe(".");
  expect(extname(".")).toBe("");
});

// Rule: The exact input ".." returns an empty string, before any normalisation

// Extends "[boundary-5] extname of a lone double dot returns "" after a call that matched a trailing dot":
// more and different preceding calls, repeated many times.
it('[boundary-5] extname of a lone double dot stays "" after calls that matched each regex branch', () => {
  expect(extname("..")).toBe("");
  expect(extname("...")).toBe(".");
  expect(extname("..")).toBe("");
  expect(extname("foo/..")).toBe(".");
  expect(extname("..")).toBe("");
  expect(extname("..foo")).toBe(".foo");
  expect(extname("..")).toBe("");
  expect(extname("a..")).toBe(".");
  for (let i = 0; i < 5; i++) {
    expect(extname("..")).toBe("");
    expect(extname("x..")).toBe(".");
  }
});

// Rule: A last segment of ".." that follows a separator gives "."

it('[boundary-7] extname returns "." for every spec example of ".." after a separator', () => {
  expect(extname("foo/..")).toBe(".");
  expect(extname("a/b/..")).toBe(".");
  expect(extname("/..")).toBe(".");
  expect(extname(String.raw`a\..`)).toBe(".");
});

// Extends "[boundary-7] extname of ".." after a separator follows the trailing-dot rule":
// a ".." segment after other ".." or "." segments, and deeper paths.
// A shortcut that returns "" for every input that starts with ".." or whose last segment is ".." fails here.
it('[boundary-7] extname returns "." for ".." after "..", "." and deep directories', () => {
  expect(extname("../..")).toBe(".");
  expect(extname("./..")).toBe(".");
  expect(extname("a/../..")).toBe(".");
  expect(extname("x/y/z/w/..")).toBe(".");
  expect(extname("dir.ext/..")).toBe(".");
});

// Extends "[boundary-7] extname of a root-level ".." and a backslash-separated ".." returns ".""
// drive roots, rooted and deeper backslash paths.
it('[boundary-7] extname returns "." for ".." after drive roots and backslash separators', () => {
  expect(extname(String.raw`C:\..`)).toBe(".");
  expect(extname(String.raw`\..`)).toBe(".");
  expect(extname(String.raw`a\b\..`)).toBe(".");
  expect(extname(String.raw`..\..`)).toBe(".");
  expect(extname(String.raw`C:\temp\..`)).toBe(".");
});

// Rule: A last segment of "." that follows a separator gives "."

it('[boundary-8] extname returns "." for every spec example of a "." segment after a separator', () => {
  expect(extname("foo/.")).toBe(".");
  expect(extname("/.")).toBe(".");
  expect(extname("./.")).toBe(".");
});

// Extends "[boundary-8] extname of a "." segment after a separator follows the trailing-dot rule":
// deeper paths, after "..", after a dotted directory.
it('[boundary-8] extname returns "." for a "." segment after deep, parent and dotted directories', () => {
  expect(extname("a/b/c/.")).toBe(".");
  expect(extname("../.")).toBe(".");
  expect(extname("/a/.")).toBe(".");
  expect(extname("a.txt/.")).toBe(".");
  expect(extname("././.")).toBe(".");
});

// Extends "[boundary-8] extname of a root-level "." and of "./." returns ".""
// backslash and drive-letter forms of a "." segment.
it('[boundary-8] extname returns "." for a "." segment after backslash and drive-letter separators', () => {
  expect(extname(String.raw`a\.`)).toBe(".");
  expect(extname(String.raw`\.`)).toBe(".");
  expect(extname(String.raw`.\.`)).toBe(".");
  expect(extname(String.raw`C:\.`)).toBe(".");
  expect(extname(String.raw`C:\temp\.`)).toBe(".");
});

// Rule: A trailing separator is not removed, so a dot before it is not an extension

it("[unhappy-1] extname returns an empty string for every spec example ending in a separator after a trailing-dot call", () => {
  expect(extname("file.")).toBe(".");
  expect(extname("file./")).toBe("");
  expect(extname("dir/file./")).toBe("");
  expect(extname("file.\\")).toBe("");
  expect(extname("file.txt/")).toBe("");
});

// Extends "[unhappy-1] extname of a path ending in a separator after a dot returns an empty string":
// several trailing separators, two dots before the separator, dotfiles, "." and ".." segments.
// A Node-like implementation that strips trailing separators returns "." or an extension here.
it("[unhappy-1] extname returns an empty string for other dot-then-separator endings", () => {
  expect(extname("dir/file.")).toBe(".");
  expect(extname("file.//")).toBe("");
  expect(extname("file../")).toBe("");
  expect(extname(".file./")).toBe("");
  expect(extname("/temp/file./")).toBe("");
  expect(extname("foo/../")).toBe("");
  expect(extname("foo/./")).toBe("");
  expect(extname(".../")).toBe("");
});

// Extends "[unhappy-1] extname of a path ending in a backslash or after a real extension returns an empty string":
// Windows trailing backslashes and real extensions followed by one or more separators.
it("[unhappy-1] extname returns an empty string for Windows paths and real extensions followed by separators", () => {
  expect(extname(String.raw`a\file.`)).toBe(".");
  expect(extname("C:\\temp\\file.\\")).toBe("");
  expect(extname("a\\b.\\")).toBe("");
  expect(extname("file.txt\\")).toBe("");
  expect(extname("file.txt//")).toBe("");
  expect(extname("/temp/myfile.tar.gz/")).toBe("");
  expect(extname("file.\\\\")).toBe("");
});
