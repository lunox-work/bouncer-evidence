import { expect, it } from "vitest";

import { resolveAlias, reverseResolveAlias } from "../src/utils";

// --- @happy ---

it("[happy-1] single alias, path below its target", () => {
  expect(reverseResolveAlias("/root/foo", { "@": "/root" })).toEqual(["@/foo"]);
});

it("[happy-1] single alias, deeply nested path below its target", () => {
  expect(reverseResolveAlias("/root/a/b/c.ts", { "@": "/root" })).toEqual([
    "@/a/b/c.ts",
  ]);
});

it("[happy-2] reverse of resolveAlias for a simple alias", () => {
  const aliases = { "@": "/root" };
  expect(resolveAlias("@/foo", aliases)).toBe("/root/foo");
  expect(reverseResolveAlias("/root/foo", aliases)).toContain("@/foo");
});

it("[happy-2] reverse of resolveAlias for an alias key ending in a slash", () => {
  const aliases = { "~/": "/src" };
  expect(resolveAlias("~/foo/bar", aliases)).toBe("/src/foo/bar");
  expect(reverseResolveAlias("/src/foo/bar", aliases)).toContain("~/foo/bar");
});

it("[happy-3] alias key ending in a slash", () => {
  expect(reverseResolveAlias("/src/foo", { "~/": "/src" })).toEqual(["~/foo"]);
});

it("[happy-3] alias whose target is the root directory", () => {
  expect(reverseResolveAlias("/root/a", { "~": "/" })).toEqual(["~/root/a"]);
});

it("[happy-4] two aliases match and the longer result comes first", () => {
  expect(
    reverseResolveAlias("/root/src/a.ts", { "@": "/root", "@src": "/root/src" }),
  ).toEqual(["@/src/a.ts", "@src/a.ts"]);
});

it("[happy-4] two aliases match when the path equals the more specific target", () => {
  expect(
    reverseResolveAlias("/root/src", { "@": "/root", "@src": "/root/src" }),
  ).toEqual(["@/src", "@src"]);
});

it("[happy-5] exact match and prefix match together", () => {
  expect(
    reverseResolveAlias("/root/a", { "@": "/root", "#": "/root/a" }),
  ).toEqual(["@/a", "#"]);
});

it("[happy-5] only the prefix match when the other target is a mere string prefix", () => {
  expect(
    reverseResolveAlias("/root/ab", { "@": "/root", "#": "/root/a" }),
  ).toEqual(["@/ab"]);
});

it("[happy-6] alias values are resolved against each other before matching", () => {
  expect(
    reverseResolveAlias("/root/bingpot/index.ts", {
      "@": "/root",
      bingpot: "@/bingpot/index.ts",
    }),
  ).toEqual(["@/bingpot/index.ts", "bingpot"]);
});

it("[happy-6] the unresolved raw alias value is not itself a target", () => {
  expect(
    reverseResolveAlias("@/bingpot/index.ts", {
      "@": "/root",
      bingpot: "@/bingpot/index.ts",
    }),
  ).toEqual([]);
});

it("[happy-7] backslash input paths match forward-slash targets", () => {
  expect(reverseResolveAlias("C:\\src\\a.ts", { "~win": "C:/src" })).toEqual([
    "~win/a.ts",
  ]);
  expect(reverseResolveAlias("/root\\a", { "@": "/root" })).toEqual(["@/a"]);
});

it("[happy-7] lower-case drive letter input path matches an upper-case target", () => {
  expect(reverseResolveAlias("c:\\src\\a.ts", { "~win": "C:/src" })).toEqual([
    "~win/a.ts",
  ]);
});

// --- @boundary ---

it("[boundary-1] path equal to a target yields the key on its own", () => {
  expect(reverseResolveAlias("/root", { "@": "/root" })).toEqual(["@"]);
});

it("[boundary-1] path equal to a target plus a trailing slash keeps the slash", () => {
  expect(reverseResolveAlias("/root/", { "@": "/root" })).toEqual(["@/"]);
});

it("[boundary-2] results of equal length keep insertion order", () => {
  expect(reverseResolveAlias("/x/f", { "@a": "/x", "@b": "/x" })).toEqual([
    "@a/f",
    "@b/f",
  ]);
  expect(reverseResolveAlias("/x/f", { "@b": "/x", "@a": "/x" })).toEqual([
    "@b/f",
    "@a/f",
  ]);
});

