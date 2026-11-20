import { expect, it } from "vitest";

import { join } from "../../src/path";
import {
  normalizeAliases,
  resolveAlias,
  reverseResolveAlias,
} from "../../src/utils";

// --- @happy ---

// extends public "[happy-1] single alias, path below its target"
it("[happy-1] single alias with a multi-segment target and a longer key", () => {
  expect(reverseResolveAlias("/a/b/c/d.ts", { "~lib": "/a/b" })).toEqual([
    "~lib/c/d.ts",
  ]);
});

// extends public "[happy-1] single alias, deeply nested path below its target"
it("[happy-1] single alias among non-matching aliases yields only its own result", () => {
  expect(
    reverseResolveAlias("/root/foo", {
      "#": "/other",
      "@": "/root",
      "~": "/elsewhere/deep",
    }),
  ).toEqual(["@/foo"]);
});

it("[happy-1] result is an array of strings, not the input path", () => {
  const result = reverseResolveAlias("/root/foo", { "@": "/root" });
  expect(Array.isArray(result)).toBe(true);
  expect(result).not.toContain("/root/foo");
  expect(result).toEqual(["@/foo"]);
});

// extends public "[happy-2] reverse of resolveAlias for a simple alias"
it("[happy-2] reverse of resolveAlias round-trips for several aliased paths", () => {
  const aliases = { "@": "/root", "@src": "/root/src", "~/": "/lib" };
  for (const aliased of [
    "@/foo",
    "@/a/b/c.ts",
    "@src/a.ts",
    "@src/deep/x/y.ts",
    "~/util/index.ts",
  ]) {
    const real = resolveAlias(aliased, aliases);
    expect(real).not.toBe(aliased);
    expect(reverseResolveAlias(real, aliases)).toContain(aliased);
  }
});

// extends public "[happy-2] reverse of resolveAlias for an alias key ending in a slash"
it("[happy-2] reverse of resolveAlias for a value resolved through another alias", () => {
  const aliases = { "@": "/root", bingpot: "@/bingpot/index.ts" };
  expect(resolveAlias("bingpot", aliases)).toBe("/root/bingpot/index.ts");
  expect(reverseResolveAlias("/root/bingpot/index.ts", aliases)).toContain(
    "bingpot",
  );
});

// extends public "[happy-3] alias key ending in a slash"
it("[happy-3] alias key ending in a slash with a deeper path", () => {
  expect(reverseResolveAlias("/lib/x/y/z.ts", { "#/": "/lib" })).toEqual([
    "#/x/y/z.ts",
  ]);
});

// extends public "[happy-3] alias whose target is the root directory"
it("[happy-3] root-directory target matches any absolute path", () => {
  const aliases = { "~": "/" };
  expect(reverseResolveAlias("/a", aliases)).toEqual(["~/a"]);
  expect(reverseResolveAlias("/x/y/z.ts", aliases)).toEqual(["~/x/y/z.ts"]);
});

it("[happy-3] root-directory target does not match a relative path", () => {
  expect(reverseResolveAlias("root/a", { "~": "/" })).toEqual([]);
});

// extends public "[happy-4] two aliases match and the longer result comes first"
it("[happy-4] longer result first even when the more specific alias gives the longer result", () => {
  expect(
    reverseResolveAlias("/root/src/a.ts", {
      "@": "/root",
      "@source-files": "/root/src",
    }),
  ).toEqual(["@source-files/a.ts", "@/src/a.ts"]);
});

// extends public "[happy-4] two aliases match and the longer result comes first"
it("[happy-4] order does not depend on insertion order of the aliases", () => {
  expect(
    reverseResolveAlias("/root/src/a.ts", {
      "@src": "/root/src",
      "@": "/root",
    }),
  ).toEqual(["@/src/a.ts", "@src/a.ts"]);
});

// extends public "[happy-4] two aliases match when the path equals the more specific target"
it("[happy-4] three nested aliases all match, sorted by result length", () => {
  expect(
    reverseResolveAlias("/r/s/t/file.ts", {
      "#t": "/r/s/t",
      "@": "/r",
      "~very-long-alias": "/r/s",
    }),
  ).toEqual(["~very-long-alias/t/file.ts", "@/s/t/file.ts", "#t/file.ts"]);
});

