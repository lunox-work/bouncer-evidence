import { expect, it } from "vitest";

import { format } from "../../src/_path";
import pathe, { posix, win32 } from "../../src";

type FormatInput = Parameters<typeof format>[0];

function expectFormats(cases: [FormatInput, string][]) {
  for (const [input, output] of cases) {
    expect(format(input), JSON.stringify(input)).toBe(output);
  }
}

// Rule: A missing name counts as the empty string

// Extends public "[happy-1] only an extension is given": other extensions,
// and an extension-only object must not be special-cased to ".txt".
it("[happy-1] only an extension is given, other extensions", () => {
  expectFormats([
    [{ ext: ".md" }, ".md"],
    [{ ext: ".js" }, ".js"],
    [{ ext: ".a.b.c" }, ".a.b.c"],
    [{ ext: ".TXT" }, ".TXT"],
  ]);
});

// Extends public "[happy-1] only an extension is given": the ext-only object
// with every other field explicitly undefined.
it("[happy-1] only an extension is given with other fields explicitly undefined", () => {
  expect(
    format({
      root: undefined,
      dir: undefined,
      base: undefined,
      name: undefined,
      ext: ".txt",
    }),
  ).toBe(".txt");
});

// format is the same function under posix, win32 and the default export.
it("[happy-1] only an extension is given through posix, win32 and default", () => {
  expect(posix.format).toBe(format);
  expect(win32.format).toBe(format);
  expect(pathe.format).toBe(format);
  expect(posix.format({ ext: ".txt" })).toBe(".txt");
  expect(win32.format({ ext: ".txt" })).toBe(".txt");
  expect(pathe.format({ ext: ".txt" })).toBe(".txt");
});

// Extends public "[happy-2] directory and extension without a name":
// relative dirs, deeper dirs, a dot-less ext.
it("[happy-2] directory and extension without a name, other directories", () => {
  expectFormats([
    [{ dir: "src", ext: ".ts" }, "src/.ts"],
    [{ dir: "a/b/c/d/e", ext: ".json" }, "a/b/c/d/e/.json"],
    [{ dir: "/var/log", ext: "log" }, "/var/log/.log"],
    [{ dir: "/home/user", ext: ".tar.gz" }, "/home/user/.tar.gz"],
  ]);
});

// Extends public "[happy-2]": directory and extension under an absolute root.
it("[happy-2] root, directory and extension without a name", () => {
  expect(format({ root: "/", dir: "/home/user", ext: ".txt" })).toBe(
    "/home/user/.txt",
  );
});

// Extends public "[boundary-1] name explicitly undefined": ext with a dot,
// no dir, and a dir with a nested path.
it("[boundary-1] name explicitly undefined, other combinations", () => {
  expectFormats([
    [{ name: undefined, ext: ".txt" }, ".txt"],
    [{ name: undefined, ext: "md" }, ".md"],
    [{ dir: "dist/sub", name: undefined, ext: ".js" }, "dist/sub/.js"],
    [{ dir: "dist", name: undefined, base: undefined, ext: "txt" }, "dist/.txt"],
    [{ root: "/", name: undefined, ext: "txt" }, "/.txt"],
  ]);
});

// A missing name never yields the text "undefined" for any combination.
it("[boundary-1] a missing name never produces the text undefined", () => {
  const dirs = [undefined, "", "/home/user", "dist", "dist/"];
  const exts = [undefined, "", "txt", ".txt"];
  for (const dir of dirs) {
    for (const ext of exts) {
      for (const input of [
        { dir, ext } as FormatInput,
        { dir, name: undefined, ext } as FormatInput,
      ]) {
        let result = "";
        expect(() => {
          result = format(input);
        }, JSON.stringify(input)).not.toThrow();
        expect(result, JSON.stringify(input)).not.toContain("undefined");
        expect(result, JSON.stringify(input)).not.toContain("NaN");
      }
    }
  }
});

// Rule: A missing or empty ext adds nothing to the name

