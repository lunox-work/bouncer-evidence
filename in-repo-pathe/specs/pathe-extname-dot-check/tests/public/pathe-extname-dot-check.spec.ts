import { expect, it } from "vitest";

import { extname, parse } from "../src/_path";
import { posix, win32 } from "../src";

// Rule: Extensions that do not end in a dot keep their current result

it("[happy-1] extname keeps returning the extension of a plain file name", () => {
  expect(extname("/temp/myfile.html")).toBe(".html");
  expect(extname("./myfile.html")).toBe(".html");
  expect(extname("foo.123")).toBe(".123");
});

it("[happy-1] extname returns only the last extension, also for a leading double dot and Windows paths", () => {
  expect(extname("./myfile.tar.gz")).toBe(".gz");
  expect(extname("./myfile.tar.gz.br")).toBe(".br");
  expect(extname("..foo")).toBe(".foo");
  expect(extname(String.raw`C:\temp\myfile.html`)).toBe(".html");
  expect(extname(String.raw`\temp\myfile.html`)).toBe(".html");
  expect(extname(String.raw`.\myfile.html`)).toBe(".html");
});

it("[boundary-1] extname returns an empty string for names without a dot", () => {
  expect(extname("file")).toBe("");
  expect(extname("a.b/c")).toBe("");
});

it("[boundary-1] extname returns an empty string for the empty string, a dotfile and a bare relative dir", () => {
  expect(extname("")).toBe("");
  expect(extname(".foo")).toBe("");
  expect(extname("./")).toBe("");
});

// Rule: A final dot that comes after another character is the extension "."

it('[happy-2] extname returns "." for a name that ends in one dot', () => {
  expect(extname("file.")).toBe(".");
  expect(extname("dir/file.")).toBe(".");
  expect(extname("/temp/file.")).toBe(".");
});

it('[happy-2] extname returns "." rather than the earlier extension when a name with an extension ends in a dot', () => {
  expect(extname("file.txt.")).toBe(".");
});

it('[boundary-2] extname returns "." for a name that ends in two dots', () => {
  expect(extname("file..")).toBe(".");
  expect(extname("a.b..")).toBe(".");
});

it('[boundary-2] extname returns "." for exactly three dots', () => {
  expect(extname("...")).toBe(".");
});

it('[boundary-3] extname returns "." for a dotfile that ends in a dot', () => {
  expect(extname(".file.")).toBe(".");
});

it('[boundary-3] extname returns "." for a dotfile ending in a dot inside a directory', () => {
  expect(extname("foo/.bar.")).toBe(".");
});

it("[happy-3] parse splits a trailing dot into ext and leaves the rest as name", () => {
  expect(parse("dir/file.")).toEqual({
    root: "",
    dir: "dir",
    base: "file.",
    ext: ".",
    name: "file",
  });
});

it('[happy-3] parse of an absolute path ending in a dot keeps ext "." and name consistent with base', () => {
  const parsed = parse("/temp/file.txt.");
  expect(parsed.ext).toBe(".");
  expect(parsed.base).toBe("file.txt.");
  expect(parsed.name).toBe("file.txt");
  expect(parsed.root).toBe("/");
  expect(parsed.dir).toBe("/temp");
});

// Rule: The exact input "." returns an empty string

it('[boundary-4] extname of a lone dot returns ""', () => {
  expect(extname(".")).toBe("");
});

it('[boundary-4] extname of a lone dot returns "" on repeated calls', () => {
  expect(extname(".")).toBe("");
  expect(extname("file.")).toBe(".");
  expect(extname(".")).toBe("");
});

// Rule: The exact input ".." returns an empty string, before any normalisation

it('[boundary-5] extname of a lone double dot returns ""', () => {
  expect(extname("..")).toBe("");
});

it('[boundary-5] extname of a lone double dot returns "" after a call that matched a trailing dot', () => {
  expect(extname("file..")).toBe(".");
  expect(extname("..")).toBe("");
});

it('[boundary-6] parse of a path whose base is ".." has an empty ext', () => {
  expect(parse("/home/..")).toEqual({
    root: "/",
    dir: "/home",
    base: "..",
    ext: "",
    name: "..",
  });
});

it('[boundary-6] parse of a relative path whose base is ".." has an empty ext and name ".."', () => {
  const parsed = parse("foo/..");
  expect(parsed.base).toBe("..");
  expect(parsed.ext).toBe("");
  expect(parsed.name).toBe("..");
});

// Rule: A last segment of ".." that follows a separator gives "."

it('[boundary-7] extname of ".." after a separator follows the trailing-dot rule', () => {
  expect(extname("foo/..")).toBe(".");
  expect(extname("a/b/..")).toBe(".");
});

it('[boundary-7] extname of a root-level ".." and a backslash-separated ".." returns "."', () => {
  expect(extname("/..")).toBe(".");
  expect(extname(String.raw`a\..`)).toBe(".");
});

// Rule: A last segment of "." that follows a separator gives "."

it('[boundary-8] extname of a "." segment after a separator follows the trailing-dot rule', () => {
  expect(extname("foo/.")).toBe(".");
});

it('[boundary-8] extname of a root-level "." and of "./." returns "."', () => {
  expect(extname("/.")).toBe(".");
  expect(extname("./.")).toBe(".");
});

it('[boundary-9] parse of a path whose base is "." has an empty ext', () => {
  expect(parse("foo/.")).toEqual({
    root: "",
    dir: "foo",
    base: ".",
    ext: "",
    name: ".",
  });
});

it('[boundary-9] parse of an absolute path whose base is "." has an empty ext and name "."', () => {
  const parsed = parse("/foo/.");
  expect(parsed.base).toBe(".");
  expect(parsed.ext).toBe("");
  expect(parsed.name).toBe(".");
});

// Rule: A trailing separator is not removed, so a dot before it is not an extension

it("[unhappy-1] extname of a path ending in a separator after a dot returns an empty string", () => {
  expect(extname("file./")).toBe("");
  expect(extname("dir/file./")).toBe("");
});

it("[unhappy-1] extname of a path ending in a backslash or after a real extension returns an empty string", () => {
  expect(extname("file.\\")).toBe("");
  expect(extname("file.txt/")).toBe("");
});

// Rule: Backslash paths are normalised first and then follow the same trailing-dot rule

it('[happy-4] extname of a backslash path ending in a dot returns "."', () => {
  expect(extname(String.raw`a\file.`)).toBe(".");
  expect(extname(String.raw`C:\temp\file.`)).toBe(".");
});

it('[happy-4] extname of a relative backslash path ending in a dot returns "."', () => {
  expect(extname(String.raw`.\file.`)).toBe(".");
});

it('[happy-5] posix.extname and win32.extname both return "." for "file."', () => {
  expect(posix.extname("file.")).toBe(".");
  expect(win32.extname("file.")).toBe(".");
});

it('[happy-5] posix.extname and win32.extname agree with extname for ".." and "."', () => {
  expect(posix.extname("..")).toBe("");
  expect(win32.extname("..")).toBe("");
  expect(posix.extname(".")).toBe("");
  expect(win32.extname(".")).toBe("");
});