it("[happy-4] four aliases, mixed specificity and key lengths", () => {
  expect(
    reverseResolveAlias("/a/b/c/d/e", {
      w: "/a",
      xxxxxxxx: "/a/b/c/d",
      yy: "/a/b",
      zzzz: "/a/b/c",
    }),
  ).toEqual(["xxxxxxxx/e", "w/b/c/d/e", "yy/c/d/e", "zzzz/d/e"]);
});

// extends public "[happy-5] exact match and prefix match together"
it("[happy-5] exact match with a long key comes before a shorter prefix result", () => {
  expect(
    reverseResolveAlias("/root/a", {
      "@": "/root",
      "#very-long-key": "/root/a",
    }),
  ).toEqual(["#very-long-key", "@/a"]);
});

// extends public "[happy-5] exact match and prefix match together"
it("[happy-5] exact match and prefix match with reversed insertion order", () => {
  expect(
    reverseResolveAlias("/root/a", { "#": "/root/a", "@": "/root" }),
  ).toEqual(["@/a", "#"]);
});

// extends public "[happy-5] only the prefix match when the other target is a mere string prefix"
it("[happy-5] exact match on a deeper target alongside a root-directory prefix match", () => {
  expect(reverseResolveAlias("/p/q", { "~": "/", "#": "/p/q" })).toEqual([
    "~/p/q",
    "#",
  ]);
});

// extends public "[happy-6] alias values are resolved against each other before matching"
it("[happy-6] values resolved through a chain of aliases", () => {
  expect(
    reverseResolveAlias("/root/src/x.ts", {
      "@": "/root",
      "~": "@/src",
      x: "~/x.ts",
    }),
  ).toEqual(["@/src/x.ts", "~/x.ts", "x"]);
});

// extends public "[happy-6] the unresolved raw alias value is not itself a target"
it("[happy-6] a resolved value matches paths below it", () => {
  expect(
    reverseResolveAlias("/base/pkg/lib/a.js", { "@": "/base", pkg: "@/pkg" }),
  ).toEqual(["@/pkg/lib/a.js", "pkg/lib/a.js"]);
});

it("[happy-6] raw unresolved value prefix does not match", () => {
  expect(
    reverseResolveAlias("@/pkg/lib/a.js", { "@": "/base", pkg: "@/pkg" }),
  ).toEqual([]);
});

it("[happy-6] matching uses the same targets as normalizeAliases", () => {
  const aliases = {
    "@": "/root",
    bingpot: "@/bingpot/index.ts",
    "~": "/root/index.js",
  };
  const normalized = normalizeAliases(aliases);
  expect(normalized.bingpot).toBe("/root/bingpot/index.ts");
  expect(reverseResolveAlias(normalized.bingpot, aliases)).toEqual([
    "@/bingpot/index.ts",
    "bingpot",
  ]);
});

// extends public "[happy-7] backslash input paths match forward-slash targets"
it("[happy-7] backslash input path with a different drive and deeper path", () => {
  expect(
    reverseResolveAlias("D:\\proj\\lib\\x\\y.ts", { "#": "D:/proj" }),
  ).toEqual(["#/lib/x/y.ts"]);
});

// extends public "[happy-7] backslash input paths match forward-slash targets"
it("[happy-7] mixed separators in the input path", () => {
  expect(reverseResolveAlias("/root/a\\b/c\\d", { "@": "/root" })).toEqual([
    "@/a/b/c/d",
  ]);
  expect(reverseResolveAlias("C:/src\\a\\b.ts", { "~win": "C:/src" })).toEqual([
    "~win/a/b.ts",
  ]);
});

// extends public "[happy-7] lower-case drive letter input path matches an upper-case target"
it("[happy-7] lower-case drive letter with forward slashes and an exact match", () => {
  expect(reverseResolveAlias("d:/proj/a", { "#": "D:/proj" })).toEqual(["#/a"]);
  expect(reverseResolveAlias("c:\\src", { "~win": "C:/src" })).toEqual([
    "~win",
  ]);
});

it("[happy-7] backslash input path with several matching aliases", () => {
  expect(
    reverseResolveAlias("C:\\src\\lib\\a.ts", {
      "~win": "C:/src",
      "~lib": "C:/src/lib",
    }),
  ).toEqual(["~win/lib/a.ts", "~lib/a.ts"]);
});

// --- @boundary ---