// Extends public "[happy-3] name without a usable extension": other names,
// names containing dots, relative dirs.
it("[happy-3] name without a usable extension, other names", () => {
  expectFormats([
    [{ name: "README" }, "README"],
    [{ name: "Makefile", ext: "" }, "Makefile"],
    [{ name: "archive.tar" }, "archive.tar"],
    [{ name: "a.b.c", ext: undefined }, "a.b.c"],
    [{ dir: "src/lib", name: "index" }, "src/lib/index"],
    [{ dir: "src", name: "index", ext: "" }, "src/index"],
    [{ root: "/", dir: "/etc", name: "hosts" }, "/etc/hosts"],
    [{ root: "/", name: "file", ext: undefined }, "/file"],
  ]);
});

// format is pure: a frozen input is accepted and the result is stable.
it("[happy-3] name without an extension from a frozen object, called twice", () => {
  const input = Object.freeze({ dir: "/home/user", name: "file" });
  expect(format(input)).toBe("/home/user/file");
  expect(format(input)).toBe("/home/user/file");
  expect(input).toEqual({ dir: "/home/user", name: "file" });
});

// A missing ext never yields the text "undefined" for any combination.
it("[happy-3] a missing ext never produces the text undefined", () => {
  const roots = [undefined, "", "/"];
  const dirs = [undefined, "", "/home/user", "dist"];
  const names = ["", "file", ".bashrc"];
  for (const root of roots) {
    for (const dir of dirs) {
      for (const name of names) {
        for (const input of [
          { root, dir, name } as FormatInput,
          { root, dir, name, ext: undefined } as FormatInput,
          { root, dir, name, ext: "" } as FormatInput,
        ]) {
          let result = "";
          expect(() => {
            result = format(input);
          }, JSON.stringify(input)).not.toThrow();
          expect(result, JSON.stringify(input)).not.toContain("undefined");
        }
      }
    }
  }
});

// Extends public "[boundary-2] name that itself starts with a dot": with an
// extension, under a root, and other dot-names.
it("[boundary-2] dotted name with an extension or a root", () => {
  expectFormats([
    [{ name: ".bashrc", ext: "bak" }, ".bashrc.bak"],
    [{ name: ".env", ext: ".local" }, ".env.local"],
    [{ name: ".gitignore", ext: "" }, ".gitignore"],
    [{ root: "/", name: ".profile" }, "/.profile"],
    [{ dir: "src", name: ".eslintrc" }, "src/.eslintrc"],
  ]);
});

// Rule: An ext without a leading dot gets one; an ext with a leading dot is used as given

// Extends public "[happy-4] extension dot handling": extensions other than
// "txt", and the no-dot rule combined with dirs and roots.
it("[happy-4] extension dot handling, other extensions", () => {
  expectFormats([
    [{ name: "index", ext: "js" }, "index.js"],
    [{ name: "index", ext: ".js" }, "index.js"],
    [{ name: "photo", ext: "JPG" }, "photo.JPG"],
    [{ name: "a", ext: "b" }, "a.b"],
    [{ ext: "md" }, ".md"],
    [{ name: "file", ext: "a.b.c" }, "file.a.b.c"],
    [{ name: "file", ext: ".a.b.c" }, "file.a.b.c"],
    [{ dir: "src", name: "main", ext: "ts" }, "src/main.ts"],
    [{ root: "/", name: "file", ext: "md" }, "/file.md"],
  ]);
});

// Extends public "[happy-4]": a name ending in a dot plus a dot-less ext
// still gets exactly one inserted dot.
it("[happy-4] name ending with a dot and a dot-less extension", () => {
  expect(format({ name: "file.", ext: "txt" })).toBe("file..txt");
});

// Extends public "[boundary-3] only one leading dot is checked": more dots,
// ext-only, and with dirs.
it("[boundary-3] only one leading dot is checked, more dots", () => {
  expectFormats([
    [{ name: "file", ext: "..." }, "file..."],
    [{ name: "file", ext: ".." }, "file.."],
    [{ name: "file", ext: "...gz" }, "file...gz"],
    [{ name: "file", ext: "..tar.gz" }, "file..tar.gz"],
    [{ ext: "..txt" }, "..txt"],
    [{ dir: "dist", name: "file", ext: "." }, "dist/file."],
  ]);
});

// Shortcut check for "[boundary-3]": stripping all leading dots then adding
// one, or always prepending a dot, both get these wrong.
it("[boundary-3] leading dots are neither stripped nor doubled", () => {
  expect(format({ name: "file", ext: "..txt" })).not.toBe("file.txt");
  expect(format({ name: "file", ext: "." })).not.toBe("file..");
  expect(format({ name: "file", ext: "." })).toBe("file.");
  expect(format({ name: "a", ext: "txt" })).toBe("a.txt");
});

