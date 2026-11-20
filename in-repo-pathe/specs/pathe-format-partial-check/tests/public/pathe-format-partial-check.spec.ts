import { expect, it } from "vitest";

import { format } from "../src/_path";

type FormatInput = Parameters<typeof format>[0];

function expectFormats(cases: [FormatInput, string][]) {
  for (const [input, output] of cases) {
    expect(format(input), JSON.stringify(input)).toBe(output);
  }
}

// Rule: A missing name counts as the empty string

it("[happy-1] only an extension is given", () => {
  expect(format({ ext: ".txt" })).toBe(".txt");
});

it("[happy-1] only a multi-part extension is given", () => {
  expect(format({ ext: ".tar.gz" })).toBe(".tar.gz");
});

it("[happy-2] directory and extension without a name", () => {
  expect(format({ dir: "/home/user", ext: ".txt" })).toBe("/home/user/.txt");
});

it("[happy-2] directory and extension with an empty name", () => {
  expect(format({ dir: "/home/user", name: "", ext: ".txt" })).toBe(
    "/home/user/.txt",
  );
});

it("[boundary-1] name explicitly undefined", () => {
  expect(format({ dir: "dist", name: undefined, ext: "txt" })).toBe(
    "dist/.txt",
  );
});

it("[boundary-1] name explicitly undefined with a root", () => {
  expect(
    format({ root: "/", dir: "/dist", name: undefined, ext: "txt" }),
  ).toBe("/dist/.txt");
});

// Rule: A missing or empty ext adds nothing to the name

it("[happy-3] name without a usable extension", () => {
  expectFormats([
    [{ name: "file" }, "file"],
    [{ name: "file", ext: undefined }, "file"],
    [{ name: "file", ext: "" }, "file"],
    [{ dir: "/home/user", name: "file" }, "/home/user/file"],
    [{ root: "/", name: "file" }, "/file"],
  ]);
});

it("[happy-3] name with an empty extension under a root and directory", () => {
  expect(
    format({ root: "/", dir: "/home/user", name: "file", ext: "" }),
  ).toBe("/home/user/file");
});

it("[boundary-2] name that itself starts with a dot", () => {
  expect(format({ name: ".bashrc" })).toBe(".bashrc");
});

it("[boundary-2] dotted name inside a directory", () => {
  expect(format({ dir: "/home/user", name: ".bashrc" })).toBe(
    "/home/user/.bashrc",
  );
});

// Rule: An ext without a leading dot gets one; an ext with a leading dot is used as given

it("[happy-4] extension dot handling", () => {
  expectFormats([
    [{ name: "file", ext: "txt" }, "file.txt"],
    [{ name: "file", ext: ".txt" }, "file.txt"],
    [{ ext: "txt" }, ".txt"],
    [{ root: "/", ext: "txt" }, "/.txt"],
    [{ dir: "/home/user", ext: "txt" }, "/home/user/.txt"],
    [{ name: "archive.tar", ext: "gz" }, "archive.tar.gz"],
    [{ name: "file", ext: ".tar.gz" }, "file.tar.gz"],
  ]);
});

it("[happy-4] multi-part extension without a leading dot gets one", () => {
  expect(format({ name: "file", ext: "tar.gz" })).toBe("file.tar.gz");
});

it("[boundary-3] only one leading dot is checked", () => {
  expectFormats([
    [{ name: "file", ext: "." }, "file."],
    [{ name: "file", ext: "..txt" }, "file..txt"],
  ]);
});

it("[boundary-3] double-dot extension kept verbatim inside a directory", () => {
  expect(format({ dir: "/home/user", name: "file", ext: "..txt" })).toBe(
    "/home/user/file..txt",
  );
});

// Rule: base wins over name and ext whenever base is not undefined

it("[happy-5] base given together with name or ext", () => {
  expectFormats([
    [{ base: "a.md", name: "file", ext: ".txt" }, "a.md"],
    [{ base: "a.md", ext: "txt" }, "a.md"],
    [{ name: "file", base: "file.txt" }, "file.txt"],
    [{ root: "/", base: "file.txt", ext: "ignored" }, "/file.txt"],
  ]);
});

it("[happy-5] base wins over name and ext inside a directory", () => {
  expect(
    format({ dir: "/home/user", base: "a.md", name: "file", ext: ".txt" }),
  ).toBe("/home/user/a.md");
});

