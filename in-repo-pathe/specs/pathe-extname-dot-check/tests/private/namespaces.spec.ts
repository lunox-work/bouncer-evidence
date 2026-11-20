import { expect, it } from "vitest";

import { extname } from "../../src/_path";
import pathe, { posix, win32 } from "../../src";

// Rule: posix.extname, win32.extname and the default export pass through to extname

it('[happy-5] posix.extname and win32.extname both return "." for "file."', () => {
  expect(posix.extname("file.")).toBe(".");
  expect(win32.extname("file.")).toBe(".");
});

// Extends "[happy-5] posix.extname and win32.extname both return "." for "file."":
// the default export and other trailing-dot inputs, including Windows paths.
it('[happy-5] posix, win32 and the default export return "." for other trailing-dot inputs', () => {
  for (const input of [
    "file.",
    "dir/file.",
    "file.txt.",
    "file..",
    ".file.",
    "foo/..",
    "foo/.",
    String.raw`C:\temp\file.`,
  ]) {
    expect(posix.extname(input)).toBe(".");
    expect(win32.extname(input)).toBe(".");
    expect(pathe.extname(input)).toBe(".");
  }
});

// Extends "[happy-5] posix.extname and win32.extname agree with extname for ".." and ".""
// every namespace agrees with extname across all branches, in the same call sequence.
it("[happy-5] posix, win32 and the default export agree with extname on inputs of every kind", () => {
  const inputs = [
    "file.",
    "..",
    ".",
    "/temp/myfile.html",
    ".foo",
    "file./",
    "...",
    "a/b/..",
    String.raw`a\file.`,
  ];
  const expected = [".", "", "", ".html", "", "", ".", ".", "."];
  inputs.forEach((input, index) => {
    expect(extname(input)).toBe(expected[index]);
    expect(posix.extname(input)).toBe(expected[index]);
    expect(win32.extname(input)).toBe(expected[index]);
    expect(pathe.extname(input)).toBe(expected[index]);
  });
});