// Rule: base wins over name and ext whenever base is not undefined

// Extends public "[happy-5] base given together with name or ext": base wins
// over a name and dot-less ext that would otherwise produce a different file.
it("[happy-5] base wins over a name and dot-less ext that would otherwise apply", () => {
  expect(format({ name: "file", ext: "txt" })).toBe("file.txt");
  expectFormats([
    [{ base: "a.md", name: "file", ext: "txt" }, "a.md"],
    [{ dir: "docs", base: "a.md", name: "file", ext: "txt" }, "docs/a.md"],
    [{ base: "x", name: "file" }, "x"],
    [{ base: "x", ext: "txt" }, "x"],
    [{ root: "/", dir: "/srv", base: "b.json", ext: "txt" }, "/srv/b.json"],
  ]);
});

// Extends public "[happy-5]": base wins even over an ext-only object.
it("[happy-5] base wins over ext alone", () => {
  expect(format({ ext: "txt" })).toBe(".txt");
  expect(format({ base: "keep.md", ext: "txt" })).toBe("keep.md");
  expect(format({ base: "keep.md", name: undefined, ext: ".txt" })).toBe(
    "keep.md",
  );
});

// Extends public "[boundary-4] base explicitly undefined falls back to name
// and ext": ext only, dot ext, with a root.
it("[boundary-4] base explicitly undefined, other fallbacks", () => {
  expectFormats([
    [{ base: undefined, name: "f", ext: ".md" }, "f.md"],
    [{ base: undefined, ext: "md" }, ".md"],
    [{ base: undefined, name: "f", ext: "" }, "f"],
    [{ root: "/", base: undefined, name: "f", ext: "md" }, "/f.md"],
    [{ dir: "docs", base: undefined, name: "readme", ext: "md" }, "docs/readme.md"],
  ]);
});

// Rule: An empty-string base still wins, so name and ext are ignored and the base segment is dropped

// Extends public "[boundary-5] empty base": an empty base does not fall back
// to name/ext the way an undefined base does.
it("[boundary-5] empty base is not treated like an undefined base", () => {
  expect(format({ base: undefined, name: "file", ext: "txt" })).toBe(
    "file.txt",
  );
  expectFormats([
    [{ base: "", name: "file", ext: "txt" }, ""],
    [{ base: "", name: "file" }, ""],
    [{ base: "", ext: "txt" }, ""],
    [{ dir: "dist", base: "", name: "a", ext: "js" }, "dist"],
  ]);
});

// Extends public "[boundary-5]": empty base with only a root.
it("[boundary-5] empty base with only a root and a name", () => {
  expect(format({ root: "/", name: "file" })).toBe("/file");
  expect(format({ root: "/", base: "", name: "file", ext: "txt" })).toBe("/");
});

// Rule: Empty segments are dropped; with nothing left the result is the empty string

// Extends public "[boundary-6] nothing to format": only one of name/ext is
// given as "", the other left out.
it("[boundary-6] nothing to format with only an empty name or ext", () => {
  expectFormats([
    [{ name: "" }, ""],
    [{ ext: "" }, ""],
    [{ name: "", ext: undefined }, ""],
    [{ name: undefined, ext: "" }, ""],
    [{ root: "", dir: "", name: "" }, ""],
    [{ root: "", dir: "", base: undefined, name: "", ext: "" }, ""],
  ]);
});

// Extends public "[boundary-6]": the empty result is never ".".
it("[boundary-6] nothing to format is not a dot", () => {
  expect(format({ dir: "", ext: "" })).toBe("");
  expect(format({ dir: "", ext: "" })).not.toBe(".");
});

// Extends public "[boundary-7] only one non-empty segment": the single
// segment survives when name/ext are present but empty.
it("[boundary-7] only one non-empty segment with empty name or ext", () => {
  expectFormats([
    [{ dir: "/home/user", name: "" }, "/home/user"],
    [{ dir: "/home/user", ext: "" }, "/home/user"],
    [{ dir: "relative/dir", name: "", ext: "" }, "relative/dir"],
    [{ root: "/", name: "" }, "/"],
    [{ root: "/", ext: "" }, "/"],
    [{ root: "/", dir: "/", name: "", ext: "" }, "/"],
    [{ root: "/", dir: "", base: "" }, "/"],
  ]);
});