// extends public "[boundary-1] path equal to a target yields the key on its own"
it("[boundary-1] path equal to a multi-segment target yields the key", () => {
  expect(reverseResolveAlias("/a/b/c", { "~lib": "/a/b/c" })).toEqual(["~lib"]);
});

// extends public "[boundary-1] path equal to a target plus a trailing slash keeps the slash"
it("[boundary-1] path equal to a multi-segment target plus a trailing slash", () => {
  expect(reverseResolveAlias("/a/b/c/", { "~lib": "/a/b/c" })).toEqual([
    "~lib/",
  ]);
});

it("[boundary-1] path equal to a target written with a backslash trailing separator", () => {
  expect(reverseResolveAlias("/root\\", { "@": "/root" })).toEqual(["@/"]);
});

it("[boundary-1] path equal to the root-directory target", () => {
  expect(reverseResolveAlias("/", { "~": "/" })).toEqual([join("~", "")]);
});

it("[boundary-1] path equal to a target, key ending in a slash", () => {
  expect(reverseResolveAlias("/src", { "~/": "/src" })).toEqual([
    join("~/", ""),
  ]);
});

// extends public "[boundary-2] results of equal length keep insertion order"
it("[boundary-2] many equal-length results keep insertion order", () => {
  expect(
    reverseResolveAlias("/x/f", {
      "@c": "/x",
      "@a": "/x",
      "@d": "/x",
      "@b": "/x",
    }),
  ).toEqual(["@c/f", "@a/f", "@d/f", "@b/f"]);
});

// extends public "[boundary-2] results of equal length put keys with more segments first"
it("[boundary-2] equal-length results ordered by key segment count across three keys", () => {
  expect(
    reverseResolveAlias("/x/f", { abcde: "/x", "ab/cd": "/x", "a/b/c": "/x" }),
  ).toEqual(["a/b/c/f", "ab/cd/f", "abcde/f"]);
});

it("[boundary-2] equal-length results from different targets keep normalised order", () => {
  expect(reverseResolveAlias("/x/y/f", { "#ab": "/x/y", "@": "/x" })).toEqual([
    "#ab/f",
    "@/y/f",
  ]);
  expect(reverseResolveAlias("/x/y/f", { "@": "/x", "#ab": "/x/y" })).toEqual([
    "@/y/f",
    "#ab/f",
  ]);
});

it("[boundary-2] ties are kept in order while a longer result still comes first", () => {
  expect(
    reverseResolveAlias("/x/sub/f", {
      "@zz": "/x/sub",
      "@b": "/x",
      "@a": "/x",
    }),
  ).toEqual(["@b/sub/f", "@a/sub/f", "@zz/f"]);
});

// extends public "[boundary-3] identical results from different aliases are both kept"
it("[boundary-3] identical results are kept alongside a longer distinct result", () => {
  expect(
    reverseResolveAlias("/src/a", { "~": "/src", "~/": "/src", "@": "/" }),
  ).toEqual(["@/src/a", "~/a", "~/a"]);
});

// extends public "[boundary-3] identical results from targets with and without a trailing slash are both kept"
it("[boundary-3] identical results from keys that join to the same string", () => {
  expect(reverseResolveAlias("/x/f", { "a/b": "/x", "a/./b": "/x" })).toEqual([
    "a/b/f",
    "a/b/f",
  ]);
});

it("[boundary-3] identical exact-match results are both kept", () => {
  expect(reverseResolveAlias("/src", { "~": "/src", "~/": "/src" })).toEqual([
    join("~/", ""),
    join("~", ""),
  ]);
});

// extends public "[boundary-4] duplicate slashes and dot segments collapse"
it("[boundary-4] more duplicate slashes and dot segments collapse", () => {
  const aliases = { "@": "/root" };
  expect(reverseResolveAlias("/root///a//b", aliases)).toEqual(["@/a/b"]);
  expect(reverseResolveAlias("/root/./a", aliases)).toEqual(["@/a"]);
  expect(reverseResolveAlias("/root/a/b/../../c", aliases)).toEqual(["@/c"]);
  expect(reverseResolveAlias("\\root\\a\\.\\b", aliases)).toEqual(["@/a/b"]);
});

