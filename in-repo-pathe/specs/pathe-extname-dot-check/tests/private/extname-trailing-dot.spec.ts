import { expect, it } from "vitest";

import { extname } from "../../src/_path";

// Rule: A final dot that comes after another character is the extension "."

it('[happy-2] extname returns "." for every spec example ending in one dot', () => {
  expect(extname("file.")).toBe(".");
  expect(extname("dir/file.")).toBe(".");
  expect(extname("/temp/file.")).toBe(".");
  expect(extname("file.txt.")).toBe(".");
});

// Extends "[happy-2] extname returns "." for a name that ends in one dot":
// other names, single-character names, deeper paths, long names.
it('[happy-2] extname returns "." for other names that end in one dot', () => {
  expect(extname("a.")).toBe(".");
  expect(extname("x/y/z/name.")).toBe(".");
  expect(extname("/a.")).toBe(".");
  expect(extname("my file.")).toBe(".");
  expect(extname("a.b/c.")).toBe(".");
  expect(extname(`${"n".repeat(2000)}.`)).toBe(".");
});

// Extends "[happy-2] extname returns "." rather than the earlier extension when a name with an extension ends in a dot":
// several earlier extensions, numeric and leading-double-dot names.
it('[happy-2] extname returns "." rather than any earlier extension for multi-extension names ending in a dot', () => {
  expect(extname("file.tar.gz.")).toBe(".");
  expect(extname("/temp/myfile.html.")).toBe(".");
  expect(extname("foo.123.")).toBe(".");
  expect(extname("..foo.")).toBe(".");
  expect(extname("a.b.c.d.")).toBe(".");
});

// Rule: two or more trailing dots still give "."

// Extends "[boundary-2] extname returns "." for a name that ends in two dots":
// more trailing dots, in directories, after an extension.
it('[boundary-2] extname returns "." for names ending in three or more dots', () => {
  expect(extname("file..")).toBe(".");
  expect(extname("a.b..")).toBe(".");
  expect(extname("file...")).toBe(".");
  expect(extname("file....")).toBe(".");
  expect(extname("dir/file..")).toBe(".");
  expect(extname("/temp/file.txt..")).toBe(".");
  expect(extname(`file${".".repeat(50)}`)).toBe(".");
});

// Extends "[boundary-2] extname returns "." for exactly three dots":
// four and more dots alone, and all-dot names in a directory.
it('[boundary-2] extname returns "." for runs of four or more dots, alone or in a directory', () => {
  expect(extname("...")).toBe(".");
  expect(extname("....")).toBe(".");
  expect(extname(".....")).toBe(".");
  expect(extname("dir/...")).toBe(".");
  expect(extname("/....")).toBe(".");
  expect(extname(".".repeat(100))).toBe(".");
});

// Only the exact input ".." is special: anything else ending in two dots is ".".
it('[boundary-2] extname returns "." for a single character followed by two dots', () => {
  expect(extname("a..")).toBe(".");
  expect(extname(" ..")).toBe(".");
  expect(extname("..a..")).toBe(".");
});

// Rule: A dotfile that ends in a dot has the extension "."

// Extends "[boundary-3] extname returns "." for a dotfile that ends in a dot":
// short dotfiles, dotfiles with an inner extension, two trailing dots.
it('[boundary-3] extname returns "." for other dotfiles that end in a dot', () => {
  expect(extname(".file.")).toBe(".");
  expect(extname(".a.")).toBe(".");
  expect(extname(".config.json.")).toBe(".");
  expect(extname(".bashrc..")).toBe(".");
});

// Extends "[boundary-3] extname returns "." for a dotfile ending in a dot inside a directory":
// absolute, deeper and Windows directories.
it('[boundary-3] extname returns "." for dotfiles ending in a dot in absolute, deep and Windows directories', () => {
  expect(extname("foo/.bar.")).toBe(".");
  expect(extname("/.bar.")).toBe(".");
  expect(extname("/home/user/.profile.")).toBe(".");
  expect(extname(String.raw`C:\Users\me\.npmrc.`)).toBe(".");
  expect(extname(String.raw`foo\.bar.`)).toBe(".");
});

// Rule: Backslash paths are normalised first and then follow the same rule

it('[happy-4] extname returns "." for every spec example of a Windows path ending in a dot', () => {
  expect(extname(String.raw`a\file.`)).toBe(".");
  expect(extname(String.raw`C:\temp\file.`)).toBe(".");
  expect(extname(String.raw`.\file.`)).toBe(".");
});

// Extends "[happy-4] extname of a backslash path ending in a dot returns ".""
// and "[happy-4] extname of a relative backslash path ending in a dot returns ".""
// deeper paths, lowercase drive, rooted, UNC, mixed separators, earlier extension.
it('[happy-4] extname returns "." for other Windows paths ending in a dot', () => {
  expect(extname(String.raw`c:\temp\file.`)).toBe(".");
  expect(extname(String.raw`C:\a\b\c\file.`)).toBe(".");
  expect(extname(String.raw`\file.`)).toBe(".");
  expect(extname(String.raw`\\server\share\file.`)).toBe(".");
  expect(extname(String.raw`a/b\file.`)).toBe(".");
  expect(extname(String.raw`C:\temp\file.txt.`)).toBe(".");
  expect(extname(String.raw`..\file.`)).toBe(".");
  expect(extname(String.raw`a\file..`)).toBe(".");
});