// Extends public "[boundary-7]": a lone segment that is the base.
it("[boundary-7] only a name-derived base segment", () => {
  expectFormats([
    [{ dir: "", name: "file" }, "file"],
    [{ root: "", ext: "txt" }, ".txt"],
  ]);
});

// Rule: With a non-empty root the segments are resolved; without a root they are joined with "/" verbatim

// Extends public "[happy-6] root given, segments resolved and normalised":
// partial name/ext with dot segments, relative dirs, trailing separators.
it("[happy-6] root given with partial name or ext, segments resolved", () => {
  expectFormats([
    [{ root: "/", dir: "/a/b/..", ext: "md" }, "/a/.md"],
    [{ root: "/", dir: "/a/./b", name: "x" }, "/a/b/x"],
    [{ root: "/", dir: "home", name: "f", ext: "js" }, "/home/f.js"],
    [{ root: "/", dir: "/dist/", name: "a", ext: "js" }, "/dist/a.js"],
    [{ root: "/ignored", dir: "/x", name: "f" }, "/x/f"],
    [{ root: "/", dir: "//a//b", ext: ".txt" }, "/a/b/.txt"],
  ]);
});

// Extends public "[happy-6]": windows drive roots with missing ext or name.
it("[happy-6] drive root with a missing ext or name", () => {
  expectFormats([
    [{ root: "c:\\", dir: "c:\\Users", name: "readme" }, "C:/Users/readme"],
    [{ root: "C:\\", dir: "C:\\a\\b\\..", ext: "ini" }, "C:/a/.ini"],
    [{ root: "D:\\", dir: "D:\\data", name: "f", ext: "csv" }, "D:/data/f.csv"],
  ]);
});

// Extends public "[happy-7] no root, segments joined with slash and not
// normalised": partial name/ext with unnormalised dirs.
it("[happy-7] no root with partial name or ext, joined verbatim", () => {
  expectFormats([
    [{ dir: "a\\b", name: "c", ext: "d" }, "a/b/c.d"],
    [{ dir: "./x/../y", ext: "md" }, "./x/../y/.md"],
    [{ dir: "a//b", name: "f" }, "a//b/f"],
    [{ dir: "a/./b", name: "f", ext: "" }, "a/./b/f"],
    [{ dir: "../up", name: "f", ext: "ts" }, "../up/f.ts"],
    [{ dir: "/abs/../x", name: "f" }, "/abs/../x/f"],
  ]);
});

// Extends public "[happy-7]": a lower-case drive letter in dir is upper-cased
// even without a root.
it("[happy-7] no root, lower-case drive dir is upper-cased", () => {
  expectFormats([
    [{ dir: "c:\\x", name: "f" }, "C:/x/f"],
    [{ dir: "d:\\a\\..\\b", ext: "txt" }, "D:/a/../b/.txt"],
  ]);
});

// Extends public "[boundary-8] no root and a dir with a trailing separator
// keeps both separators": ext only, absolute dir, backslash separator.
it("[boundary-8] trailing-separator dir with partial name or ext", () => {
  expectFormats([
    [{ dir: "dist/", ext: "js" }, "dist//.js"],
    [{ dir: "dist/", name: "a" }, "dist//a"],
    [{ dir: "/abs/", name: "f", ext: "md" }, "/abs//f.md"],
    [{ dir: "a\\", name: "b" }, "a//b"],
    [{ dir: "a/b/c/", name: "d", ext: ".e" }, "a/b/c//d.e"],
  ]);
});

// Extends public "[boundary-9] no root and only a dir with a trailing
// separator": empty base, missing name, absolute and backslash dirs.
it("[boundary-9] only a trailing-separator dir with empty name or ext", () => {
  expectFormats([
    [{ dir: "dist/", ext: "" }, "dist/"],
    [{ dir: "dist/", name: "" }, "dist/"],
    [{ dir: "dist/", base: "", name: "a", ext: "js" }, "dist/"],
    [{ dir: "/abs/", name: "", ext: undefined }, "/abs/"],
    [{ dir: "a\\", ext: "" }, "a/"],
  ]);
});