// extends public "[boundary-4] a trailing slash in the remainder is kept"
it("[boundary-4] a trailing slash on a deeper remainder is kept", () => {
  expect(reverseResolveAlias("/root/a/b/", { "@": "/root" })).toEqual([
    "@/a/b/",
  ]);
  expect(reverseResolveAlias("C:\\src\\dir\\", { "~win": "C:/src" })).toEqual([
    "~win/dir/",
  ]);
});

it("[boundary-4] results equal pathe's join of key and remainder", () => {
  const aliases = { "@": "/root", "~/": "/root/x" };
  expect(reverseResolveAlias("/root/x//y/../z", aliases)).toEqual([
    join("@", "/x//y/../z"),
    join("~/", "//y/../z"),
  ]);
  expect(join("@", "/x//y/../z")).toBe("@/x/z");
  expect(join("~/", "//y/../z")).toBe("~/z");
});

it("[boundary-4] sorting uses the normalised result length", () => {
  // raw remainder for "@" is "/a/./././b" (long) but the joined result "@/a/b" is short
  expect(
    reverseResolveAlias("/r/a/./././b", { "@": "/r", "#abcdef": "/r/a" }),
  ).toEqual(["#abcdef/b", "@/a/b"]);
});

// extends public "[boundary-5] target with a trailing slash matches paths below it and itself"
it("[boundary-5] deeper target with a trailing slash matches paths below it and itself", () => {
  const aliases = { "#": "/a/b/" };
  expect(reverseResolveAlias("/a/b/c/d", aliases)).toEqual(["#/c/d"]);
  expect(reverseResolveAlias("/a/b/", aliases)).toEqual(["#"]);
  expect(reverseResolveAlias("/a/b//", aliases)).toEqual(["#/"]);
});

// extends public "[boundary-5] target with a trailing slash does not match without the slash or on a string prefix"
it("[boundary-5] deeper target with a trailing slash rejects the bare and prefixed forms", () => {
  const aliases = { "#": "/a/b/" };
  expect(reverseResolveAlias("/a/b", aliases)).toEqual([]);
  expect(reverseResolveAlias("/a/bc/d", aliases)).toEqual([]);
  expect(reverseResolveAlias("/a/bc", aliases)).toEqual([]);
});

it("[boundary-5] trailing-slash target alongside a plain target", () => {
  const aliases = { "@x": "/src/", "@": "/" };
  expect(reverseResolveAlias("/src", aliases)).toEqual(["@/src"]);
  expect(reverseResolveAlias("/src/", aliases)).toEqual(["@/src/", "@x"]);
  expect(reverseResolveAlias("/src/k", aliases)).toEqual(["@/src/k", "@x/k"]);
});

it("[boundary-5] backslash input path against a trailing-slash target", () => {
  const aliases = { "@x": "/src/" };
  expect(reverseResolveAlias("\\src\\foo", aliases)).toEqual(["@x/foo"]);
  expect(reverseResolveAlias("\\src\\", aliases)).toEqual(["@x"]);
  expect(reverseResolveAlias("\\src", aliases)).toEqual([]);
});

// extends public "[boundary-6] aliases object is unchanged after the call"
it("[boundary-6] aliases object with a resolution chain is unchanged", () => {
  const aliases = { "@": "/root", "~": "@/src", "a/b/c": "@/src/deep" };
  expect(reverseResolveAlias("/root/src/deep/f", aliases)).toEqual([
    "@/src/deep/f",
    "~/deep/f",
    "a/b/c/f",
  ]);
  expect(aliases).toEqual({
    "@": "/root",
    "~": "@/src",
    "a/b/c": "@/src/deep",
  });
  expect(Object.keys(aliases)).toEqual(["@", "~", "a/b/c"]);
  expect(Object.getOwnPropertySymbols(aliases)).toEqual([]);
});

// extends public "[boundary-6] aliases object is unchanged when normalisation reorders keys and resolves values"
it("[boundary-6] frozen aliases object works and stays unchanged", () => {
  const aliases = Object.freeze({ "@": "/root", "x/y": "@/sub" });
  expect(reverseResolveAlias("/root/sub/f", aliases)).toEqual([
    "@/sub/f",
    "x/y/f",
  ]);
  expect(aliases).toEqual({ "@": "/root", "x/y": "@/sub" });
  expect(Object.keys(aliases)).toEqual(["@", "x/y"]);
});