it("[boundary-4] base explicitly undefined falls back to name and ext", () => {
  expect(format({ base: undefined, name: "f", ext: "md" })).toBe("f.md");
});

it("[boundary-4] base explicitly undefined falls back to name alone", () => {
  expect(format({ dir: "docs", base: undefined, name: "f" })).toBe("docs/f");
});

// Rule: An empty-string base still wins, so name and ext are ignored and the base segment is dropped

it("[boundary-5] empty base", () => {
  expectFormats([
    [{ base: "" }, ""],
    [{ base: "", name: "file", ext: ".txt" }, ""],
    [{ dir: "/home/user", base: "", name: "file", ext: ".txt" }, "/home/user"],
  ]);
});

it("[boundary-5] empty base with a root ignores name and ext", () => {
  expect(
    format({
      root: "/",
      dir: "/home/user",
      base: "",
      name: "file",
      ext: "txt",
    }),
  ).toBe("/home/user");
});

// Rule: Empty segments are dropped; with nothing left the result is the empty string

it("[boundary-6] nothing to format", () => {
  expectFormats([
    [{}, ""],
    [{ name: "", ext: "" }, ""],
    [{ root: "", dir: "" }, ""],
  ]);
});

it("[boundary-6] every field explicitly undefined", () => {
  expect(
    format({
      root: undefined,
      dir: undefined,
      base: undefined,
      name: undefined,
      ext: undefined,
    }),
  ).toBe("");
});

it("[boundary-7] only one non-empty segment", () => {
  expectFormats([
    [{ dir: "/home/user" }, "/home/user"],
    [{ root: "/" }, "/"],
    [{ root: "/", dir: "/" }, "/"],
  ]);
});

it("[boundary-7] only a windows directory is normalised", () => {
  expect(format({ dir: String.raw`C:\path` })).toBe("C:/path");
});

// Rule: With a non-empty root the segments are resolved; without a root they are joined with "/" verbatim

it("[happy-6] root given, segments resolved and normalised", () => {
  expectFormats([
    [{ root: "/", name: "file", ext: ".txt" }, "/file.txt"],
    [
      { root: "/", dir: "/home/user", name: "file", ext: "txt" },
      "/home/user/file.txt",
    ],
    [
      { root: "/ignored", dir: "/home/user/dir", base: "file.txt" },
      "/home/user/dir/file.txt",
    ],
    [{ root: "/", dir: "/home/user/../x", base: "f.txt" }, "/home/x/f.txt"],
    [
      { root: "C:\\", dir: "C:\\path", name: "file", ext: "txt" },
      "C:/path/file.txt",
    ],
  ]);
});

it("[happy-6] root given with a lower-case drive letter", () => {
  expect(
    format({
      root: "c:\\",
      dir: String.raw`c:\path`,
      name: "file",
      ext: "txt",
    }),
  ).toBe("C:/path/file.txt");
});

it("[happy-7] no root, segments joined with slash and not normalised", () => {
  expectFormats([
    [{ name: "file", ext: ".txt" }, "file.txt"],
    [{ dir: "/home/user/../x", base: "f.txt" }, "/home/user/../x/f.txt"],
    [{ dir: String.raw`C:\path\dir`, base: "file.txt" }, "C:/path/dir/file.txt"],
    [{ dir: String.raw`a\b`, base: "f.txt" }, "a/b/f.txt"],
  ]);
});

it("[happy-7] no root keeps dot segments of a relative dir", () => {
  expect(format({ dir: "./src/../lib", name: "index", ext: "js" })).toBe(
    "./src/../lib/index.js",
  );
});

it("[boundary-8] no root and a dir with a trailing separator keeps both separators", () => {
  expect(format({ dir: "dist/", base: "a.js" })).toBe("dist//a.js");
});

it("[boundary-8] trailing-separator dir with name and ext keeps both separators", () => {
  expect(format({ dir: "dist/", name: "a", ext: "js" })).toBe("dist//a.js");
});

it("[boundary-9] no root and only a dir with a trailing separator", () => {
  expect(format({ dir: "dist/" })).toBe("dist/");
});

it("[boundary-9] trailing-separator dir with empty name and ext", () => {
  expect(format({ dir: "dist/", name: "", ext: "" })).toBe("dist/");
});
