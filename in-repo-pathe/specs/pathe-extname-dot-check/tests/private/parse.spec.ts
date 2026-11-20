import { expect, it } from "vitest";

import { parse } from "../../src/_path";

// Rule: parse splits a trailing dot into ext and leaves the rest as name

it("[happy-3] parse splits a trailing dot into ext and leaves the rest as name", () => {
  expect(parse("dir/file.")).toEqual({
    root: "",
    dir: "dir",
    base: "file.",
    ext: ".",
    name: "file",
  });
});

// Extends "[happy-3] parse splits a trailing dot into ext and leaves the rest as name":
// a bare name, a deep absolute path, a Windows path.
it("[happy-3] parse splits a trailing dot for a bare name, a deep absolute path and a Windows path", () => {
  expect(parse("file.")).toEqual({
    root: "",
    dir: ".",
    base: "file.",
    ext: ".",
    name: "file",
  });
  expect(parse("/a/b/c/name.")).toEqual({
    root: "/",
    dir: "/a/b/c",
    base: "name.",
    ext: ".",
    name: "name",
  });
  expect(parse(String.raw`C:\temp\file.`)).toEqual({
    root: "C:/",
    dir: "C:/temp",
    base: "file.",
    ext: ".",
    name: "file",
  });
});

// Extends "[happy-3] parse of an absolute path ending in a dot keeps ext "." and name consistent with base":
// several trailing dots, all-dot bases and dotfiles: name is base minus exactly one dot.
it("[happy-3] parse keeps name equal to base minus one dot for multiple trailing dots and dotfiles", () => {
  const twoDots = parse("/a/b/c.txt..");
  expect(twoDots.base).toBe("c.txt..");
  expect(twoDots.ext).toBe(".");
  expect(twoDots.name).toBe("c.txt.");

  const threeDots = parse("dir/...");
  expect(threeDots.base).toBe("...");
  expect(threeDots.ext).toBe(".");
  expect(threeDots.name).toBe("..");

  const dotfile = parse("foo/.bar.");
  expect(dotfile.base).toBe(".bar.");
  expect(dotfile.ext).toBe(".");
  expect(dotfile.name).toBe(".bar");

  const multi = parse("x.tar.gz.");
  expect(multi.ext).toBe(".");
  expect(multi.name).toBe("x.tar.gz");
});

// Rule: parse of a path whose base is ".." has an empty ext

it('[boundary-6] parse of "/home/.." has an empty ext after a parse that split a trailing dot', () => {
  expect(parse("/home/file.").ext).toBe(".");
  expect(parse("/home/..")).toEqual({
    root: "/",
    dir: "/home",
    base: "..",
    ext: "",
    name: "..",
  });
});

// Extends "[boundary-6] parse of a relative path whose base is ".." has an empty ext and name "..""
// deeper, root-level, bare and Windows paths. extname of each full path is ".", so an
// implementation that takes ext from the whole path instead of from base fails here.
it('[boundary-6] parse gives an empty ext and name ".." for deep, root-level, bare and Windows ".." paths', () => {
  expect(parse("a/b/c/x.").ext).toBe(".");
  expect(parse("a/b/c/..")).toEqual({
    root: "",
    dir: "a/b/c",
    base: "..",
    ext: "",
    name: "..",
  });
  expect(parse("/..")).toEqual({
    root: "/",
    dir: "/",
    base: "..",
    ext: "",
    name: "..",
  });
  expect(parse("..")).toEqual({
    root: "",
    dir: ".",
    base: "..",
    ext: "",
    name: "..",
  });
  expect(parse(String.raw`C:\temp\..`)).toEqual({
    root: "C:/",
    dir: "C:/temp",
    base: "..",
    ext: "",
    name: "..",
  });
  const parent = parse("../..");
  expect(parent.base).toBe("..");
  expect(parent.ext).toBe("");
  expect(parent.name).toBe("..");
});

// Rule: parse of a path whose base is "." has an empty ext

it('[boundary-9] parse of "foo/." has an empty ext after a parse that split a trailing dot', () => {
  expect(parse("foo/file.").ext).toBe(".");
  expect(parse("foo/.")).toEqual({
    root: "",
    dir: "foo",
    base: ".",
    ext: "",
    name: ".",
  });
});

// Extends "[boundary-9] parse of an absolute path whose base is "." has an empty ext and name "."":
// deeper, bare, "./." and Windows paths. extname of each full path (other than ".") is ".",
// so an implementation that takes ext from the whole path fails here.
it('[boundary-9] parse gives an empty ext and name "." for deep, bare, "./." and Windows "." paths', () => {
  expect(parse("a/b/c/x.").ext).toBe(".");
  expect(parse("a/b/c/.")).toEqual({
    root: "",
    dir: "a/b/c",
    base: ".",
    ext: "",
    name: ".",
  });
  expect(parse(".")).toEqual({
    root: "",
    dir: ".",
    base: ".",
    ext: "",
    name: ".",
  });
  expect(parse(String.raw`C:\temp\.`)).toEqual({
    root: "C:/",
    dir: "C:/temp",
    base: ".",
    ext: "",
    name: ".",
  });
  const dotDot = parse("./.");
  expect(dotDot.base).toBe(".");
  expect(dotDot.ext).toBe("");
  expect(dotDot.name).toBe(".");
});
