import { expect, it } from "vitest";

import { extname } from "../../src/_path";

// Rule: Extensions that do not end in a dot keep their current result.
// Every test here first checks the new trailing-dot result so that the
// unchanged behaviour is asserted around (and after) a call that matched
// the new regex branch: the spec requires no state shared between calls.

it("[happy-1] extname returns every spec example extension after a trailing-dot call", () => {
  expect(extname("file.")).toBe(".");
  expect(extname("/temp/myfile.html")).toBe(".html");
  expect(extname("./myfile.html")).toBe(".html");
  expect(extname("./myfile.tar.gz")).toBe(".gz");
  expect(extname("./myfile.tar.gz.br")).toBe(".br");
  expect(extname("foo.123")).toBe(".123");
  expect(extname("..foo")).toBe(".foo");
  expect(extname(String.raw`C:\temp\myfile.html`)).toBe(".html");
  expect(extname(String.raw`\temp\myfile.html`)).toBe(".html");
  expect(extname(String.raw`.\myfile.html`)).toBe(".html");
});

// Extends "[happy-1] extname keeps returning the extension of a plain file name":
// other extensions and lengths, so a lookup table of the visible cases fails.
it("[happy-1] extname returns other single extensions of varying length", () => {
  expect(extname("a.")).toBe(".");
  expect(extname("index.js")).toBe(".js");
  expect(extname("a.b")).toBe(".b");
  expect(extname("/x/y/z/readme.markdown")).toBe(".markdown");
  expect(extname("photo.JPEG")).toBe(".JPEG");
  expect(extname("archive.7z")).toBe(".7z");
  expect(extname("my file.with space")).toBe(".with space");
  expect(extname(`${"n".repeat(500)}.${"e".repeat(300)}`)).toBe(
    `.${"e".repeat(300)}`,
  );
});

// Extends "[happy-1] extname returns only the last extension, also for a leading double dot and Windows paths":
// more parts, a leading double dot inside a directory, lowercase drive and mixed separators.
it("[happy-1] extname returns only the last of many extensions and handles more Windows forms", () => {
  expect(extname("x.y.")).toBe(".");
  expect(extname("a.b.c.d.e.f.ts")).toBe(".ts");
  expect(extname("dir/..foo")).toBe(".foo");
  expect(extname("dir/...foo")).toBe(".foo");
  expect(extname("dir.d/file.txt")).toBe(".txt");
  expect(extname(String.raw`c:\temp\sub\myfile.tar.gz`)).toBe(".gz");
  expect(extname(String.raw`C:\temp/mixed\file.css`)).toBe(".css");
  expect(extname(String.raw`\\server\share\file.pdf`)).toBe(".pdf");
});

// A regex with a `g` flag would carry lastIndex from one call to the next and
// lose the second match of the same (or a shorter) input.
it("[happy-1] extname returns the same extension when called repeatedly and in alternation with trailing-dot inputs", () => {
  expect(extname("/temp/myfile.html")).toBe(".html");
  expect(extname("/temp/myfile.html")).toBe(".html");
  expect(extname("file.txt.")).toBe(".");
  expect(extname("file.txt.")).toBe(".");
  expect(extname("a.md")).toBe(".md");
  expect(extname("dir/file.")).toBe(".");
  expect(extname("a.md")).toBe(".md");
  for (let i = 0; i < 5; i++) {
    expect(extname("long/path/to/some/file.json")).toBe(".json");
    expect(extname("x.")).toBe(".");
  }
});

it("[boundary-1] extname returns an empty string for every spec example without an extension after a trailing-dot call", () => {
  expect(extname("file.")).toBe(".");
  expect(extname("")).toBe("");
  expect(extname(".foo")).toBe("");
  expect(extname("./")).toBe("");
  expect(extname("a.b/c")).toBe("");
  expect(extname("file")).toBe("");
});

// Extends "[boundary-1] extname returns an empty string for names without a dot":
// deeper paths, dotted directories, Windows paths.
it("[boundary-1] extname returns an empty string for other names without a dot", () => {
  expect(extname("dir/file.")).toBe(".");
  expect(extname("/usr/local/bin/node")).toBe("");
  expect(extname("a.b/c.d/e")).toBe("");
  expect(extname(String.raw`C:\temp.d\file`)).toBe("");
  expect(extname("x".repeat(1000))).toBe("");
});

// Extends "[boundary-1] extname returns an empty string for the empty string, a dotfile and a bare relative dir":
// other bare dotfiles, other bare directories (also with a backslash).
it("[boundary-1] extname returns an empty string for other bare dotfiles and bare directories", () => {
  expect(extname(".file.")).toBe(".");
  expect(extname(".bashrc")).toBe("");
  expect(extname(".x")).toBe("");
  expect(extname(".gitconfig")).toBe("");
  expect(extname(".\\")).toBe("");
  expect(extname("/")).toBe("");
  expect(extname("foo/")).toBe("");
  expect(extname(".foo")).toBe("");
  expect(extname("")).toBe("");
});