it("[boundary-6] repeated calls with the same aliases give the same result", () => {
  const aliases = { "@b": "/x", "@a": "/x", "x/y": "@b/sub" };
  const first = reverseResolveAlias("/x/sub/q", aliases);
  const second = reverseResolveAlias("/x/sub/q", aliases);
  expect(first).toEqual(["@b/sub/q", "@a/sub/q", "x/y/q"]);
  expect(second).toEqual(first);
  expect(aliases).toEqual({ "@b": "/x", "@a": "/x", "x/y": "@b/sub" });
  expect(Object.keys(aliases)).toEqual(["@b", "@a", "x/y"]);
});

// --- @unhappy ---

// extends public "[unhappy-1] target that is only a string prefix of a segment does not match"
it("[unhappy-1] other string-prefix paths do not match", () => {
  const aliases = { "@": "/root" };
  expect(reverseResolveAlias("/rootfoo", aliases)).toEqual([]);
  expect(reverseResolveAlias("/root-a/b", aliases)).toEqual([]);
  expect(reverseResolveAlias("/root.ts", aliases)).toEqual([]);
  expect(reverseResolveAlias("/roo", aliases)).toEqual([]);
});

// extends public "[unhappy-1] only the alias ending at a segment boundary matches"
it("[unhappy-1] string prefix on a deeper target segment does not match", () => {
  expect(
    reverseResolveAlias("/root/srcx/a.ts", {
      "@": "/root",
      "@src": "/root/src",
    }),
  ).toEqual(["@/srcx/a.ts"]);
});

// extends public "[unhappy-2] no alias matches yields an empty array without throwing"
it("[unhappy-2] many aliases, none matching", () => {
  expect(
    reverseResolveAlias("/other/a", {
      "@": "/root",
      "~": "/src",
      "#": "/other/b",
      "x/y": "@/sub",
    }),
  ).toEqual([]);
});

it("[unhappy-2] an aliased path is not treated as a real path", () => {
  expect(reverseResolveAlias("@/foo", { "@": "/root" })).toEqual([]);
});

it("[unhappy-2] relative path does not match an absolute target", () => {
  expect(reverseResolveAlias("root/a", { "@": "/root" })).toEqual([]);
});

// extends public "[unhappy-2] empty path yields an empty array without throwing"
it("[unhappy-2] empty path with empty or root aliases yields an empty array", () => {
  expect(reverseResolveAlias("", {})).toEqual([]);
  expect(reverseResolveAlias("", { "~": "/" })).toEqual([]);
  expect(reverseResolveAlias("/", { "@": "/root" })).toEqual([]);
});

// extends public "[unhappy-3] a target written with backslashes does not match"
it("[unhappy-3] a target with a trailing backslash does not match", () => {
  expect(reverseResolveAlias("C:\\src\\a.ts", { "~win": "C:\\src\\" })).toEqual(
    [],
  );
  expect(reverseResolveAlias("/root/sub/a", { "@": "/root\\sub" })).toEqual([]);
});

// extends public "[unhappy-3] a target written with backslashes does not match a backslash input path either"
it("[unhappy-3] only the forward-slash target matches when both forms are given", () => {
  expect(
    reverseResolveAlias("C:\\src\\a.ts", { "~b": "C:\\src", "~f": "C:/src" }),
  ).toEqual(["~f/a.ts"]);
});

// extends public "[unhappy-4] different letter case does not match"
it("[unhappy-4] other letter-case differences do not match", () => {
  const aliases = { "@": "/root/Src" };
  expect(reverseResolveAlias("/ROOT/Src/a", aliases)).toEqual([]);
  expect(reverseResolveAlias("/root/src/a", aliases)).toEqual([]);
  expect(reverseResolveAlias("/root/SRC", aliases)).toEqual([]);
});

// extends public "[unhappy-4] only the alias with the exact letter case matches"
it("[unhappy-4] letter case in the remainder is preserved", () => {
  expect(reverseResolveAlias("/root/A/B.TS", { "@": "/root" })).toEqual([
    "@/A/B.TS",
  ]);
});

it("[unhappy-4] lower-case drive letter in a target never matches", () => {
  expect(reverseResolveAlias("C:/src/a", { "~": "c:/src" })).toEqual([]);
  expect(reverseResolveAlias("c:/src/a", { "~": "c:/src" })).toEqual([]);
});