it("[boundary-2] results of equal length put keys with more segments first", () => {
  expect(reverseResolveAlias("/x/f", { abc: "/x", "a/b": "/x" })).toEqual([
    "a/b/f",
    "abc/f",
  ]);
});

it("[boundary-3] identical results from different aliases are both kept", () => {
  expect(reverseResolveAlias("/src/a", { "~": "/src", "~/": "/src" })).toEqual([
    "~/a",
    "~/a",
  ]);
});

it("[boundary-3] identical results from targets with and without a trailing slash are both kept", () => {
  expect(
    reverseResolveAlias("/src/a", { "~": "/src", "~/": "/src/" }),
  ).toEqual(["~/a", "~/a"]);
});

it("[boundary-4] duplicate slashes and dot segments collapse", () => {
  const aliases = { "@": "/root" };
  expect(reverseResolveAlias("/root//a", aliases)).toEqual(["@/a"]);
  expect(reverseResolveAlias("/root/a/./b/../c", aliases)).toEqual(["@/a/c"]);
});

it("[boundary-4] a trailing slash in the remainder is kept", () => {
  expect(reverseResolveAlias("/root/dir/", { "@": "/root" })).toEqual([
    "@/dir/",
  ]);
});

it("[boundary-5] target with a trailing slash matches paths below it and itself", () => {
  const aliases = { "@x": "/src/" };
  expect(reverseResolveAlias("/src/foo", aliases)).toEqual(["@x/foo"]);
  expect(reverseResolveAlias("/src/", aliases)).toEqual(["@x"]);
});

it("[boundary-5] target with a trailing slash does not match without the slash or on a string prefix", () => {
  const aliases = { "@x": "/src/" };
  expect(reverseResolveAlias("/src", aliases)).toEqual([]);
  expect(reverseResolveAlias("/srcx/a", aliases)).toEqual([]);
});

it("[boundary-6] aliases object is unchanged after the call", () => {
  const aliases = { "@b": "/x", "@a": "/x" };
  reverseResolveAlias("/x/y", aliases);
  expect(aliases).toEqual({ "@b": "/x", "@a": "/x" });
  expect(Object.keys(aliases)).toEqual(["@b", "@a"]);
});

it("[boundary-6] aliases object is unchanged when normalisation reorders keys and resolves values", () => {
  const aliases = { "@": "/root", "x/y": "@/sub" };
  expect(reverseResolveAlias("/root/sub/f", aliases)).toEqual([
    "@/sub/f",
    "x/y/f",
  ]);
  expect(aliases).toEqual({ "@": "/root", "x/y": "@/sub" });
  expect(Object.keys(aliases)).toEqual(["@", "x/y"]);
});

// --- @unhappy ---

it("[unhappy-1] target that is only a string prefix of a segment does not match", () => {
  expect(reverseResolveAlias("/rootfoo/a", { "@": "/root" })).toEqual([]);
});

it("[unhappy-1] only the alias ending at a segment boundary matches", () => {
  expect(
    reverseResolveAlias("/rootfoo/a", { "@": "/root", "#": "/rootfoo" }),
  ).toEqual(["#/a"]);
});

it("[unhappy-2] no alias matches yields an empty array without throwing", () => {
  expect(() => reverseResolveAlias("/other/a", { "@": "/root" })).not.toThrow();
  expect(reverseResolveAlias("/other/a", { "@": "/root" })).toEqual([]);
  expect(() => reverseResolveAlias("/root/a", {})).not.toThrow();
  expect(reverseResolveAlias("/root/a", {})).toEqual([]);
});

it("[unhappy-2] empty path yields an empty array without throwing", () => {
  expect(() => reverseResolveAlias("", { "@": "/root" })).not.toThrow();
  expect(reverseResolveAlias("", { "@": "/root" })).toEqual([]);
});

it("[unhappy-3] a target written with backslashes does not match", () => {
  expect(reverseResolveAlias("C:/src/a.ts", { "~win": "C:\\src" })).toEqual([]);
});

it("[unhappy-3] a target written with backslashes does not match a backslash input path either", () => {
  expect(reverseResolveAlias("C:\\src\\a.ts", { "~win": "C:\\src" })).toEqual(
    [],
  );
});

it("[unhappy-4] different letter case does not match", () => {
  expect(reverseResolveAlias("/Root/a", { "@": "/root" })).toEqual([]);
});

it("[unhappy-4] only the alias with the exact letter case matches", () => {
  expect(
    reverseResolveAlias("/Root/a", { "@": "/root", "#": "/Root" }),
  ).toEqual(["#/a"]);
});
